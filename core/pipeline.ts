import { toCandidate } from "@/core/candidate";
import { getRepoSignals } from "@/core/github/signals";
import { getRepoIssues, getRepoOpenPRs, linkedPRCount } from "@/core/github/issues";
import { repoNamespaceFromUrl, searchIssues, type GhIssue } from "@/core/github/search";
import { fitsHardConstraints, hasNotReadyLabels, isPromising } from "@/core/github/filters";
import { scoutRepos, type ScoutResult } from "@/core/scout/scout";
import { rankCandidates } from "@/core/rank/rank";
import { scoreCandidate } from "@/core/score/readiness";
import { evaluateIssueWithJev } from "@/core/verify/jev";
import { llmConfigured } from "@/core/llm/adapter";
import { env } from "@/core/config/env";
import type { IssueCandidate, Profile, RankedCandidate } from "@/core/types";

/**
 * The orchestrator.
 *
 *   S1  Repo Scout      profile → 3–5 reputable repositories
 *   S2  Core REST       those repos → live open, unassigned issues
 *   S3  Verify & Score  signals + competing PRs → ReadinessScore
 *   S4  Rank            tier-weighted, deterministic
 *
 * Gemma Jev is limited to the top three candidates; guide generation remains a
 * separate call after selection.
 */

export interface MatchResult {
  candidates: RankedCandidate[];
  scout: ScoutResult;
}

const REPOS_TO_SCOUT = 3;
const ISSUES_PER_REPO = 6;
const LIVE_SEARCH_REPOS = 6;

