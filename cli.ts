#!/usr/bin/env node
/**
 * Contributor Compass — Terminal Edition (CLI)
 *
 * "Verified, not listed." Good-first-issue lists go stale. We verify doable work.
 *
 * Features:
 *   - Natural language developer input parsed by Gemma 4 (with deterministic fallback)
 *   - Organization / repository-scoped search (e.g. "openstreetmap" or "pallets/flask")
 *   - Live readiness verification & Gemma 4 Jev decision harness
 *   - Grounded quote validation and on-demand getting-started guide generation
 *
 * Usage:
 *   npm run cli
 *   npm run cli -- "I know Python and docs, looking for starter issues in openstreetmap"
 *   npm run cli -- --org openstreetmap
 *   npm run cli -- --issue https://github.com/pallets/flask/issues/1234
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseGitHubTarget } from "./core/github/url";
import { discoverOrgCandidates, discoverRepoCandidates } from "./core/github/org";
import { runMatch } from "./core/pipeline";
import { buildGuidance } from "./core/guide/guide";
import { verifySingleIssue } from "./core/verify/single";
import { chatJSON, llmConfigured } from "./core/llm/adapter";
import { minimalProfile } from "./core/profile/defaults";
import { verdict, plainEvidence } from "./core/format/plain";
import type { Profile, RankedCandidate, Tier, StackItem } from "./core/types";

// Load .env if present
function loadDotEnv(file = ".env"): void {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

// ANSI color helpers
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

interface ParsedUserIntent {
  tier: Tier;
  stack: StackItem[];
  interests: string[];
  timeBudget: "under-1h" | "weekend" | "ongoing";
  target: string | null;
}

/**
 * Deterministic fallback profile parser when Gemma 4 is unavailable or offline.
 */
function deterministicParseIntent(text: string): ParsedUserIntent {
  const lower = text.toLowerCase();
  const stack: StackItem[] = [];

  const KNOWN_TECHS = [
    { tech: "Python", regex: /\bpython\b/i },
    { tech: "TypeScript", regex: /\b(typescript|ts)\b/i },
    { tech: "JavaScript", regex: /\b(javascript|js|node)\b/i },
    { tech: "Rust", regex: /\brust\b/i },
    { tech: "Go", regex: /\b(golang|go)\b/i },
    { tech: "Java", regex: /\bjava\b/i },
    { tech: "C++", regex: /\b(c\+\+|cpp)\b/i },
    { tech: "Ruby", regex: /\bruby\b/i },
    { tech: "PHP", regex: /\bphp\b/i },
    { tech: "HTML/CSS", regex: /\b(html|css)\b/i },
  ];

  for (const { tech, regex } of KNOWN_TECHS) {
    if (regex.test(text)) {
      stack.push({ tech, fluency: 3 });
    }
  }
  if (stack.length === 0) {
    stack.push({ tech: "JavaScript", fluency: 2 });
  }

  const interests: string[] = [];
  if (/\b(doc|docs|documentation|typo|guide)\b/i.test(text)) interests.push("documentation");
  if (/\b(bug|fix|fixes)\b/i.test(text)) interests.push("bug fixes");
  if (/\b(test|tests|testing)\b/i.test(text)) interests.push("tests");
  if (/\b(design|ui|css|frontend)\b/i.test(text)) interests.push("design");

  const tier: Tier = /\b(experienced|senior|pro|expert)\b/i.test(lower) ? "experienced" : "newcomer";
  const timeBudget = /\b(quick|under 1h|<1h|30 min|15 min)\b/i.test(lower)
    ? "under-1h"
    : /\b(ongoing|week|long)\b/i.test(lower)
    ? "ongoing"
    : "weekend";

  // Check for target URL or org
  let target: string | null = null;
  const urlMatch = text.match(/https?:\/\/github\.com\/[^\s]+/i);
  if (urlMatch) {
    target = urlMatch[0];
  } else {
    const inOrgMatch = text.match(/\b(?:in|for|from|org)\s+([A-Za-z0-9_-]+)\b/i);
    if (inOrgMatch) {
      target = inOrgMatch[1];
    }
  }

  return { tier, stack, interests, timeBudget, target };
}

import { z } from "zod";

const intentSchema = z.object({
  tier: z.enum(["newcomer", "experienced"]).default("newcomer"),
  stack: z
    .array(
      z.object({
        tech: z.string(),
        fluency: z
          .number()
          .min(1)
          .max(5)
          .transform((v) => Math.min(5, Math.max(1, Math.round(v))) as 1 | 2 | 3 | 4 | 5),
      }),
    )
    .default([]),
  interests: z.array(z.string()).default([]),
  timeBudget: z.enum(["under-1h", "weekend", "ongoing"]).default("weekend"),
  target: z.string().nullable().optional(),
});

/**
 * Natural language profile parsing using Gemma 4 with deterministic fallback.
 */
