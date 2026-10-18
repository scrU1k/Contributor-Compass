import { requestConfig } from "./requestConfig";

/**
 * Central env access. Server-only: never import this from a client component.
 *
 * We read env lazily (functions, not constants) so that scripts, route handlers
 * and tests can set values before first use.
 *
 * Resolution order for every value:
 *   1. credentials supplied by this request (bring-your-own-key, in the UI)
 *   2. server .env
 *
 * That means a judge can paste a key and it wins immediately, while a
 * developer can still run everything from .env without touching the UI.
 */

function firstDefined(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export const env = {
  githubToken: (): string | undefined =>
    firstDefined(requestConfig()?.githubToken, process.env.GITHUB_TOKEN),

  llmBaseUrl: (): string | undefined =>
    firstDefined(requestConfig()?.llmBaseUrl, process.env.LLM_BASE_URL),
  llmApiKey: (): string | undefined =>
    firstDefined(requestConfig()?.llmApiKey, process.env.LLM_API_KEY),
  llmModel: (): string | undefined =>
    firstDefined(requestConfig()?.llmModel, process.env.LLM_MODEL),

  // Embeddings fall back to the chat endpoint if not set separately.
  embedBaseUrl: (): string | undefined =>
    firstDefined(
      process.env.LLM_EMBED_BASE_URL,
      requestConfig()?.llmBaseUrl,
      process.env.LLM_BASE_URL,
    ),
  embedModel: (): string | undefined => firstDefined(process.env.LLM_EMBED_MODEL),

  cacheDir: (): string => process.env.COMPASS_CACHE_DIR?.trim() || ".cache",
};

/** Offline mode serves only from cache — use this on stage. */
export function isOffline(): boolean {
  return process.env.COMPASS_OFFLINE === "1";
}