function liveDiscoveryQueries(profile: Profile): string[] {
  const languages = profile.stack.map((s) => s.tech.replace(/[^a-zA-Z0-9+#.-]/g, "")).filter(Boolean);
  const queries: string[] = [];

  const validInterests = profile.interests
    .map((i) => i.replace(/[^a-zA-Z0-9+#.-]/g, " ").trim())
    .filter((i) => i && !/^not sure(?: open to anything)?$/i.test(i))
    .slice(0, 4);

  // Generate targeted live discovery queries across distinct interests and user stack languages
  for (let idx = 0; idx < validInterests.length; idx++) {
    const rawInterest = validInterests[idx];
    const cleanedInterest = rawInterest.replace(/[/,&|]+/g, " ").trim();
    // Rotate across languages in user's stack instead of locking onto only the first language
    const lang = languages.length > 0 ? languages[idx % languages.length] : "";
    const langFilter = lang ? ` language:${lang}` : "";
    queries.push(`is:issue is:open no:assignee "${cleanedInterest}"${langFilter}`);
  }

  // Also include a focused query targeting beginner-friendly labels for the primary interest
  if (validInterests.length > 0) {
    const primary = validInterests[0].replace(/[/,&|]+/g, " ").trim();
    queries.push(`is:issue is:open no:assignee label:"good first issue","help wanted" "${primary}"`);
  } else {
    const lang = languages[0] ? ` language:${languages[0]}` : "";
    queries.push(`is:issue is:open no:assignee label:"good first issue","help wanted",beginner${lang}`);
  }

  return [...new Set(queries)].slice(0, 4);
}

async function discoverOutsideRegistry(profile: Profile, knownRepos: Set<string>): Promise<IssueCandidate[]> {
  const queries = liveDiscoveryQueries(profile);
  const queriesToRun = env.githubToken() ? queries : queries.slice(0, 2);

  const hits: GhIssue[] = [];
  for (const query of queriesToRun) {
    if (!query) continue;
    try {
      hits.push(...(await searchIssues(query, 25)));
    } catch {
      // Search is supplemental; curated results remain available on quota/network failures.
    }
  }

  const byRepo = new Map<string, GhIssue[]>();
  const seenIssues = new Set<string>();
  for (const issue of hits) {
    if (
      issue.state !== "open" ||
      issue.assignee ||
      (issue.assignees?.length ?? 0) > 0 ||
      !isPromising(issue) ||
      hasNotReadyLabels(issue)
    ) {
      continue;
    }
    const repo = repoNamespaceFromUrl(issue.repository_url);
    if (!/^[A-Za-z0-9_-][\w.-]*\/[A-Za-z0-9_-][\w.-]*$/.test(repo) || knownRepos.has(repo.toLowerCase())) continue;
    const issueKey = `${repo.toLowerCase()}#${issue.number}`;
    if (seenIssues.has(issueKey)) continue;
    seenIssues.add(issueKey);
    const list = byRepo.get(repo) ?? [];
    if (list.length < 4) list.push(issue);
    byRepo.set(repo, list);
  }

  const selectedRepos = [...byRepo.keys()].slice(0, LIVE_SEARCH_REPOS);
  const candidates = await Promise.all(selectedRepos.map(async (repo) => {
    try {
      const [signals, pullsResult] = await Promise.all([
        getRepoSignals(repo),
        getRepoOpenPRs(repo).catch(() => null),
      ]);
      return (byRepo.get(repo) ?? []).map((issue) =>
        toCandidate(issue, repo, signals, pullsResult ? linkedPRCount(pullsResult, issue.number) : null),
      ).filter((candidate) => fitsHardConstraints(candidate, profile));
    } catch {
      return [];
    }
  }));
  return candidates.flat();
}

async function candidatesForRepo(fullName: string, profile: Profile): Promise<IssueCandidate[]> {
  const [issues, signals, pullsResult] = await Promise.all([
    getRepoIssues(fullName),
    getRepoSignals(fullName),
    getRepoOpenPRs(fullName).catch(() => null),
  ]);

  return issues
    .filter(isPromising)
    .map((issue) =>
      toCandidate(issue, fullName, signals, pullsResult ? linkedPRCount(pullsResult, issue.number) : null),
    )
    .filter((candidate) => candidate.state === "open" && fitsHardConstraints(candidate, profile))
    .slice(0, ISSUES_PER_REPO);
}

export async function runMatch(profile: Profile, limit = 10): Promise<MatchResult> {
  const scout = await scoutRepos(profile, REPOS_TO_SCOUT);
  const registryRepos = new Set(scout.repos.map(({ fullName }) => fullName.toLowerCase()));

  const batches = await Promise.all(
    scout.repos.map(async ({ fullName }) => {
      try {
        return await candidatesForRepo(fullName, profile);
      } catch {
        // One hostile or unavailable repo must not sink the whole run.
        return [];
      }
    }),
  );

  const discovered = await discoverOutsideRegistry(profile, registryRepos);
  // Only push repos that actually contributed at least one kept candidate
  const discoveredReposWithHits = new Set(discovered.map((c) => c.repo.toLowerCase()));
  for (const candidate of discovered) {
    const repoLower = candidate.repo.toLowerCase();
    if (discoveredReposWithHits.has(repoLower) && !registryRepos.has(repoLower)) {
      scout.repos.push({ fullName: candidate.repo, why: "Found by live GitHub issue search" });
      registryRepos.add(repoLower);
    }
  }
  if (discovered.length) scout.source = "hybrid";

  const curatedPool = batches.flat();
  let pool: RankedCandidate[];

  if (discovered.length > 0 && curatedPool.length > 0) {
    // 4:1 compositional ratio: ~80% live interest-tuned discovery, ~20% curated anchors
    const targetDiscovered = Math.max(1, Math.round(limit * 0.8));
    const targetCurated = Math.max(1, limit - targetDiscovered);

    const [rankedDiscovered, rankedCurated] = await Promise.all([
      rankCandidates(discovered, profile, discovered.length),
      rankCandidates(curatedPool, profile, curatedPool.length),
    ]);

    const chosenDiscovered = rankedDiscovered.slice(0, targetDiscovered);
    const chosenCurated = rankedCurated.slice(0, targetCurated);

    // Mutual backfill if either pool has fewer candidates than its quota
    const slotsRemaining = limit - (chosenDiscovered.length + chosenCurated.length);
    if (slotsRemaining > 0) {
      if (chosenDiscovered.length < targetDiscovered) {
        const extraCurated = rankedCurated.slice(chosenCurated.length, chosenCurated.length + slotsRemaining);
        chosenCurated.push(...extraCurated);
      } else if (chosenCurated.length < targetCurated) {
        const extraDiscovered = rankedDiscovered.slice(chosenDiscovered.length, chosenDiscovered.length + slotsRemaining);
        chosenDiscovered.push(...extraDiscovered);
      }
    }

    pool = [...chosenDiscovered, ...chosenCurated];
  } else {
    const rawPool = discovered.length > 0 ? discovered : curatedPool;
    pool = await rankCandidates(rawPool, profile, limit);
  }

  // Deterministic scoring narrows model work to three candidates per request.
  if (llmConfigured() && pool.length) {
    const shortlist = pool.slice(0, Math.min(3, pool.length));
    const decisions = await Promise.all(shortlist.map((candidate) =>
      evaluateIssueWithJev(candidate, candidate.signals).catch(() => undefined),
    ));
    decisions.forEach((decision, index) => {
      if (decision) {
        shortlist[index].jevDecision = decision;
        shortlist[index].score = scoreCandidate(shortlist[index], profile, { jev: decision });
      }
    });
  }

  pool.sort((a, b) => b.score.total - a.score.total || a.number - b.number);
  return { candidates: pool.slice(0, limit), scout };
}
