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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

function saveToDotEnv(llmKey?: string, ghToken?: string): void {
  const p = path.join(process.cwd(), ".env");
  let content = existsSync(p) ? readFileSync(p, "utf8") : "";

  if (llmKey !== undefined && llmKey.trim()) {
    const key = llmKey.trim();
    if (/^LLM_API_KEY=/m.test(content)) {
      content = content.replace(/^LLM_API_KEY=.*/m, `LLM_API_KEY=${key}`);
    } else {
      content += `\nLLM_API_KEY=${key}`;
    }
    process.env.LLM_API_KEY = key;
    if (!process.env.LLM_BASE_URL) {
      process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    }
    if (!process.env.LLM_MODEL) {
      process.env.LLM_MODEL = "gemma-4-31b-it";
    }
  }

  if (ghToken !== undefined && ghToken.trim()) {
    const token = ghToken.trim();
    if (/^GITHUB_TOKEN=/m.test(content)) {
      content = content.replace(/^GITHUB_TOKEN=.*/m, `GITHUB_TOKEN=${token}`);
    } else {
      content += `\nGITHUB_TOKEN=${token}`;
    }
    process.env.GITHUB_TOKEN = token;
  }

  try {
    writeFileSync(p, content.trim() + "\n", "utf8");
  } catch {
    // Read-only filesystem fallback
  }
}

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

function printHelp(): void {
  console.log(`\n${C.bold}${C.cyan}🧭 CONTRIBUTOR COMPASS — CLI MANUAL & REFERENCE${C.reset}`);
  console.log(`${C.dim}"Verified, not listed." Good-first-issue lists go stale. We verify doable work.${C.reset}\n`);

  console.log(`${C.bold}BASIC USAGE:${C.reset}`);
  console.log(`  ${C.green}npm run cli${C.reset}                              Interactive questionnaire / prompt`);
  console.log(`  ${C.green}npm run cli -- "<natural language query>"${C.reset} One-shot search in plain English`);
  console.log(`  ${C.green}npm run cli -- --help${C.reset}                    Display this manual`);
  console.log(`  ${C.green}npm run cli -- --keys${C.reset}                    Configure Gemma & GitHub API credentials\n`);

  console.log(`${C.bold}COMMANDS & TARGET FLAGS:${C.reset}`);
  console.log(`  ${C.cyan}--help, -h${C.reset}               Show this help message and exit`);
  console.log(`  ${C.cyan}--keys${C.reset}                   Interactively set and save your API keys to .env`);
  console.log(`  ${C.cyan}--llm-key <key>${C.reset}          Provide Google AI Studio Gemma LLM key for this run`);
  console.log(`  ${C.cyan}--github-token <token>${C.reset}   Provide GitHub Personal Access Token for this run`);
  console.log(`  ${C.cyan}--org <name>${C.reset}            Scan up to 100 public repos in an org (e.g. --org openstreetmap)`);
  console.log(`  ${C.cyan}--repo <owner/repo>${C.reset}     Scan a specific repository (e.g. --repo pallets/flask)`);
  console.log(`  ${C.cyan}--issue <url|spec>${C.reset}      Verify a single issue (e.g. --issue pallets/flask#5555)\n`);

  console.log(`${C.bold}INTERACTIVE QUESTIONNAIRE:${C.reset}`);
  console.log(`  Type ${C.yellow}"I am a beginner"${C.reset} or ${C.yellow}"I am experienced"${C.reset} (or run ${C.green}npm run cli${C.reset} with no args)`);
  console.log(`  to launch the guided 5-step questionnaire directly in your terminal.`);
  console.log(`  Or provide everything in one go:`);
  console.log(`  ${C.dim}e.g. 'I know Python and docs, looking for starter issues in openstreetmap'${C.reset}\n`);

  console.log(`${C.bold}BRING YOUR OWN KEYS (BYOK):${C.reset}`);
  console.log(`  • ${C.bold}Keys are 100% optional!${C.reset} Deterministic triage (PR competition, assigned status,`);
  console.log(`    repo activity) runs out of the box with zero keys.`);
  console.log(`  • ${C.bold}Google AI Studio Key:${C.reset} Powers Gemma 4 Jev System-1 advisory checks and`);
  console.log(`    personalized step-by-step contribution guides with verified file paths.`);
  console.log(`    Get a free key: https://aistudio.google.com/apikey`);
  console.log(`  • ${C.bold}GitHub Token:${C.reset} Increases rate limits from 60 to 5,000 requests/hour.`);
  console.log(`    Create a personal access token at: https://github.com/settings/tokens`);
  console.log(`  • Save keys permanently via: ${C.green}npm run cli -- --keys${C.reset} or edit ${C.cyan}.env${C.reset}.\n`);
}