async function parseIntent(text: string): Promise<ParsedUserIntent> {
  if (!llmConfigured()) {
    return deterministicParseIntent(text);
  }

  try {
    const res = await chatJSON(
      [
        {
          role: "system",
          content:
            "You are a developer profile parser. Extract structured fields from user natural language: " +
            "tier ('newcomer' | 'experienced'), stack array of {tech, fluency (1-5)}, interests array of strings, " +
            "timeBudget ('under-1h' | 'weekend' | 'ongoing'), and optional target (GitHub URL, org, or repo name if mentioned).",
        },
        { role: "user", content: `User description: "${text}"` },
      ],
      intentSchema,
      { temperature: 0.0, maxTokens: 300 },
    );

    return {
      tier: res.tier,
      stack: res.stack.length > 0 ? res.stack : [{ tech: "JavaScript", fluency: 2 }],
      interests: res.interests.length > 0 ? res.interests : ["documentation"],
      timeBudget: res.timeBudget,
      target: res.target || null,
    };
  } catch {
    return deterministicParseIntent(text);
  }
}

function toFullProfile(intent: ParsedUserIntent): Profile {
  const base = minimalProfile(intent.tier);
  return {
    ...base,
    tier: intent.tier,
    stack: intent.stack,
    interests: intent.interests,
    timeBudget: intent.timeBudget,
  };
}

// ── Formatted Output Helpers ──────────────────────────────────────────────────

function printBanner(): void {
  console.log(`\n${C.bold}${C.cyan}🧭 CONTRIBUTOR COMPASS — TERMINAL EDITION${C.reset}`);
  console.log(`${C.dim}Headline: "Verified, not listed." Good-first-issue lists go stale. We verify doable work.${C.reset}\n`);
}

function printCandidate(c: RankedCandidate, index: number, tier: Tier): void {
  const v = verdict(c);
  let vTone = C.green;
  if (v.tone === "warn") vTone = C.yellow;
  if (v.tone === "bad") vTone = C.red;

  const scoreStr = `${c.score.total.toFixed(0)}/100`;

  console.log(`${C.bold}${index + 1}. [${c.repo} #${c.number}] ${c.title}${C.reset}`);
  console.log(`   ${C.bold}Readiness:${C.reset} ${scoreStr} | ${vTone}${C.bold}${v.label}${C.reset}`);

  if (c.jevDecision?.quote && c.jevDecision?.quoteVerified) {
    console.log(`   ${C.cyan}🔍 Grounded Quote:${C.reset} "${c.jevDecision.quote}"`);
  }

  const evidenceList = plainEvidence(c);
  if (evidenceList.length > 0) {
    console.log(`   ${C.dim}Evidence:${C.reset} ${evidenceList.join(" • ")}`);
  }

  console.log(`   ${C.blue}URL:${C.reset} ${c.url}\n`);
}

// ── Interactive CLI Execution ─────────────────────────────────────────────────

