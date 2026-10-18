import { env } from "@/core/config/env";

/**
 * Embeddings make semantic fit load-bearing rather than decorative.
 *
 * If the endpoint isn't configured or fails, every caller degrades to tag
 * overlap. The pipeline never depends on this succeeding.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Raw embedding cosines are model-specific and rarely span [0,1]. This maps a
 * calibration window to [0,1]. Recalibrate if you change models — it's a
 * constant, not a law.
 */
export function toUnitCosine(raw: number, lo = 0.4, hi = 0.9): number {
  return clamp01((raw - lo) / (hi - lo));
}

export function embeddingsConfigured(): boolean {
  return Boolean(env.embedBaseUrl() && env.embedModel() && env.llmApiKey());
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const base = env.embedBaseUrl();
  const model = env.embedModel();
  const key = env.llmApiKey();
  if (!base || !model || !key || texts.length === 0) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vectors = json.data?.map((d) => d.embedding ?? []) ?? [];
    if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) return null;
    return vectors;
  } catch {
    return null;
  }
}