async function promptForKeys(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}🔑 CONFIGURE API CREDENTIALS (BYOK)${C.reset}`);
  console.log(`${C.dim}Credentials are saved to local .env and used across CLI discovery runs.${C.reset}\n`);

  const currentLlm = process.env.LLM_API_KEY
    ? "configured (" + process.env.LLM_API_KEY.slice(0, 6) + "..." + process.env.LLM_API_KEY.slice(-4) + ")"
    : "not configured (using deterministic fallback)";
  const currentGh = process.env.GITHUB_TOKEN
    ? "configured (" + process.env.GITHUB_TOKEN.slice(0, 4) + "..." + process.env.GITHUB_TOKEN.slice(-4) + ")"
    : "not configured (public unauthenticated 60 req/hr)";

  console.log(`  ${C.bold}Gemma LLM Key :${C.reset} ${C.yellow}${currentLlm}${C.reset}`);
  console.log(`  ${C.bold}GitHub Token  :${C.reset} ${C.yellow}${currentGh}${C.reset}\n`);

  console.log(`${C.dim}Press Enter without typing to keep existing credentials.${C.reset}\n`);
  const newLlm = await rl.question(`${C.bold}Google AI Studio Key (Gemma 4): ${C.reset}`);
  const newGh = await rl.question(`${C.bold}GitHub Personal Access Token  : ${C.reset}`);

  if (newLlm.trim() || newGh.trim()) {
    saveToDotEnv(newLlm.trim() || undefined, newGh.trim() || undefined);
    console.log(`\n${C.green}✓ Saved credentials to .env successfully!${C.reset}\n`);
  } else {
    console.log(`\n${C.dim}No credential changes made.${C.reset}\n`);
  }
}

function isQuestionnaireTrigger(text: string, hasExplicitTarget = false): { isTrigger: boolean; initialTier?: Tier } {
  if (hasExplicitTarget) return { isTrigger: false };
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return { isTrigger: true, initialTier: "newcomer" };

  if (["help", "--help", "-h", "?", "keys", "--keys"].includes(trimmed)) {
    return { isTrigger: false };
  }

  // Pure tier expressions
  if (
    /^i(?:'?m| am)?\s*(?:a\s*)?(?:beginner|newcomer|noob|starter|novice)$/i.test(trimmed) ||
    /^(?:beginner|newcomer|novice)$/i.test(trimmed) ||
    /^i want to learn$/i.test(trimmed)
  ) {
    return { isTrigger: true, initialTier: "newcomer" };
  }

  if (
    /^i(?:'?m| am)?\s*(?:an?\s*)?(?:experienced|senior|pro|expert|veteran)(?:\s*developer)?$/i.test(trimmed) ||
    /^(?:experienced|senior|pro|expert)$/i.test(trimmed) ||
    /^i want to merge fast$/i.test(trimmed)
  ) {
    return { isTrigger: true, initialTier: "experienced" };
  }

  if (["questionnaire", "interactive", "start", "wizard"].includes(trimmed)) {
    return { isTrigger: true, initialTier: "newcomer" };
  }

  // If user says "I am a beginner looking for an issue" or "I am experienced" without mentioning a tech stack or URL
  const mentionsTech = /\b(python|javascript|typescript|js|ts|rust|go|golang|java|c\+\+|cpp|c|ruby|php|html|css|react|node|swift|kotlin|c#)\b/i.test(trimmed);
  const mentionsTarget = /\b(https?:\/\/github\.com|in\s+[a-z0-9_-]+|org\s+[a-z0-9_-]+)\b/i.test(trimmed);
  if (!mentionsTech && !mentionsTarget) {
    if (/\b(beginner|newcomer)\b/i.test(trimmed)) return { isTrigger: true, initialTier: "newcomer" };
    if (/\b(experienced|senior|pro)\b/i.test(trimmed)) return { isTrigger: true, initialTier: "experienced" };
  }

  return { isTrigger: false };
}

async function runQuestionnaire(rl: readline.Interface, preselectedTier?: Tier): Promise<ParsedUserIntent> {
  console.log(`\n${C.bold}${C.cyan}📋 CONTRIBUTOR QUESTIONNAIRE${C.reset}`);
  console.log(`${C.dim}Answer these quick questions so we can match you to verified, achievable issues.${C.reset}\n`);

  let tier: Tier = preselectedTier ?? "newcomer";
  if (!preselectedTier) {
    console.log(`${C.bold}1. Where are you starting from?${C.reset}`);
    console.log(`   [1] Newcomer / Beginner (learn the ropes, approachable issues, step-by-step guidance)`);
    console.log(`   [2] Experienced (move fast, unblock complex architecture, skip basic setup)`);
    const ans = await rl.question(`${C.cyan}Select 1 or 2 [Default: 1]: ${C.reset}`);
    tier = ans.trim() === "2" ? "experienced" : "newcomer";
    console.log(`   ${C.green}✓ Selected: ${tier}${C.reset}\n`);
  } else {
    console.log(`${C.bold}1. Experience tier:${C.reset} ${C.green}${tier}${C.reset}\n`);
  }

  console.log(`${C.bold}2. What programming languages or technologies do you know?${C.reset}`);
  console.log(`${C.dim}   (e.g. Python, TypeScript, Rust, C++, Go, React, C, etc.)${C.reset}`);
  const stackAns = await rl.question(`${C.cyan}> ${C.reset}`);
  const stackList = stackAns
    .split(/[,;&|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const stack: StackItem[] =
    stackList.length > 0
      ? stackList.map((tech) => ({ tech, fluency: tier === "newcomer" ? 2 : 4 }))
      : [{ tech: "Python", fluency: 3 }];
  console.log(`   ${C.green}✓ Tech stack: ${stack.map((s) => s.tech).join(", ")}${C.reset}\n`);

  console.log(`${C.bold}3. What topics, domains, or types of work interest you?${C.reset}`);
  console.log(`${C.dim}   (e.g. games, astronomy, documentation, cybersecurity, bug fixes, web, devtools)${C.reset}`);
  const interestAns = await rl.question(`${C.cyan}> ${C.reset}`);
  const interests = interestAns
    .split(/[,;&|]+/)
    .map((i) => i.trim())
    .filter(Boolean);
  if (interests.length === 0) {
    interests.push("documentation");
  }
  console.log(`   ${C.green}✓ Interests: ${interests.join(", ")}${C.reset}\n`);

  console.log(`${C.bold}4. What is your time budget for this contribution?${C.reset}`);
  console.log(`   [1] Under 1 hour (<1h quick wins)`);
  console.log(`   [2] A weekend (a few hours of focused work)`);
  console.log(`   [3] Ongoing project`);
  const timeAns = await rl.question(`${C.cyan}Select 1, 2, or 3 [Default: 2]: ${C.reset}`);
  let timeBudget: "under-1h" | "weekend" | "ongoing" = "weekend";
  if (timeAns.trim() === "1") timeBudget = "under-1h";
  if (timeAns.trim() === "3") timeBudget = "ongoing";
  console.log(`   ${C.green}✓ Time budget: ${timeBudget}${C.reset}\n`);

  console.log(`${C.bold}5. Target scope (Optional):${C.reset}`);
  console.log(`${C.dim}   Enter a GitHub org (e.g. openstreetmap), repo (e.g. pallets/flask), issue URL, or press Enter for global curated search:${C.reset}`);
  const targetAns = await rl.question(`${C.cyan}> ${C.reset}`);
  const target = targetAns.trim() || null;
  if (target) {
    console.log(`   ${C.green}✓ Target: ${target}${C.reset}\n`);
  } else {
    console.log(`   ${C.green}✓ Target: Global Curated Catalogue${C.reset}\n`);
  }

  return { tier, stack, interests, timeBudget, target };
}

// ── Interactive CLI Execution ─────────────────────────────────────────────────

async function main() {
  printBanner();

  const rl = readline.createInterface({ input, output });
  const rawArgs = process.argv.slice(2);

  // Check help flags
  if (
    rawArgs.includes("--help") ||
    rawArgs.includes("-h") ||
    (rawArgs.length === 1 && rawArgs[0].toLowerCase() === "help")
  ) {
    printHelp();
    rl.close();
    return;
  }

  // Check keys flags
  if (
    rawArgs.includes("--keys") ||
    (rawArgs.length === 1 && rawArgs[0].toLowerCase() === "keys")
  ) {
    await promptForKeys(rl);
    rl.close();
    return;
  }

  // Handle direct API key / token flags
  const llmKeyIdx = rawArgs.indexOf("--llm-key") !== -1 ? rawArgs.indexOf("--llm-key") : rawArgs.indexOf("--api-key");
  if (llmKeyIdx !== -1 && rawArgs[llmKeyIdx + 1]) {
    process.env.LLM_API_KEY = rawArgs[llmKeyIdx + 1];
    if (!process.env.LLM_BASE_URL) process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    if (!process.env.LLM_MODEL) process.env.LLM_MODEL = "gemma-4-31b-it";
  }

  const tokenIdx = rawArgs.indexOf("--github-token") !== -1 ? rawArgs.indexOf("--github-token") : rawArgs.indexOf("--token");
  if (tokenIdx !== -1 && rawArgs[tokenIdx + 1]) {
    process.env.GITHUB_TOKEN = rawArgs[tokenIdx + 1];
  }

  // Handle explicit flag shortcuts: --org, --issue, --repo
  let explicitTarget: string | null = null;
  const orgIdx = rawArgs.indexOf("--org");
  if (orgIdx !== -1 && rawArgs[orgIdx + 1]) {
    explicitTarget = rawArgs[orgIdx + 1];
  }
  const issueIdx = rawArgs.indexOf("--issue");
  if (issueIdx !== -1 && rawArgs[issueIdx + 1]) {
    explicitTarget = rawArgs[issueIdx + 1];
  }
  const repoIdx = rawArgs.indexOf("--repo");
  if (repoIdx !== -1 && rawArgs[repoIdx + 1]) {
    explicitTarget = rawArgs[repoIdx + 1];
  }

  // Filter out parsed flags from query string
  const cleanArgs: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (["--org", "--issue", "--repo", "--llm-key", "--api-key", "--github-token", "--token"].includes(a)) {
      i++; // skip value
      continue;
    }
    if (["--keys", "--help", "-h"].includes(a)) continue;
    cleanArgs.push(a);
  }

  let initialQuery = cleanArgs.join(" ").trim();

  if (!initialQuery && !explicitTarget) {
    console.log(`${C.bold}What are you looking for?${C.reset}`);
    console.log(`${C.dim}• Type in one go (e.g. 'I know Python and docs in openstreetmap')${C.reset}`);
    console.log(`${C.dim}• Type 'I am a beginner' or 'I am experienced' to launch the questionnaire${C.reset}`);
    console.log(`${C.dim}• Type 'keys' to configure credentials, or 'help' for the CLI guide:${C.reset}\n`);

    initialQuery = await rl.question(`${C.cyan}> ${C.reset}`);
  }

  if (explicitTarget && !initialQuery) {
    initialQuery = explicitTarget;
  }

  if (initialQuery.trim().toLowerCase() === "help") {
    printHelp();
    rl.close();
    return;
  }

  if (initialQuery.trim().toLowerCase() === "keys") {
    await promptForKeys(rl);
    rl.close();
    return;
  }

  let intent: ParsedUserIntent;
  const trigger = isQuestionnaireTrigger(initialQuery, Boolean(explicitTarget));

  if (trigger.isTrigger) {
    intent = await runQuestionnaire(rl, trigger.initialTier);
  } else {
    console.log(`\n${C.dim}Analyzing query with Gemma 4...${C.reset}`);
    intent = await parseIntent(initialQuery);
  }

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
