import { GitHubError, gh } from "@/core/github/client";
import { NextResponse } from "next/server";
import { env, isOffline } from "@/core/config/env";
import { llmConfigured } from "@/core/llm/adapter";
import { cacheStats } from "@/core/cache/cache";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitHubProbe = "ok" | "unauthorized" | "rate-limited" | "error" | "skipped";

/**
 * Reports what this specific request can do.
 *
 * Reads through the request-scoped config, so the settings screen can verify a
 * judge's pasted credentials before that judge ever runs a search.
 *
 * `?probe=1` makes one cheap Core REST call to prove the GitHub token is real.
 */
export async function GET(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    const cache = await cacheStats();
    const probe = new URL(request.url).searchParams.get("probe") === "1";

    let githubProbe: GitHubProbe = "skipped";
    if (probe && env.githubToken()) {
      try {
        await gh("/rate_limit");
        githubProbe = "ok";
      } catch (error) {
        if (error instanceof GitHubError) {
          githubProbe =
            error.status === 401 ? "unauthorized" : error.rateLimited ? "rate-limited" : "error";
        } else {
          githubProbe = "error";
        }
      }
    }

    return NextResponse.json({
      ok: true,
      github: Boolean(env.githubToken()),
      githubProbe,
      llm: llmConfigured(),
      model: env.llmModel() ?? null,
      offline: isOffline(),
      cache: {
        files: cache.files,
        kb: Math.round(cache.bytes / 1024),
      },
    });
  });
}
