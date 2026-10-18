import { env } from "@/core/config/env";
import { ghCircuitBreaker } from "@/core/resilience/circuitBreaker";

const API = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 8_000;

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

function shouldTripBreaker(err: unknown): boolean {
  if (err instanceof GitHubError) {
    // Normal resource misses (e.g. repo has no CONTRIBUTING.md) are not upstream failures
    if (err.status === 404) return false;
    // Disallowed endpoints or private checks that aren't rate limits don't indicate service outage
    if (err.status === 403 && !err.rateLimited) return false;
    return true;
  }
  return true;
}

/**
 * The only place in the codebase that knows the shape of the GitHub HTTP API.
 * Swap this module out for GH Archive or a code index at scale.
 */
export async function gh<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  return ghCircuitBreaker.execute(async () => {
    let url: string;
    if (pathname.startsWith("http")) {
      const parsed = new URL(pathname);
      if (parsed.hostname.toLowerCase() !== "api.github.com") {
        throw new Error(`Security restriction: gh() client can only query api.github.com, got ${parsed.hostname}`);
      }
      url = pathname;
    } else {
      url = `${API}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    }

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
  }, shouldTripBreaker);
}

/** For optional probes where a 404 just means "not available". */
export async function ghMaybe<T>(pathname: string, init: RequestInit = {}): Promise<T | null> {
  try {
    return await gh<T>(pathname, init);
  } catch (err) {
    if (err instanceof GitHubError) {
      if (err.rateLimited || err.status === 429) throw err;
      if (err.status === 404) return null;
      if (err.status === 403 && !/rate limit/i.test(err.message)) return null;
    }
    throw err;
  }
}
