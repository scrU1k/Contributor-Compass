import type {
  Evidence,
  IssueCandidate,
  JevDecision,
  Profile,
  ReadinessScore,
  RepoSignals,
  ScoreWeights,
} from "@/core/types";
import { TIERS } from "@/core/config/tiers";
import { effortFromLabels } from "@/core/format/effort";

/**
 * The Contribution Readiness Score.
 *
 * Six sub-scores, each normalised to [0,1], combined by tier weights into 0–100.
 * Pure functions — no I/O, no clock beyond `now`, so it is trivially testable
 * and explainable on stage.
 */

export interface ScoreOptions {
  /** Verification side door: personal fit is not assessed, so it is excluded. */
  ignoreFit?: boolean;
  /** Gemma-Jev System-1 decision record. */
  jev?: JevDecision;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function withoutFit(base: ScoreWeights): ScoreWeights {
  const rest = 1 - base.fit;
  if (rest <= 0) return base;
  return {
    fit: 0,
    accessibility: base.accessibility / rest,
    liveness: base.liveness / rest,
    issueQuality: base.issueQuality / rest,
    competition: base.competition / rest,
    setupCost: base.setupCost / rest,
  };
}

export function daysSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 999;
  return Math.max(0, (now - t) / 86_400_000);
}

/**
 * Weighted overlap between what the user knows/cares about and what the repo is.
 * Fluency raises the weight, so a fluent language counts for more than a
 * passing interest.
 */
export function tagOverlap(profile: Profile, signals: RepoSignals): number {
  const want = new Map<string, number>();
  for (const s of profile.stack) want.set(s.tech.toLowerCase(), 1 + s.fluency / 5);
  for (const i of profile.interests) want.set(i.toLowerCase(), 1);

  if (want.size === 0) return 0;

  const loose = [...(signals.topics ?? []), signals.language ?? ""]
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  const exact = new Set(
    (signals.description ?? "")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter(Boolean),
  );

  let hit = 0;
  let total = 0;
  for (const [key, weight] of want) {
    total += weight;
    const matched =
      loose.some((h) => h === key || h.includes(key) || key.includes(h)) || exact.has(key);
    if (matched) hit += weight;
  }

  return total === 0 ? 0 : clamp01(hit / total);
}

