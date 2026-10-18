import type { IssueCandidate, Profile } from "@/core/types";
import { labelNames, type GhIssue } from "./search";
import { daysSince } from "@/core/score/readiness";
import { effortFromLabels } from "@/core/format/effort";

/**
 * Unified quality gates and candidate filtering.
 *
 * Ensures all three discovery paths (/match registry, /match live-search,
 * and /verify org/repo discovery) apply identical standards.
 */

const NOT_READY_PATTERN =
  /^(?:status[-_ :]*)?(?:needs?|awaiting|waiting)(?:[-_ :]+for)?[-_ :]+(?:triage|info|author|maintainer|decision|discussion|review|feedback|clarification|work|update|repro|design)|^(?:status[-_ :]+)?(?:awaiting[-_ :]+triage|triage|blocked)|^in[-_ ]*progress|^(?:blocked|on[- ]hold|wip|work[- ]in[- ]progress|do[- ]not[- ]merge|don't[- ]merge|draft|archived|wont[- ]?fix|invalid|duplicate|claimed)$/i;

/** Labels indicating an issue is not ready for external contribution. */
export function isNotReadyLabel(rawLabel: string): boolean {
  const label = rawLabel.trim().toLowerCase();
  return NOT_READY_PATTERN.test(label);
}

/** Check if an issue has any not-ready label. */
export function hasNotReadyLabels(issue: GhIssue): boolean {
  return issue.labels.some((l) => {
    const name = typeof l === "string" ? l : l.name ?? "";
    return isNotReadyLabel(name);
  });
}

const STALE_DAYS = 240;
const CROWDED_COMMENTS = 25;

/**
 * Unified pre-filter before expensive signal and PR verification.
 * Rejects pull requests, assigned issues, triage/blocker labels, stale activity,
 * and crowded discussions. Accepts beginner-tagged or well-described issues.
 */
export function isPromising(issue: GhIssue): boolean {
  if (issue.pull_request) return false;
  if (issue.assignee || (issue.assignees?.length ?? 0) > 0) return false;
  if (hasNotReadyLabels(issue)) return false;
  if (daysSince(issue.updated_at) > STALE_DAYS) return false;
  if ((issue.comments ?? 0) > CROWDED_COMMENTS) return false;

  const labels = labelNames(issue).map((l) => l.toLowerCase());
  const beginner = labels.some((l) =>
    /good first issue|help wanted|beginner|easy|starter|first[- ]timers/i.test(l),
  );
  const described = (issue.body?.length ?? 0) > 120;

  return beginner || described;
}

/**
 * Hard user profile constraints filter.
 */
export function fitsHardConstraints(candidate: IssueCandidate, profile: Profile): boolean {
  const { constraints } = profile;
  if (constraints.requireCI && !candidate.signals.hasCI) return false;
  if (
    constraints.license?.length &&
    (!candidate.signals.license ||
      !constraints.license.some(
        (license) => license.toLowerCase() === candidate.signals.license?.toLowerCase(),
      ))
  ) {
    return false;
  }
  if (constraints.maxRepoSize === "small" && candidate.signals.sizeKb > 100_000) return false;
  if (constraints.maxRepoSize === "medium" && candidate.signals.sizeKb > 1_000_000) return false;

  const size = candidate.sizeHint;
  if (profile.issueSize === "tiny" && size !== "tiny") return false;
  if (profile.issueSize === "small" && effortFromLabels(candidate.labels) === "large") return false;
  if (
    profile.timeBudget === "under-1h" &&
    ["medium", "large"].includes(effortFromLabels(candidate.labels))
  ) {
    return false;
  }
  return true;
}
