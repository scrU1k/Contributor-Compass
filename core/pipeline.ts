import { toCandidate } from "@/core/candidate";
import { getRepoSignals } from "@/core/github/signals";
import { getRepoIssues, getRepoOpenPRs, linkedPRCount } from "@/core/github/issues";
import { repoNamespaceFromUrl, searchIssues, type GhIssue } from "@/core/github/search";
import { fitsHardConstraints, hasNotReadyLabels, isPromising } from "@/core/github/filters";
import { scoutRepos, type ScoutResult } from "@/core/scout/scout";
import { rankCandidates } from "@/core/rank/rank";
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
const LIVE_SEARCH_REPOS = 3;

function liveDiscoveryQueries(profile: Profile): string[] {
  const language = profile.stack[0]?.tech.replace(/[^a-zA-Z0-9+#.-]/g, "");
  const broad = `is:issue is:open no:assignee label:"good first issue","help wanted",beginner${language ? ` language:${language}` : ""}`;
  const term = (profile.interests[0] || profile.stack[0]?.tech || "").replace(/[^a-zA-Z0-9+#.-]/g, " ").trim();
  const focused = term && !/^not sure(?: open to anything)?$/i.test(term)
    ? `is:issue is:open no:assignee "${term}"${language ? ` language:${language}` : ""}`
    : "";
  return [...new Set([broad, focused].filter(Boolean))].slice(0, 2);
}

async function discoverOutsideRegistry(profile: Profile, knownRepos: Set<string>): Promise<IssueCandidate[]> {
  // Unauthenticated GitHub search is rate-limited to 10 req/min; protect users without tokens
  if (!env.githubToken()) return [];

  const hits: GhIssue[] = [];
  for (const query of liveDiscoveryQueries(profile)) {
    try {
      hits.push(...await searchIssues(query, 30));
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
  const pool = [...batches.flat(), ...discovered];
  // Deterministic scoring narrows model work to three candidates per request.
  if (llmConfigured() && pool.length) {
    const shortlist = await rankCandidates(pool, profile, Math.min(3, pool.length));
    const decisions = await Promise.all(shortlist.map((candidate) =>
      evaluateIssueWithJev(candidate, candidate.signals).catch(() => undefined),
    ));
    decisions.forEach((decision, index) => {
      if (decision) shortlist[index].jevDecision = decision;
    });
    const jevById = new Map(shortlist.map((candidate) => [`${candidate.repo}#${candidate.number}`, candidate.jevDecision]));
    for (const candidate of pool) {
      const decision = jevById.get(`${candidate.repo}#${candidate.number}`);
      if (decision) candidate.jevDecision = decision;
    }
  }
  const ranked = await rankCandidates(pool, profile, limit);
  return { candidates: ranked, scout };
}
