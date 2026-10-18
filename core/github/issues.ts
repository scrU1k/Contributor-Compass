import { gh } from "./client";
import { cached } from "@/core/cache/cache";
import type { GhIssue } from "./search";

/**
 * Stage 2: targeted issue retrieval over GitHub's Core REST API.
 *
 * Why not the Search API: search is capped at 30 requests/minute authenticated,
 * which is easy to hit mid-demo. Listing one repo's open issues is Core REST and
 * runs at 5,000 requests/hour. Walking a short list of known-good repos is both
 * faster and far harder to rate-limit.
 */

const TTL_MS = 2 * 60 * 1000;

export interface GhPullRef {
  number: number;
  title: string;
  body: string | null;
}

/** Labels that indicate an issue is NOT ready for a newcomer to pick up. */
const NOT_READY_LABELS = new Set([
  "needs triage",
  "needs discussion",
  "needs design",
  "needs author",
  "needs decision",
  "needs review",
  "needs feedback",
  "needs info",
  "needs clarification",
  "needs work",
  "needs update",
  "blocked",
  "on hold",
  "waiting for",
  "wip",
  "work in progress",
  "do not merge",
  "don't merge",
  "draft",
  "stale",
  "archived",
  "wontfix",
  "wont-fix",
  "invalid",
  "duplicate",
  "question",
]);

export async function getRepoIssues(fullName: string): Promise<GhIssue[]> {
  return cached(`issues:v4:${fullName}`, TTL_MS, async () => {
    const collected: GhIssue[] = [];
    // Bounded pagination: more coverage than a single page without allowing a
    // busy repository to consume an unbounded share of a request's quota.
    for (let page = 1; page <= 3; page++) {
      const items = await gh<GhIssue[]>(
        `/repos/${fullName}/issues?state=open&sort=updated&direction=desc&per_page=100&page=${page}`,
      );
      collected.push(...items);
      if (items.length < 100) break;
    }
    return collected.filter(
      (item) =>
        !item.pull_request &&
        !item.assignee &&
        (item.assignees?.length ?? 0) === 0 &&
        // Filter out issues with "not ready" labels
        !item.labels.some((l) => {
          const label = typeof l === "string" ? l.toLowerCase() : (l.name ?? "").toLowerCase();
          return NOT_READY_LABELS.has(label);
        }),
    );
  });
}

/**
 * Open pull requests for a repo, fetched once and reused for every issue.
 *
 * Competition used to cost one Search API call per issue. This costs one Core
 * REST call per repo, which is the difference between 12 search calls and zero.
 */
export async function getRepoOpenPRs(fullName: string): Promise<{ pulls: GhPullRef[]; complete: boolean }> {
  return cached(`openprs:v3:${fullName}`, TTL_MS, async () => {
    const collected: GhPullRef[] = [];
    let complete = true;
    for (let page = 1; page <= 5; page++) {
      const pulls = await gh<GhPullRef[]>(
        `/repos/${fullName}/pulls?state=open&per_page=100&page=${page}`,
      );
      collected.push(...pulls);
      if (pulls.length < 100) break;
      if (page === 5) complete = false;
    }
    return {
      pulls: collected.map((p) => ({ number: p.number, title: p.title ?? "", body: p.body ?? null })),
      complete,
    };
  });
}

export function linkedPRCount(result: { pulls: GhPullRef[]; complete: boolean }, issueNumber: number): number | null {
  const found = countPRsReferencing(result.pulls, issueNumber);
  return found > 0 || result.complete ? found : null;
}

/** How many open PRs explicitly reference this issue? (#123 in title or body) */
export function countPRsReferencing(pulls: GhPullRef[], issueNumber: number): number {
  const escaped = String(issueNumber).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reference = new RegExp(`(?:#${escaped}(?!\\d)|/issues/${escaped}(?!\\d)|\\bclose[sd]?\\s+#${escaped}(?!\\d))`, "i");
  return pulls.filter((p) => reference.test(`${p.title} ${p.body ?? ""}`)).length;
}
