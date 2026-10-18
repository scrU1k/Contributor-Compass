/**
 * Warm the cache for the scenarios you intend to demo.
 *
 * Usage:
 *   npm run prefetch                # warm every scenario
 *   npm run prefetch -- newcomer    # warm one
 *
 * Run this on a working connection BEFORE you present, then set
 * COMPASS_OFFLINE=1 in .env and restart. The demo then cannot fail on network.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Profile } from "@/core/types";

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

const { runMatch } = await import("@/core/pipeline");
const { buildGuidance } = await import("@/core/guide/guide");
const { explainCandidate } = await import("@/core/explain/explain");
const { cacheStats } = await import("@/core/cache/cache");

interface Scenario {
  name: string;
  profile: Profile;
}

const SCENARIOS: Scenario[] = [
  {
    name: "newcomer",
    profile: {
      tier: "newcomer",
      experienceLevel: "newcomer",
      goal: "learn",
      stack: [
        { tech: "Python", fluency: 2 },
        { tech: "JavaScript", fluency: 2 },
      ],
      interests: ["documentation", "education", "web"],
      contributionTypes: ["code", "docs", "tests"],
      timeBudget: "weekend",
      constraints: { requireCI: false, maxRepoSize: "small" },
      issueSize: "tiny",
    },
  },
  {
    name: "experienced",
    profile: {
      tier: "experienced",
      experienceLevel: "experienced",
      goal: "merge-fast",
      stack: [
        { tech: "TypeScript", fluency: 5 },
        { tech: "Go", fluency: 4 },
        { tech: "Rust", fluency: 3 },
      ],
      interests: ["developer tools", "cli", "performance"],
      contributionTypes: ["code", "tests"],
      timeBudget: "under-1h",
      constraints: { requireCI: true },
      issueSize: "small",
    },
  },
];

async function main(): Promise<void> {
  const only = process.argv[2];
  const scenarios = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`No scenario named "${only}". Available: ${SCENARIOS.map((s) => s.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.name} ===`);
    const started = Date.now();

    try {
      const { candidates: results, scout } = await runMatch(scenario.profile, 6);
      console.log(
        `scouted ${scout.repos.length} repo(s) via ${scout.source} in ${Date.now() - started}ms`,
      );
      for (const repo of scout.repos) console.log(`   · ${repo.fullName} — ${repo.why}`);
      console.log(`ranked ${results.length} candidate(s)\n`);

      for (const [i, candidate] of results.entries()) {
        console.log(
          `${String(i + 1).padStart(2)}. [${candidate.score.total.toFixed(1).padStart(5)}] ${candidate.repo}#${candidate.number}`,
        );
        console.log(`    ${candidate.title}`);
        console.log(`    fit=${candidate.score.fit} access=${candidate.score.accessibility} live=${candidate.score.liveness}`);
      }

      const top = results[0];
      if (top) {
        console.log("\n  -- why --");
        console.log(`  ${await explainCandidate(top, scenario.profile)}`);
        console.log("\n  -- guide --");
        const guide = await buildGuidance(top, scenario.profile);
        console.log(`  ${guide.summary}`);
        for (const step of guide.setupSteps) console.log(`   · ${step}`);
        for (const loc of guide.whereToLook) console.log(`   → ${loc.path} — ${loc.why}`);
      }
    } catch (err) {
      console.error(`  failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const stats = await cacheStats();
  console.log(`\ncache: ${stats.files} file(s), ${(stats.bytes / 1024).toFixed(1)} KB in ${stats.dir}`);
}

await main();
