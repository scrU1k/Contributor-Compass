import { gh } from "./client";
import { cached } from "@/core/cache/cache";

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
  return cached(`search-issues:v1:${query}:${perPage}`, 5 * 60 * 1000, async () => {
    const params = new URLSearchParams({
      q: query,
      sort: "updated",
      order: "desc",
      per_page: String(Math.min(Math.max(perPage, 1), 100)),
    });
    const data = await gh<SearchResult<GhIssue>>(`/search/issues?${params.toString()}`);
    return data.items.filter((item) => !item.pull_request);
  });
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
  try {
    const url = new URL(input.trim());
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_-][A-Za-z0-9_.-]*)\/([A-Za-z0-9_-][A-Za-z0-9_.-]*)\/(?:issues|pull)\/(\d+)\/?$/i);
    if (!match) return null;
    return { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) };
  } catch {
    return null;
  }
}

/** Recheck a selected issue directly; online results are cached for 30 seconds. */
export async function getIssue(repo: string, issueNumber: number): Promise<GhIssue> {
  // Recheck the selected issue independently of the broader repository-list
  // cache so recently closed or assigned issues are caught promptly.
  return cached(`issue:v2:${repo}#${issueNumber}`, 30_000, async () => {
    const issue = await gh<GhIssue>(`/repos/${repo}/issues/${issueNumber}`);
    if (issue.pull_request) {
      throw new Error("That link points to a pull request, not an issue.");
    }
    return issue;
  });
}
