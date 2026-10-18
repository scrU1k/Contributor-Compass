import { z } from "zod";
import { chatJSON, llmConfigured } from "@/core/llm/adapter";
import { explainDeterministic } from "@/core/rank/rank";
import type { Profile, RankedCandidate } from "@/core/types";

/**
 * "Why this fits you" — grounded strictly in the evidence we already computed.
 * If the LLM is missing or misbehaves, the deterministic version is already good.
 */

const schema = z.object({
  why: z.string().min(10).max(500),
});

export async function explainCandidate(
  candidate: RankedCandidate,
  profile: Profile,
): Promise<string> {
  const fallback = explainDeterministic(candidate, profile);
  if (!llmConfigured()) return fallback;

  const evidence = candidate.score.evidence
    .map((e) => `- ${e.label}: ${e.value}`)
    .join("\n");

  try {
    const { why } = await chatJSON(
      [
        {
          role: "system",
          content: [
            "You write one short, concrete sentence explaining why an open-source issue suits a specific person.",
            "Use only the evidence provided. Never invent facts, files, or numbers.",
            "No hype, no emoji, no exclamation marks. Second person.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Person: goal=${profile.goal}, tier=${profile.tier}, time=${profile.timeBudget}`,
            `Stack: ${profile.stack.map((s) => `${s.tech}(${s.fluency}/5)`).join(", ") || "not stated"}`,
            `Interests: ${profile.interests.join(", ") || "not stated"}`,
            "",
            `Issue: ${candidate.title} (${candidate.repo})`,
            `Readiness score: ${candidate.score.total}/100`,
            "Evidence:",
            evidence,
          ].join("\n"),
        },
      ],
      schema,
      { maxTokens: 200 },
    );
    return why.trim();
  } catch {
    return fallback;
  }
}
