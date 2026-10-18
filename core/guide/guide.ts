import { z } from "zod";
import { chatJSON, llmConfigured } from "@/core/llm/adapter";
import { getRepoTreePaths } from "@/core/github/signals";
import { filterExistingPaths } from "@/core/verify/verify";
import { TIERS } from "@/core/config/tiers";
import type { Guidance, Profile, RankedCandidate } from "@/core/types";

/**
 * The getting-started guide.
 *
 * Attuned and specific to each issue: Gemma analyzes the issue title, problem description,
 * repository tech stack, and file tree to write a customized, actionable implementation plan.
 * The LLM proposes, we dispose: every file path it names is checked against the real
 * repository tree before it reaches the user.
 */

const schema = z.object({
  summary: z.string().min(10).max(800),
  setupSteps: z.array(z.string().min(3).max(400)).min(1).max(10),
  whereToLook: z.array(z.object({ path: z.string(), why: z.string().max(300) })).max(8),
  approach: z.array(z.string().min(3).max(400)).min(1).max(10),
  firstCommit: z.array(z.string().min(3).max(300)).min(1).max(6),
  resources: z.array(z.object({ title: z.string(), url: z.string() })).max(6),
});

/**
 * Deterministic citations: only files we actually saw in the repository tree.
 */
function pickKnownPaths(tree: string[]): { path: string; why: string }[] {
  const picks: { path: string; why: string }[] = [];
  const find = (name: string) => tree.find((p) => p.toLowerCase() === name.toLowerCase());

  const known: [string, string][] = [
    ["CONTRIBUTING.md", "contribution rules, style guide, and review expectations"],
    ["README.md", "local installation and build commands"],
    ["package.json", "npm scripts, dependencies, and test commands"],
    ["pyproject.toml", "Python build and pytest configuration"],
    ["go.mod", "Go module layout and dependencies"],
    ["Cargo.toml", "Rust crate layout and cargo test setup"],
  ];

  for (const [name, why] of known) {
    const path = find(name);
    if (path) picks.push({ path, why });
  }

  // Find relevant source and test directories
  const tests = tree.find((p) => /^(tests?|__tests__|spec)\//i.test(p));
  if (tests) {
    const dir = tests.split("/")[0];
    picks.push({ path: dir, why: "existing test suite — add a reproduction test here" });
  }

  const src = tree.find((p) => /^(src|lib|packages|app)\//i.test(p));
  if (src) {
    const dir = src.split("/")[0];
    picks.push({ path: dir, why: "core source directory for this module" });
  }

  return picks.slice(0, 5);
}

/**
 * Issue-attuned intelligent fallback when offline or when Gemma is not configured.
 */
function fallbackGuidance(candidate: RankedCandidate, tree: string[] = []): Guidance {
  const whereToLook = pickKnownPaths(tree);
  const lang = (candidate.signals.language || "").toLowerCase();

  // Tailor setup commands based on detected language/tooling
  const setupSteps: string[] = [`git clone https://github.com/${candidate.repo}.git`, `cd ${candidate.repo.split("/")[1] || candidate.repo}`];

  if (lang.includes("typescript") || lang.includes("javascript")) {
    setupSteps.push("npm install (or pnpm/yarn if configured in repo)", "npm test  # establish clean test baseline before changes");
  } else if (lang.includes("python")) {
    setupSteps.push("python -m venv .venv && source .venv/bin/activate  # on Windows: .venv\\Scripts\\activate", "pip install -e . && pytest  # run test suite");
  } else if (lang.includes("rust")) {
    setupSteps.push("cargo build", "cargo test  # run existing test suite");
  } else if (lang.includes("go")) {
    setupSteps.push("go build ./...", "go test ./...  # run existing test suite");
  } else {
    setupSteps.push("Follow repository README.md for language-specific toolchain setup.", "Run the test suite to establish a clean baseline.");
  }
  setupSteps.push(`git checkout -b fix-issue-${candidate.number}`);

  // Attuned approach referencing the actual issue title and component
  const cleanTitle = candidate.title.replace(/[#`"]/g, "").trim();
  const approach: string[] = [
    `Analyze issue #${candidate.number}: "${cleanTitle}" to locate the exact behavior reported.`,
    `Search the codebase (e.g. in ${whereToLook[0]?.path || "src/"}) for references related to this component.`,
    "Write a minimal test case that reproduces the issue before writing any production fix.",
    "Implement the smallest possible fix that addresses the issue without breaking existing tests.",
    `Commit your changes and open a pull request linking to #${candidate.number}.`,
  ];

  return {
    summary: `Targeted implementation plan for #${candidate.number}: "${candidate.title}" in ${candidate.repo}.`,
    setupSteps,
    whereToLook,
    approach,
    firstCommit: [`fix: address #${candidate.number} (${cleanTitle.slice(0, 50)})`],
    resources: [{ title: `Issue #${candidate.number}`, url: candidate.url }],
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
            "You are an expert open-source maintainer writing an issue-specific, technical onboarding plan for a developer.",
            "DO NOT write generic advice like 'read the code' or 'follow README'. Every step MUST directly address the specific bug, error message, module, or feature requested in this issue.",
            `The developer is ${depth === "deep" ? "a newcomer — provide explicit, step-by-step CLI commands and explain why each step is necessary" : "experienced — be concise, direct, and architectural"}.`,
            "1. summary: A 1-2 sentence diagnosis of what broke or needs to be built in this issue.",
            "2. setupSteps: Concrete shell commands to clone, install dependencies, and run tests for this specific language/stack (e.g. `npm test`, `pytest tests/`, `cargo test`).",
            "3. whereToLook: Identify the top 2-4 candidate files/directories from the file list most likely to contain the code or tests related to this issue, with an exact explanation of why.",
            "4. approach: 3-5 concrete, technical steps specifically solving this issue (e.g. '1. Open X and inspect function Y', '2. Reproduce the bug by passing Z', '3. Handle the edge case by...').",
            "5. firstCommit: A clean conventional commit message referencing the issue number (e.g. 'fix(parser): handle null values in tokenizer (#123)').",
            "Only reference file paths that exist in the provided file list.",
          ].join("\n"),
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
      { maxTokens: 1400 },
    );

    const verified = await filterExistingPaths(candidate.repo, raw.whereToLook);
    const safeResources = (raw.resources || []).filter(
      (r) => typeof r?.url === "string" && isSafeHttpUrl(r.url),
    );

    return {
      summary: raw.summary,
      setupSteps: raw.setupSteps,
      whereToLook: verified.kept.length > 0 ? verified.kept : pickKnownPaths(tree),
      approach: raw.approach,
      firstCommit: raw.firstCommit,
      resources: [
        { title: `Issue #${candidate.number}`, url: candidate.url },
        ...safeResources.slice(0, 4),
      ],
    };
  } catch {
    return fallbackGuidance(candidate, tree);
  }
}
