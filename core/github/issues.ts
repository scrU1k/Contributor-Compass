import { gh } from "./client";
import { cached } from "@/core/cache/cache";
import type { GhIssue } from "./search";
import { isPromising } from "./filters";

/**
 * Stage 2: targeted issue retrieval over GitHub's Core REST API.
 *
 * Why not the Search API: search is capped at 30 requests/minute authenticated,
 * which is easy to hit mid-demo. Listing one repo's open issues is Core REST and
 * runs at 5,000 requests/hour. Walking a short list of known-good repos is both
 * faster and far harder to rate-limit.
 */

const TTL_MS = 20 * 60 * 1000;

export interface GhPullRef {
  number: number;
  title: string;
  body: string | null;
}

export async function getRepoIssues(fullName: string): Promise<GhIssue[]> {
  return cached(`issues:v4:${fullName}`, TTL_MS, async () => {
    const items = await gh<GhIssue[]>(
      `/repos/${fullName}/issues?state=open&sort=updated&direction=desc&per_page=100`,
    );
    return items.filter(isPromising);
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
    for (let page = 1; page <= 2; page++) {
      const pulls = await gh<GhPullRef[]>(
        `/repos/${fullName}/pulls?state=open&per_page=100&page=${page}`,
      );
      collected.push(...pulls);
      if (pulls.length < 100) break;
      if (page === 2) complete = false;
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
  const reference = new RegExp(
    `(?:(?:[\\w.-]+\\/[\\w.-]+)?#${escaped}(?!\\d)|/issues/${escaped}(?!\\d)|\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${escaped}(?!\\d)|\\bgh-${escaped}(?!\\d))`,
    "i",
  );
  return pulls.filter((p) => reference.test(`${p.title} ${p.body ?? ""}`)).length;
}
