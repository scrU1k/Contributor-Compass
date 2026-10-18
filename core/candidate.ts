import { labelNames, type GhIssue } from "@/core/github/search";
import { sizeHintFromLabels } from "@/core/format/effort";
import type { IssueCandidate, RepoSignals } from "@/core/types";

/** Shared construction so the search path and the verify path agree exactly. */

export function toCandidate(
  issue: GhIssue,
  repo: string,
  signals: RepoSignals,
  linkedOpenPRs: number,
): IssueCandidate {
  const labels = labelNames(issue);
  const assigned = Boolean(issue.assignee) || (issue.assignees?.length ?? 0) > 0;

  return {
    repo,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    body: issue.body ?? "",
    labels,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    assigned,
    comments: issue.comments ?? 0,
    linkedOpenPRs,
    sizeHint: sizeHintFromLabels(labels),
    signals,
  };
}
