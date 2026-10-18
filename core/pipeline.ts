import { toCandidate } from "@/core/candidate";
import { getRepoSignals } from "@/core/github/signals";
import { countPRsReferencing, getRepoIssues, getRepoOpenPRs } from "@/core/github/issues";
import { labelNames, type GhIssue } from "@/core/github/search";
import { scoutRepos, type ScoutResult } from "@/core/scout/scout";
import { daysSince } from "@/core/score/readiness";
import { rankCandidates } from "@/core/rank/rank";
import type { IssueCandidate, Profile, RankedCandidate } from "@/core/types";

/**
 * The orchestrator.
 *
 *   S1  Repo Scout      profile → 3–5 reputable repositories
 *   S2  Core REST       those repos → live open, unassigned issues
 *   S3  Verify & Score  signals + competing PRs → ReadinessScore
 *   S4  Rank            tier-weighted, deterministic
 *
 * "Explain" and "guide" are separate calls because they are the slow,
 * LLM-dependent stages — keeping them out of this path means the results page
 * never waits on a model.
 */

export interface MatchResult {
  candidates: RankedCandidate[];
  scout: ScoutResult;
}

const REPOS_TO_SCOUT = 5;
const ISSUES_PER_REPO = 5;
const STALE_DAYS = 240;
const CROWDED_COMMENTS = 25;

/**
 * Cheap pre-filter before we spend verification calls on an issue.
 * Prefer an explicit beginner label, but accept a well-described issue —
 * plenty of good projects never label anything.
 */
function isPromising(issue: GhIssue): boolean {
  if (daysSince(issue.updated_at) > STALE_DAYS) return false;
  if ((issue.comments ?? 0) > CROWDED_COMMENTS) return false;

  const labels = labelNames(issue).map((l) => l.toLowerCase());
  const beginner = labels.some((l) =>
    /good first issue|help wanted|beginner|easy|starter|first[- ]timers/.test(l),
  );
  const described = (issue.body?.length ?? 0) > 160;

  return beginner || described;
}

async function candidatesForRepo(fullName: string): Promise<IssueCandidate[]> {
  const [issues, signals, pulls] = await Promise.all([
    getRepoIssues(fullName),
    getRepoSignals(fullName),
    getRepoOpenPRs(fullName).catch(() => []),
  ]);

  return issues
    .filter(isPromising)
    .slice(0, ISSUES_PER_REPO)
    .map((issue) =>
      toCandidate(issue, fullName, signals, countPRsReferencing(pulls, issue.number)),
    );
}

export async function runMatch(profile: Profile, limit = 10): Promise<MatchResult> {
  const scout = await scoutRepos(profile, REPOS_TO_SCOUT);

  const batches = await Promise.all(
    scout.repos.map(async ({ fullName }) => {
      try {
        return await candidatesForRepo(fullName);
      } catch {
        // One hostile or unavailable repo must not sink the whole run.
        return [];
      }
    }),
  );

  const ranked = await rankCandidates(batches.flat(), profile, limit);
  return { candidates: ranked, scout };
}
