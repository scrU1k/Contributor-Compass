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
  documentation: ["docs"],
  doc: ["docs"],
  docs: ["documentation"],
  "developer tools": ["devtools", "cli"],
  "developer tooling": ["devtools", "cli"],
  devtools: ["developer tools", "cli"],
  "command line": ["cli"],
  "command-line": ["cli"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ml"],
  ai: ["ml"],
  ui: ["design", "frontend"],
  ux: ["design", "frontend"],
  accessibility: ["design", "a11y"],
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

function wantedTerms(profile: Profile): string[] {
  const terms = new Set<string>();

  const add = (value: string) => {
    const key = value.toLowerCase().trim();
    if (!key) return;
    terms.add(key);
    for (const alias of ALIASES[key] ?? []) terms.add(alias);
  };

  for (const s of profile.stack) add(s.tech);
  for (const i of profile.interests) add(i);
  for (const c of profile.contributionTypes) add(c);
  return [...terms];
}

/** Deterministic relevance: strictly prioritizes interest overlap over generic language matches. */
export function registryScore(profile: Profile, repo: RegistryRepo): number {
  const terms = wantedTerms(profile);
  let topicScore = 0;
  let hasInterestMatch = false;

  const validInterests = profile.interests
    .map((i) => i.toLowerCase().trim())
    .filter((i) => i && !/^not sure(?: open to anything)?$/i.test(i));

  const repoTopics = repo.topics.map((t) => t.toLowerCase());

  for (const topic of repoTopics) {
    for (const term of terms) {
      if (topic === term) {
        topicScore += 8;
        if (validInterests.includes(term) || validInterests.some((vi) => (ALIASES[vi] ?? []).includes(topic))) {
          hasInterestMatch = true;
        }
      } else if (topic.includes(term) || term.includes(topic)) {
        topicScore += 3;
        if (validInterests.some((vi) => topic.includes(vi) || vi.includes(topic))) {
          hasInterestMatch = true;
        }
      }
    }
  }

  // If the user specified explicit interests, repos with 0 interest match must NOT crowd out relevant repos!
  if (validInterests.length > 0 && !hasInterestMatch) {
    return 0;
  }

  const langMatch = terms.includes(repo.language.toLowerCase());
  if (profile.contributionTypes.includes("docs") && repoTopics.includes("docs")) {
    topicScore += 2;
  }

  return topicScore + (langMatch ? 4 : 0);
}

export function scoutDeterministic(profile: Profile, limit = 5): ScoutResult {
  const validInterests = profile.interests
    .map((i) => i.toLowerCase().trim())
    .filter((i) => i && !/^not sure(?: open to anything)?$/i.test(i));

  const ranked = REGISTRY.map((repo, index) => ({
    repo,
    index,
    score: registryScore(profile, repo),
  }))
    .filter((r) => validInterests.length === 0 || r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return {
    repos: ranked.slice(0, limit).map(({ repo }) => ({
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
            "- Match their languages, but let strong interest overlap win over a weak language match.",
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
      { maxTokens: 800, temperature: 0.1 },
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
