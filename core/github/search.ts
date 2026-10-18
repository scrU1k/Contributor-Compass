import { gh } from "./client";
import { cached, readCache } from "@/core/cache/cache";

/** Raw shapes we consume from the GitHub search API. Intentionally partial. */

export interface GhLabel {
  name?: string;
}

export interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  comments: number;
  labels: (GhLabel | string)[];
  assignee: { login?: string } | null;
  assignees?: { login?: string }[] | null;
  pull_request?: unknown;
  repository_url: string;
  locked?: boolean;
  user?: { login?: string };
}

interface SearchResult<T> {
  total_count: number;
  incomplete_results?: boolean;
  items: T[];
}

export function labelNames(issue: GhIssue): string[] {
  return issue.labels
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter((n): n is string => Boolean(n));
}

export function repoNamespaceFromUrl(repositoryUrl: string): string {
  // https://api.github.com/repos/owner/name  →  owner/name
  const parts = repositoryUrl.split("/repos/");
  return parts.length > 1 ? parts[1] : repositoryUrl;
}

/** Search issues. Pull requests are filtered out — search/issues returns both. */
export async function searchIssues(query: string, perPage = 25): Promise<GhIssue[]> {
  const params = new URLSearchParams({
    q: query,
    sort: "updated",
    order: "desc",
    per_page: String(perPage),
  });
  const data = await gh<SearchResult<GhIssue>>(`/search/issues?${params.toString()}`);
  return data.items.filter((item) => !item.pull_request);
}

/** Open PRs that mention an issue — used as the competition signal. */
export async function countLinkedOpenPRs(repo: string, issueNumber: number): Promise<number> {
  const params = new URLSearchParams({
    q: `repo:${repo} is:pr is:open ${issueNumber} in:body`,
    per_page: "20",
  });
  try {
    const data = await gh<SearchResult<GhIssue>>(`/search/issues?${params.toString()}`);
    return data.items.length;
  } catch {
    // Competition is a nice-to-have; never fail a candidate over it.
    return 0;
  }
}

export function parseIssueUrl(input: string): { repo: string; number: number } | null {
  const match = input
    .trim()
    .match(/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)/i);
  if (!match) return null;
  return { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) };
}

/**
 * Single issue, cached for 10 minutes.
 *
 * First tries the repo-issues cache (populated by match), then falls back to
 * the per-issue cache, then to the live API. This makes guide/resolving
 * resilient to rate limits once the match path has run.
 */
export async function getIssue(repo: string, issueNumber: number): Promise<GhIssue> {
  // Try the repo issues cache first (populated by getRepoIssues during match)
  const repoIssues = await readCache<GhIssue[]>(`issues:v3:${repo}`);
  if (repoIssues) {
    const hit = repoIssues.find((i) => i.number === issueNumber);
    if (hit) return hit;
  }

  // Fallback to per-issue cache, then live API
  return cached(`issue:v1:${repo}#${issueNumber}`, 10 * 60 * 1000, async () => {
    const issue = await gh<GhIssue>(`/repos/${repo}/issues/${issueNumber}`);
    if (issue.pull_request) {
      throw new Error("That link points to a pull request, not an issue.");
    }
    return issue;
  });
}
