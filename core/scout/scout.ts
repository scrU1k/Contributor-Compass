import { z } from "zod";
import { chatJSON, llmConfigured } from "@/core/llm/adapter";
import { findRepo, REGISTRY, type RegistryRepo } from "@/core/registry/repos";
import type { Profile } from "@/core/types";

/**
 * Stage 1: Repo Scout.
 *
 * Given a profile, choose 3–5 repositories worth searching. Two implementations
 * of the same contract:
 *
 *   - Gemma reasons over the curated catalogue (main path)
 *   - tag/language overlap (deterministic fallback, always available)
 *
 * Gemma's answer is validated against the catalogue. A hallucinated repository
 * is discarded, not fetched — the same "verify, don't trust" rule the rest of
 * the product is built on.
 */

export interface ScoutedRepo {
  fullName: string;
  why: string;
}

export interface ScoutResult {
  repos: ScoutedRepo[];
  source: "gemma" | "registry" | "hybrid";
}

/**
 * Human vocabulary differs from the registry's topic tags. A small alias table
 * buys a lot of match quality without pretending to be semantic search — that
 * is the Repo Scout's job when a model is configured.
 */
const ALIASES: Record<string, string[]> = {
  games: ["game", "graphics", "gamedev", "engine"],
  game: ["games", "graphics", "gamedev", "engine"],
  gaming: ["games", "game", "gamedev"],
  gamedev: ["games", "game", "engine", "graphics"],
  education: ["learning", "learn", "curriculum", "tutorial", "docs"],
  learning: ["education", "tutorial"],
  documentation: ["docs", "doc"],
  docs: ["documentation", "doc"],
  doc: ["docs", "documentation"],
  "design / frontend": ["design", "frontend", "ui", "ux", "css", "web"],
  design: ["frontend", "ui", "ux", "css"],
  frontend: ["design", "ui", "ux", "css", "web"],
  ui: ["design", "frontend", "ux"],
  ux: ["design", "frontend", "ui"],
  accessibility: ["design", "a11y"],
  "developer tools": ["devtools", "cli"],
  "developer tooling": ["devtools", "cli"],
  devtools: ["developer tools", "cli"],
  "command line": ["cli"],
  "command-line": ["cli"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ml"],
  ai: ["ml"],
  cryptography: ["crypto", "security", "cybersecurity", "encryption", "tls", "ssl"],
  compression: ["zstd", "lz4", "brotli", "gzip", "archive", "algorithm"],
  cybersecurity: ["security", "cryptography", "infosec", "vulnerability"],
  security: ["cybersecurity", "cryptography", "tls"],
  astronomy: ["space", "astrophysics", "solar", "cosmology", "telescope"],
};

const scoutSchema = z.object({
  repos: z
    .array(
      z.object({
        fullName: z.string(),
        why: z.string().min(1).max(240),
      }),
    )
    .min(1)
    .max(8),
});

/** Deterministic relevance: strictly prioritizes interest overlap over generic language matches. */
export function registryScore(profile: Profile, repo: RegistryRepo): number {
  const validInterests = profile.interests
    .map((i) => i.toLowerCase().trim())
    .filter((i) => i && !/^not sure(?: open to anything)?$/i.test(i));

  // Build normalized interest terms including sub-parts (e.g. "design / frontend" -> "design", "frontend")
  const interestTerms = new Set<string>();
  for (const raw of validInterests) {
    interestTerms.add(raw);
    for (const part of raw.split(/[/,&|]+/).map((p) => p.trim()).filter(Boolean)) {
      interestTerms.add(part);
      for (const a of ALIASES[part] ?? []) interestTerms.add(a);
    }
    for (const a of ALIASES[raw] ?? []) interestTerms.add(a);
  }

  const repoTopics = repo.topics.map((t) => t.toLowerCase());
  let topicScore = 0;
  let hasInterestMatch = false;

  for (const topic of repoTopics) {
    if (interestTerms.has(topic)) {
      topicScore += 10;
      hasInterestMatch = true;
    } else {
      // Meaningful prefix / suffix match (minimum length 3 to prevent single-letter leakage)
      for (const it of interestTerms) {
        if (it.length >= 3 && topic.length >= 3 && (topic.startsWith(it) || it.startsWith(topic))) {
          topicScore += 4;
          hasInterestMatch = true;
          break;
        }
      }
    }
  }

  // If the user specified explicit interests, repos with 0 interest match must NEVER be selected!
  if (validInterests.length > 0 && !hasInterestMatch) {
    return 0;
  }

  // Language match only awards bonus points if interests matched or user has no specific interests
  const userLanguages = profile.stack.map((s) => s.tech.toLowerCase());
  const langMatch = userLanguages.includes(repo.language.toLowerCase());

  if (profile.contributionTypes.includes("docs") && repoTopics.includes("docs")) {
    topicScore += 2;
  }

  return topicScore + (langMatch ? 4 : 0);
}

let scoutRotationCounter = 0;

export function scoutDeterministic(profile: Profile, limit = 5): ScoutResult {
  const validInterests = profile.interests
    .map((i) => i.toLowerCase().trim())
    .filter((i) => i && !/^not sure(?: open to anything)?$/i.test(i));

  const scored = REGISTRY.map((repo, index) => ({
    repo,
    index,
    score: registryScore(profile, repo),
  })).filter((r) => validInterests.length === 0 || r.score > 0);

  // Group by score so repos within the same relevance tier rotate across consecutive queries
  const byScore = new Map<number, typeof scored>();
  for (const item of scored) {
    const list = byScore.get(item.score) ?? [];
    list.push(item);
    byScore.set(item.score, list);
  }

  // Sort score buckets descending
  const sortedScores = Array.from(byScore.keys()).sort((a, b) => b - a);
  const selected: typeof scored = [];
  const offset = scoutRotationCounter++;

  for (const score of sortedScores) {
    const bucket = byScore.get(score) ?? [];
    if (bucket.length <= 1) {
      selected.push(...bucket);
    } else {
      // Rotate bucket starting index to sample different projects sharing the top score
      const shift = offset % bucket.length;
      const rotated = [...bucket.slice(shift), ...bucket.slice(0, shift)];
      selected.push(...rotated);
    }
    if (selected.length >= limit * 2) break;
  }

  return {
    repos: selected.slice(0, limit).map(({ repo }) => ({
      fullName: repo.fullName,
      why: repo.note,
    })),
    source: "registry",
  };
}

function describeProfile(profile: Profile): string {
  return [
    `Experience: ${profile.experienceLevel}`,
    `Goal: ${profile.goal}`,
    `Interests: ${profile.interests.join(", ") || "unspecified"}`,
    `Stack: ${profile.stack.map((s) => `${s.tech} (${s.fluency}/5)`).join(", ") || "unspecified"}`,
    `Contribution types: ${profile.contributionTypes.join(", ") || "any"}`,
    `Avoid these blockers: ${profile.fears.join(", ") || "none stated"}`,
    `Time budget: ${profile.timeBudget}`,
    `Preferred issue size: ${profile.issueSize}`,
  ].join("\n");
}

function catalogue(): string {
  return REGISTRY.map(
    (r) => `${r.fullName} | ${r.language} | ${r.topics.join(",")} | ${r.note}`,
  ).join("\n");
}

export async function scoutRepos(profile: Profile, limit = 5): Promise<ScoutResult> {
  if (!llmConfigured()) return scoutDeterministic(profile, limit);

  try {
    const result = await chatJSON(
      [
        {
          role: "system",
          content:
            "You are a repository scout for open-source contributors. You choose only from the catalogue you are given. You never invent repositories.",
        },
        {
          role: "user",
          content: [
            "Choose the repositories that best fit this developer.",
            "",
            "Rules:",
            `- Pick between 1 and ${limit}.`,
            "- Use only fullName values that appear in the catalogue.",
            "- Prefer projects where this person could realistically get a first pull request merged.",
            "- If the developer specified explicit interests, ONLY select repositories matching those interests. Do not pick unrelated repositories just because the programming language matches (e.g. if interest is games, pick game engines; do not pick cryptography).",
            "- For a newcomer, prefer smaller, friendlier projects over huge monorepos.",
            "",
            "Developer:",
            describeProfile(profile),
            "",
            "Catalogue (fullName | language | topics | note):",
            catalogue(),
            "",
            'Return: {"repos":[{"fullName":"owner/repo","why":"one short sentence"}]}',
          ].join("\n"),
        },
      ],
      scoutSchema,
      { maxTokens: 800, temperature: 0.2 },
    );

    const verified: ScoutedRepo[] = [];
    const seen = new Set<string>();

    for (const pick of result.repos) {
      const known = findRepo(pick.fullName);
      if (!known) continue;
      const key = known.fullName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      verified.push({ fullName: known.fullName, why: pick.why.trim() });
      if (verified.length >= limit) break;
    }

    if (verified.length === 0) return scoutDeterministic(profile, limit);
    return { repos: verified, source: "gemma" };
  } catch {
    return scoutDeterministic(profile, limit);
  }
}
