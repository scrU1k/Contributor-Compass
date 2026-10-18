import type { z } from "zod";
import { env, isOffline } from "@/core/config/env";

/**
 * Gemma 4 access through the server-configured OpenAI-compatible endpoint.
 *
 * The browser supplies a key only. The endpoint and allowed model family are
 * controlled by the server, so a client cannot redirect secret-bearing requests.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

import { cachedLlmCall } from "@/core/llm/cache";

export function llmConfigured(): boolean {
  if (isOffline()) return true;
  const model = env.llmModel();
  return Boolean(
    env.llmBaseUrl() && env.llmApiKey() && model && /^gemma-4(?:-|$)/i.test(model),
  );
}

export async function chatText(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const model = opts.model ?? env.llmModel() ?? "gemma-4-31b-it";
  if (!/^gemma-4(?:-|$)/i.test(model)) {
    throw new LlmError("This build supports Gemma 4 models only");
  }

  const cacheKey = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 900,
  };

  return cachedLlmCall(cacheKey, async () => {
    if (isOffline()) {
      throw new LlmError("Offline mode: LLM cache miss");
    }

    const base = env.llmBaseUrl();
    const key = env.llmApiKey();
    if (!base || !key) throw new LlmError("LLM is not configured");

    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(cacheKey),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LlmError(`LLM ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new LlmError("LLM returned no content");
    return content;
  });
}

/** Pull the first JSON object/array out of a possibly chatty response. */
export function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  if (end <= start) return null;
  return body.slice(start, end + 1);
}

/**
 * Ask for JSON, validate it, retry once with the validation error appended.
 * Schema validation is not optional — a demo that renders malformed data is
 * worse than one that renders a graceful fallback.
 */
export async function chatJSON<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: ChatOptions = {},
): Promise<T> {
  const guard: ChatMessage = {
    role: "system",
    content:
      "Respond with a single valid JSON value and nothing else. No prose, no markdown fences.",
  };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const convo: ChatMessage[] =
      attempt === 0
        ? [guard, ...messages]
        : [
            guard,
            ...messages,
            {
              role: "assistant" as const,
              content: "(previous attempt was invalid)",
            },
            {
              role: "user" as const,
              content: `That was not valid per the schema: ${lastError}\nReturn corrected JSON only.`,
            },
          ];

    const raw = await chatText(convo, { ...opts, temperature: opts.temperature ?? 0.1 });
    const json = extractJson(raw);
    if (!json) {
      lastError = "no JSON found in response";
      continue;
    }

    try {
      return schema.parse(JSON.parse(json));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new LlmError(`LLM did not return schema-valid JSON: ${lastError}`);
}
