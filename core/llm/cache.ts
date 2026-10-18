import crypto from "node:crypto";
import { cached } from "@/core/cache/cache";

/**
 * 24-hour TTL for LLM completions.
 * In offline mode (COMPASS_OFFLINE=1), the underlying cached() helper serves
 * cached entries regardless of expiration so stage demos never blank out.
 */
const LLM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function hashLlmPayload(payload: unknown): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Read-through cache for LLM calls (scout, guide, and Jev).
 */
export async function cachedLlmCall<T>(
  keyPayload: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const hash = hashLlmPayload(keyPayload);
  return cached<T>(`llm:${hash}`, LLM_CACHE_TTL_MS, fn);
}
