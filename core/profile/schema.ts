import { z } from "zod";

/**
 * Validation for the profile that flows through the pipeline. Kept next to the
 * `Profile` type in core/types.ts — the zod schema is the runtime source of
 * truth, the type is the compile-time mirror.
 */
export const stackItemSchema = z.object({
  tech: z.string().min(1),
  fluency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const profileSchema = z.object({
  tier: z.enum(["newcomer", "experienced"]),
  experienceLevel: z.enum(["newcomer", "dabbler", "experienced"]),
  goal: z.enum(["learn", "merge-fast", "maintainer-track", "portfolio"]),
  stack: z.array(stackItemSchema).max(20),
  interests: z.array(z.string()).max(20),
  fears: z.array(z.string()).max(10).default([]),
  contributionTypes: z
    .array(z.enum(["code", "docs", "tests", "design", "translation", "triage"]))
    .max(6),
  timeBudget: z.enum(["under-1h", "weekend", "ongoing"]),
  constraints: z
    .object({
      license: z.array(z.string()).optional(),
      requireCI: z.boolean().optional(),
      maxRepoSize: z.enum(["small", "medium", "any"]).optional(),
      communicationLanguage: z.array(z.string()).optional(),
    })
    .default({}),
  issueSize: z.enum(["tiny", "small", "any"]),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export function parseProfile(input: unknown) {
  return profileSchema.parse(input);
}

export function safeParseProfile(input: unknown) {
  return profileSchema.safeParse(input);
}