async function main() {
  printBanner();

  const rl = readline.createInterface({ input, output });
  const rawArgs = process.argv.slice(2);

  let initialQuery = rawArgs.join(" ").trim();

  // Handle explicit flag shortcuts: --org, --issue, --repo
  let explicitTarget: string | null = null;
  const orgIdx = rawArgs.indexOf("--org");
  if (orgIdx !== -1 && rawArgs[orgIdx + 1]) {
    explicitTarget = rawArgs[orgIdx + 1];
    initialQuery = `org ${explicitTarget}`;
  }
  const issueIdx = rawArgs.indexOf("--issue");
  if (issueIdx !== -1 && rawArgs[issueIdx + 1]) {
    explicitTarget = rawArgs[issueIdx + 1];
    initialQuery = explicitTarget;
  }
  const repoIdx = rawArgs.indexOf("--repo");
  if (repoIdx !== -1 && rawArgs[repoIdx + 1]) {
    explicitTarget = rawArgs[repoIdx + 1];
    initialQuery = explicitTarget;
  }

  if (!initialQuery) {
    console.log(`${C.bold}What are you looking for?${C.reset}`);
    console.log(`${C.dim}Type a natural language description (e.g. 'I know Python and docs in openstreetmap under 1 hour'),${C.reset}`);
    console.log(`${C.dim}or paste a GitHub organization/repo/issue URL:${C.reset}\n`);

    initialQuery = await rl.question(`${C.cyan}> ${C.reset}`);
  }

  if (!initialQuery.trim()) {
    console.log("No input provided. Exiting.");
    rl.close();
    return;
  }

  console.log(`\n${C.dim}Analyzing query with Gemma 4...${C.reset}`);
  const intent = await parseIntent(initialQuery);

  if (explicitTarget) {
    intent.target = explicitTarget;
  }

  // Display parsed profile
  console.log(`\n${C.bold}┌────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.bold}│ PARSED DEVELOPER PROFILE                               │${C.reset}`);
  console.log(`${C.bold}├────────────────────────────────────────────────────────┤${C.reset}`);
  console.log(`│ ${C.bold}Tier        :${C.reset} ${intent.tier.padEnd(41)} │`);
  console.log(`│ ${C.bold}Languages   :${C.reset} ${intent.stack.map((s) => `${s.tech} (${s.fluency}/5)`).join(", ").slice(0, 41).padEnd(41)} │`);
  console.log(`│ ${C.bold}Interests   :${C.reset} ${(intent.interests.join(", ") || "general").slice(0, 41).padEnd(41)} │`);
  console.log(`│ ${C.bold}Time Budget :${C.reset} ${intent.timeBudget.padEnd(41)} │`);
  console.log(`│ ${C.bold}Target Scope:${C.reset} ${(intent.target || "Global Catalogue Match").slice(0, 41).padEnd(41)} │`);
  console.log(`${C.bold}└────────────────────────────────────────────────────────┘${C.reset}\n`);

  const profile = toFullProfile(intent);

  // Check if target is an org, repo, or issue
  const targetParsed = intent.target ? parseGitHubTarget(intent.target) : null;

  let candidates: RankedCandidate[] = [];

  try {
    if (targetParsed?.kind === "owner") {
      console.log(`${C.cyan}🏢 Performing budgeted discovery across organization: ${C.bold}${targetParsed.owner}${C.reset}...`);
      const orgResult = await discoverOrgCandidates(targetParsed.owner, profile);
      console.log(`${C.dim}Scanned ${orgResult.selectedRepos.length} most active of ${orgResult.totalPublicRepos} public repositories (${orgResult.selectedRepos.map((r) => r.split("/")[1]).join(", ")}) — found ${orgResult.candidates.length} verified candidate issues.${C.reset}\n`);
      candidates = orgResult.candidates;
    } else if (targetParsed?.kind === "repo") {
      console.log(`${C.cyan}📦 Performing discovery across repository: ${C.bold}${targetParsed.fullName}${C.reset}...`);
      const repoResult = await discoverRepoCandidates(targetParsed.fullName, profile);
      candidates = repoResult.candidates;
    } else if (targetParsed?.kind === "issue") {
      console.log(`${C.cyan}🎯 Verifying single issue: ${C.bold}${targetParsed.repo} #${targetParsed.number}${C.reset}...`);
      const single = await verifySingleIssue(targetParsed.repo, targetParsed.number, profile);
      candidates = [single];
    } else {
      console.log(`${C.cyan}🔍 Running global curated scout & hybrid issue matching...${C.reset}`);
      const match = await runMatch(profile, 6);
      candidates = match.candidates;
    }
  } catch (err) {
    console.error(`${C.red}Error fetching issues:${C.reset}`, err instanceof Error ? err.message : err);
    rl.close();
    return;
  }

  if (candidates.length === 0) {
    console.log(`${C.yellow}No verified newcomer issues found matching your exact constraints. Try broadening your criteria or checking another organization.${C.reset}`);
    rl.close();
    return;
  }

  console.log(`${C.bold}Top Verified Candidates:${C.reset}\n`);
  candidates.forEach((cand, idx) => {
    printCandidate(cand, idx, intent.tier);
  });

  // Interactive guide prompt
  try {
    const choice = await rl.question(
      `${C.bold}Enter an issue number (1-${candidates.length}) to generate a step-by-step guide, or press [Enter] to exit: ${C.reset}`,
    );

    const selectedIdx = parseInt(choice.trim(), 10) - 1;
    if (!isNaN(selectedIdx) && selectedIdx >= 0 && selectedIdx < candidates.length) {
      const selected = candidates[selectedIdx];
      console.log(`\n${C.cyan}Building getting-started guide for [${selected.repo} #${selected.number}]...${C.reset}\n`);

      try {
        const guide = await buildGuidance(selected, profile);

        console.log(`${C.bold}================================================================${C.reset}`);
        console.log(`${C.bold}STEP-BY-STEP GETTING-STARTED GUIDE${C.reset}`);
        console.log(`${C.bold}================================================================${C.reset}\n`);

        console.log(`${C.bold}Summary:${C.reset}`);
        console.log(`${guide.summary}\n`);

        console.log(`${C.bold}1. Setup Steps:${C.reset}`);
        guide.setupSteps.forEach((step, i) => console.log(`   ${i + 1}. ${step}`));
        console.log("");

        console.log(`${C.bold}2. Where to Look (Verified File Citations):${C.reset}`);
        guide.whereToLook.forEach((item) => {
          console.log(`   • ${C.cyan}${item.path}${C.reset}: ${item.why}`);
        });
        console.log("");

        console.log(`${C.bold}3. Proposed Approach:${C.reset}`);
        guide.approach.forEach((app, i) => console.log(`   ${i + 1}. ${app}`));
        console.log("");

        console.log(`${C.bold}4. First Commit Plan:${C.reset}`);
        guide.firstCommit.forEach((fc, i) => console.log(`   ${i + 1}. ${fc}`));
        console.log("\nGood luck with your contribution!\n");
      } catch (err) {
        console.error(`${C.red}Error generating guide:${C.reset}`, err instanceof Error ? err.message : err);
      }
    }
  } catch {
    // Non-interactive or stdin EOF
  }

  rl.close();
}

main().catch((err) => {
  console.error("Fatal CLI error:", err);
  process.exit(1);
});
