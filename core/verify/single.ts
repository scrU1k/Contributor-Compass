import { getIssue } from "@/core/github/search";
import { getRepoSignals } from "@/core/github/signals";
import { getRepoOpenPRs, linkedPRCount } from "@/core/github/issues";
import { toCandidate } from "@/core/candidate";
import { scoreCandidate } from "@/core/score/readiness";
import { explainDeterministic } from "@/core/rank/rank";
import { evaluateIssueWithJev } from "@/core/verify/jev";
import { llmConfigured } from "@/core/llm/adapter";
import type { Profile, RankedCandidate } from "@/core/types";

/**
 * Verify a single GitHub issue directly by fetching its exact live state,
 * repository signals, open PR conflicts, and running the Gemma 4 Jev harness.
 *
 * Shared between /api/verify and the CLI to eliminate divergence.
 */
export async function verifySingleIssue(
  repo: string,
  issueNumber: number,
  profile: Profile,
): Promise<RankedCandidate> {
  const [issue, signals, pullsResult] = await Promise.all([
    getIssue(repo, issueNumber),
    getRepoSignals(repo),
    getRepoOpenPRs(repo).catch(() => null),
  ]);

  if (issue.state !== "open") {
    throw new Error(`Issue ${repo}#${issueNumber} is closed, so it is not available to start.`);
  }

  const candidate = toCandidate(
    issue,
    repo,
    signals,
    pullsResult ? linkedPRCount(pullsResult, issueNumber) : null,
  );

  const jev = llmConfigured()
    ? await evaluateIssueWithJev(candidate, signals).catch(() => undefined)
    : undefined;

  const scored: RankedCandidate = {
    ...candidate,
    score: scoreCandidate(candidate, profile, { ignoreFit: true, jev }),
    why: "",
    jevDecision: jev,
  };
  scored.why = jev?.evidence || explainDeterministic(scored, profile);

  return scored;
}