export function scoreCandidate(
  candidate: IssueCandidate,
  profile: Profile,
  opts: ScoreOptions = {},
): ReadinessScore {
  const s = candidate.signals;
  const base = TIERS[profile.tier].weights;
  const weights = opts.ignoreFit ? withoutFit(base) : base;
  const evidence: Evidence[] = [];

  // ── fit ────────────────────────────────────────────────────────────────────
  const repoFit = tagOverlap(profile, s);
  const issueText = `${candidate.title} ${candidate.body} ${candidate.labels.join(" ")}`.toLowerCase();
  const typeSignals: Record<string, RegExp> = {
    docs: /\b(doc|docs|documentation|readme|translation|localization)\b/i,
    tests: /\b(test|tests|testing|coverage|spec|regression)\b/i,
    design: /\b(ui|ux|css|design|accessibility|visual)\b/i,
    translation: /\b(translation|localization|i18n|l10n)\b/i,
    triage: /\b(triage|reproduce|reproduction|label|issue report)\b/i,
  };
  const selectedTypes = profile.contributionTypes.filter((type) => type !== "code");
  const typeHits = selectedTypes.filter((type) => typeSignals[type]?.test(issueText)).length;
  const issueTypeFit = selectedTypes.length ? (typeHits ? 1 : 0.5) : 1.0;
  const fit = r3(repoFit * 0.8 + issueTypeFit * 0.2);
  evidence.push({
    id: "fit",
    label: "Match with your stack & interests",
    value: opts.ignoreFit ? "not assessed (no profile)" : `${Math.round(fit * 100)}% (repo and issue signals)`,
    weight: weights.fit,
    source: `https://github.com/${s.fullName}`,
  });

  // ── accessibility ──────────────────────────────────────────────────────────
  const accessItems: [boolean, number, string][] = [
    [s.hasReadmeSetup, 0.25, "README with setup"],
    [s.hasContributing, 0.2, "CONTRIBUTING guide"],
    [s.hasCI, 0.15, "CI pipeline"],
    [s.hasTests, 0.15, "Test suite"],
    [s.hasDevcontainer, 0.1, "Devcontainer"],
    [Boolean(s.license), 0.1, "License"],
    [s.hasCodeOfConduct, 0.05, "Code of conduct"],
  ];
  let accessibility = clamp01(
    accessItems.reduce((acc, [present, w]) => acc + (present ? w : 0), 0),
  );
  if (profile.fears.includes("setup") && !s.hasReadmeSetup) accessibility = clamp01(accessibility - 0.2);
  if (profile.fears.includes("codebase") && s.sizeKb > 500_000) accessibility = clamp01(accessibility - 0.15);
  if (profile.fears.includes("review") && s.mergedPRsFromOutsiders90d === 0) accessibility = clamp01(accessibility - 0.15);
  evidence.push({
    id: "accessibility",
    label: "Can you actually run it",
    value: `${Math.round(accessibility * 100)}% (${accessItems
      .filter(([p]) => p)
      .map(([, , label]) => label)
      .join(", ") || "nothing documented"})`,
    weight: weights.accessibility,
    source: `https://github.com/${s.fullName}`,
  });

  // ── liveness ───────────────────────────────────────────────────────────────
  const recency = Math.exp(-daysSince(s.pushedAt) / 60);
  const merges = clamp01(s.mergedPRsFromOutsiders90d / 10);
  const liveness = clamp01(0.5 * recency + 0.5 * merges);
  evidence.push({
    id: "liveness",
    label: "Will anyone merge it",
    value: `last commit ${Math.round(daysSince(s.pushedAt))}d ago, ${
      !s.outsiderMergeStatusKnown ? "outside-merge history unavailable" :
      `${s.outsiderMergeSampled ? "at least " : ""}${s.mergedPRsFromOutsiders90d} outsider merges/90d`
    }`,
    weight: weights.liveness,
    source: `https://github.com/${s.fullName}`,
  });

  // ── issue quality ──────────────────────────────────────────────────────────
  const fresh = Math.exp(-daysSince(candidate.updatedAt) / 45);
  const unassigned = candidate.assigned ? 0.35 : 1;
  const labelsScore = candidate.labels.length > 0 ? 1 : 0.4;

  // If a Gemma-Jev decision is available, semantic verification replaces dumb body length!
  const jev = opts.jev ?? candidate.score?.jevDecision ?? candidate.jevDecision;
  const semanticScore = jev ? jev.labelAccuracyScore : clamp01(candidate.body.length / 600);

  // A large-effort issue is not a first PR, however well written it is. The
  // newcomer tier exists to protect exactly that; experienced users asked for
  // scope, so their score is left alone.
  const effort = effortFromLabels(candidate.labels);
  const effortFactor =
    profile.timeBudget === "under-1h"
      ? effort === "large" ? 0.35 : effort === "medium" ? 0.65 : 1
      : profile.tier === "newcomer" && effort === "large" ? 0.5 : 1;

  const issueQuality = clamp01(
    (0.3 * fresh + 0.25 * unassigned + 0.25 * semanticScore + 0.2 * labelsScore) * effortFactor,
  );

  if (jev) {
    evidence.push({
      id: "jev-verification",
      label: "Gemma-Jev Semantic Check",
      value:
        jev.verdict === "MISLABELED_TRAP"
          ? `⚠️ Trap (${Math.round(jev.confidence * 100)}% conf): ${jev.evidence}`
          : jev.verdict === "VERIFIED_READY"
            ? `✅ Verified (${Math.round(jev.confidence * 100)}% conf): ${jev.evidence}`
            : `${jev.verdict}: ${jev.evidence}`,
      weight: 0.35,
      source: "Gemma 4 Jev Harness",
    });
  }

  evidence.push({
    id: "issue-quality",
    label: "Is the issue doable",
    value: [
      candidate.assigned ? "already assigned" : "unassigned",
      jev ? `Jev: ${jev.verdict}` : candidate.body.length < 120 ? "thin description" : "described",
      effort !== "unknown"
        ? `labelled ${effort} effort`
        : candidate.labels.length
          ? `labels: ${candidate.labels.slice(0, 3).join(", ")}`
          : "unlabelled",
    ].join(" · "),
    weight: weights.issueQuality,
    source: candidate.url,
  });

  // ── competition ────────────────────────────────────────────────────────────
  const competition = clamp01(
    candidate.linkedOpenPRs === null
      ? 0.5
      : 1 / (1 + candidate.linkedOpenPRs + Math.max(0, candidate.comments - 15) / 10),
  );
  evidence.push({
    id: "competition",
    label: "Are you too late",
    value: `${candidate.linkedOpenPRs === null ? "PR status unknown" : `${candidate.linkedOpenPRs} open PR(s) referencing it`}, ${candidate.comments} comment(s)`,
    weight: weights.competition,
    source: candidate.url,
  });

  // ── setup cost ─────────────────────────────────────────────────────────────
  const setupCost = clamp01(1 - s.dependencyWeight);
  evidence.push({
    id: "setup-cost",
    label: "Setup weight",
    value: `${s.language ?? "unknown"} · ${Math.round(s.dependencyWeight * 100)}%`,
    weight: weights.setupCost,
    source: `https://github.com/${s.fullName}`,
  });

  const total = r3(
    100 *
      (weights.fit * fit +
        weights.accessibility * accessibility +
        weights.liveness * liveness +
        weights.issueQuality * issueQuality +
        weights.competition * competition +
        weights.setupCost * setupCost),
  );

  return {
    fit: r3(fit),
    accessibility: r3(accessibility),
    liveness: r3(liveness),
    issueQuality: r3(issueQuality),
    competition: r3(competition),
    setupCost: r3(setupCost),
    total,
    weights,
    evidence,
    jevDecision: jev,
  };
}
