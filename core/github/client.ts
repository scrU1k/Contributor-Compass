import { env } from "@/core/config/env";

const API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 20_000;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly rateLimited: boolean,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

/**
 * The only place in the codebase that knows the shape of the GitHub HTTP API.
 * Swap this module out for GH Archive or a code index at scale.
 */
export async function gh<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const url = pathname.startsWith("http") ? pathname : `${API}${pathname}`;

  const headers = new Headers(init.headers);
  headers.set("accept", "application/vnd.github+json");
  headers.set("x-github-api-version", "2022-11-28");
  headers.set("user-agent", "contributor-compass");

  const token = env.githubToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const rateLimited = remaining === "0" || res.status === 429;
    const hint = rateLimited
      ? " (rate limited — add a GitHub token in Settings, or warm the cache)"
      : "";
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      /* body was not JSON */
    }
    throw new GitHubError(
      `GitHub ${res.status} for ${url}${detail}${hint}`,
      res.status,
      url,
      rateLimited,
    );
  }

  return (await res.json()) as T;
}

/** For optional probes where a 404/403 just means "not available". */
export async function ghMaybe<T>(pathname: string, init: RequestInit = {}): Promise<T | null> {
  try {
    return await gh<T>(pathname, init);
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  }
}
