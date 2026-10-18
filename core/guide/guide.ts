import { z } from "zod";
import { chatJSON, llmConfigured } from "@/core/llm/adapter";
import { getRepoTreePaths } from "@/core/github/signals";
import { filterExistingPaths } from "@/core/verify/verify";
import { TIERS } from "@/core/config/tiers";
import type { Guidance, Profile, RankedCandidate } from "@/core/types";

/**
 * The getting-started guide.
 *
 * The LLM proposes, we dispose: every file path it names is checked against the
 * real repository tree before it reaches the user.
 */

const schema = z.object({
  summary: z.string().min(10).max(600),
  setupSteps: z.array(z.string().min(3).max(300)).min(1).max(10),
  whereToLook: z.array(z.object({ path: z.string(), why: z.string().max(300) })).max(8),
  approach: z.array(z.string().min(3).max(300)).min(1).max(10),
  firstCommit: z.array(z.string().min(3).max(300)).min(1).max(6),
  resources: z.array(z.object({ title: z.string(), url: z.string() })).max(6),
});

/**
 * Deterministic citations: only files we actually saw in the repository tree.
 * This is what the no-key (and offline) path can honestly claim.
 */
function pickKnownPaths(tree: string[]): { path: string; why: string }[] {
  const picks: { path: string; why: string }[] = [];
  const find = (name: string) => tree.find((p) => p.toLowerCase() === name.toLowerCase());

  const known: [string, string][] = [
    ["CONTRIBUTING.md", "contribution rules and review expectations"],
    ["README.md", "setup instructions"],
    ["package.json", "scripts and test commands"],
    ["pyproject.toml", "build, lint and test configuration"],
    ["go.mod", "module layout and language version"],
    ["Cargo.toml", "crate layout and build configuration"],
  ];

  for (const [name, why] of known) {
    const path = find(name);
    if (path) picks.push({ path, why });
  }

  const tests = tree.find((p) => /^(tests?|__tests__)\//.test(p));
  if (tests) {
    const dir = tests.split("/")[0];
    picks.push({ path: dir, why: "existing tests — match their style" });
  }

  return picks.slice(0, 4);
}

function fallbackGuidance(candidate: RankedCandidate, tree: string[] = []): Guidance {
  const whereToLook = pickKnownPaths(tree);
  const hasReadme = whereToLook.some((p) => /readme/i.test(p.path));
  const hasContributing = whereToLook.some((p) => /contributing/i.test(p.path));

  return {
    summary: `Work on "${candidate.title}" in ${candidate.repo}.`,
    setupSteps: [
      hasReadme
        ? "Follow README.md to set the project up locally."
        : `Clone ${candidate.repo} and set it up locally.`,
      hasContributing
        ? "Read CONTRIBUTING.md before you open a pull request."
        : "Run the test suite once to confirm a clean baseline before changing anything.",
      "Create a branch named after the issue.",
    ],
    whereToLook,
    approach: [
      "Read the issue and any linked discussion in full.",
      "Locate the code the issue refers to and confirm you can reproduce the behaviour.",
      "Make the smallest change that addresses the issue.",
      "Add or update a test that would have failed before your change.",
    ],
    firstCommit: [`Fix #${candidate.number}: ${candidate.title}`],
    resources: [{ title: "The issue", url: candidate.url }],
  };
}

/** Keep the prompt bounded on large repos. */
function sampleTree(paths: string[], limit = 250): string[] {
  if (paths.length <= limit) return paths;
  const interesting = paths.filter((p) =>
    /(^|\/)(src|lib|app|packages|tests?|docs?|readme|contributing)/i.test(p),
  );
  return [...new Set([...interesting.slice(0, limit), ...paths.slice(0, 80)])].slice(0, limit);
}

/** Protocol check to prevent javascript: or data: URL injection from LLM citations. */
export function isSafeHttpUrl(candidateUrl: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function buildGuidance(
  candidate: RankedCandidate,
  profile: Profile,
): Promise<Guidance> {
  let tree: string[] = [];
  try {
    tree = await getRepoTreePaths(candidate.repo);
  } catch {
    /* offline or unavailable — the guide still works, just without citations */
  }

  if (!llmConfigured()) return fallbackGuidance(candidate, tree);

  const depth = TIERS[profile.tier].guidanceDepth;

  try {
    const raw = await chatJSON(
      [
        {
          role: "system",
          content: [
            "You help a developer make their first contribution to an open-source issue.",
            "Ground every claim in the repository context provided.",
            `The user is ${depth === "deep" ? "a newcomer — explain jargon, assume no prior context" : "experienced — be concise and technical"}.`,
            "For whereToLook, only name file or directory paths that appear in the file list.",
            "If you are unsure of a path, omit it rather than guessing.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Repository: ${candidate.repo}`,
            `Language: ${candidate.signals.language ?? "unknown"}`,
            `Description: ${candidate.signals.description ?? "none"}`,
            `Issue #${candidate.number}: ${candidate.title}`,
            "",
            "Issue body:",
            candidate.body.slice(0, 4000) || "(empty)",
            "",
            "Files in the repository (partial):",
            sampleTree(tree).join("\n") || "(unavailable)",
          ].join("\n"),
        },
      ],
      schema,
      { maxTokens: 1200 },
    );

    const verified = await filterExistingPaths(candidate.repo, raw.whereToLook);
    const safeResources = (raw.resources || []).filter(
      (r) => typeof r?.url === "string" && isSafeHttpUrl(r.url),
    );

    return {
      summary: raw.summary,
      setupSteps: raw.setupSteps,
      whereToLook: verified.kept,
      approach: raw.approach,
      firstCommit: raw.firstCommit,
      resources: [
        { title: "The issue", url: candidate.url },
        ...safeResources.slice(0, 4),
      ],
    };
  } catch {
    return fallbackGuidance(candidate, tree);
  }
}
