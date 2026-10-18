/**
 * Shared domain types for Contributor Compass.
 *
 * These are the contract between every stage of the pipeline:
 *   profile → query builder → retrieve → verify & score → rank → explain → guide
 */

// ── Profile ──────────────────────────────────────────────────────────────────

export type Tier = "newcomer" | "experienced";
export type ExperienceLevel = "newcomer" | "dabbler" | "experienced";
export type Goal = "learn" | "merge-fast" | "maintainer-track" | "portfolio";
export type ContributionType = "code" | "docs" | "tests" | "design" | "translation" | "triage";
export type TimeBudget = "under-1h" | "weekend" | "ongoing";
export type IssueSize = "tiny" | "small" | "any";

export interface StackItem {
  tech: string;
  /** 1 = heard of it, 5 = fluent. */
  fluency: 1 | 2 | 3 | 4 | 5;
}

export interface Profile {
  tier: Tier;
  experienceLevel: ExperienceLevel;
  goal: Goal;
  stack: StackItem[];
  interests: string[];
  fears: string[];
  contributionTypes: ContributionType[];
  timeBudget: TimeBudget;
  constraints: {
    license?: string[];
    requireCI?: boolean;
    maxRepoSize?: "small" | "medium" | "any";
    communicationLanguage?: string[];
  };
  issueSize: IssueSize;
}

// ── Evidence ─────────────────────────────────────────────────────────────────

/**
 * A single, checkable justification. Provenance matters: every claim shown to a
 * user should trace back to a source we actually fetched.
 */
export interface Evidence {
  id: string;
  label: string;
  value: string;
  weight: number;
  /** URL or API path this came from. */
  source: string;
}

// ── Repository signals ───────────────────────────────────────────────────────

export interface RepoSignals {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  createdAt: string;
  pushedAt: string;
  openIssues: number;
  sizeKb: number;
  license: string | null;
  hasReadmeSetup: boolean;
  hasContributing: boolean;
  hasNewContributorGuide: boolean;
  hasCI: boolean;
  hasTests: boolean;
  hasDevcontainer: boolean;
  hasCodeOfConduct: boolean;
  /** 0 = trivial to set up, 1 = heavy. */
  dependencyWeight: number;
  mergedPRsFromOutsiders90d: number;
  outsiderMergeSampled: boolean;
  outsiderMergeStatusKnown: boolean;
  medianMaintainerResponseHours: number | null;
  evidence: Evidence[];
}

// ── Candidates ───────────────────────────────────────────────────────────────

export interface IssueCandidate {
  repo: string;
  number: number;
  title: string;
  url: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  createdAt: string;
  updatedAt: string;
  assigned: boolean;
  comments: number;
  /** Open PRs that reference this issue — the competition signal. */
  /** null means the PR check failed or was incomplete; never treat as zero. */
  linkedOpenPRs: number | null;
  sizeHint: IssueSize;
  signals: RepoSignals;
  /** Semantic + tag fit, computed before scoring. */
  fit?: number;
  score?: ReadinessScore;
  jevDecision?: JevDecision;
}

export type ScoreKey =
  | "fit"
  | "accessibility"
  | "liveness"
  | "issueQuality"
  | "competition"
  | "setupCost";

export type ScoreWeights = Record<ScoreKey, number>;

export interface JevDecision {
  verdict: "VERIFIED_READY" | "MISLABELED_TRAP" | "NEEDS_TRIAGE" | "CONTESTED";
  confidence: number;            // heuristic model confidence; not statistically calibrated
  labelAccuracyScore: number;    // 0.0 to 1.0 (is 'good first issue' honest?)
  calibratedScope: "micro_fix" | "isolated_module" | "multi_file" | "architectural_overhaul";
  hiddenPrerequisites: string[]; // e.g. ['redis', 'docker', 'db_migration']
  evidence: string;              // Grounded 1-sentence explanation
  quote?: string | null;         // Verbatim substring extracted from issue body (if verified)
  quoteVerified?: boolean;       // True if quote exists verbatim in candidate.body
}

export interface ReadinessScore {
  fit: number;
  accessibility: number;
  liveness: number;
  issueQuality: number;
  competition: number;
  setupCost: number;
  /** Weighted total, 0–100. */
  total: number;
  weights: ScoreWeights;
  evidence: Evidence[];
  jevDecision?: JevDecision;
}

export interface RankedCandidate extends IssueCandidate {
  score: ReadinessScore;
  /** Human-readable "why this fits you". Deterministic or LLM-generated. */
  why: string;
}

// ── Scope questions ──────────────────────────────────────────────────────────

export interface ScopeQuestion {
  id: string;
  prompt: string;
  kind: "single" | "multi" | "text";
  options?: string[];
  why?: string;
}

// ── Guidance ─────────────────────────────────────────────────────────────────

export interface Guidance {
  summary: string;
  setupSteps: string[];
  /** Paths MUST be verified against the repo tree before render. */
  whereToLook: { path: string; why: string }[];
  approach: string[];
  firstCommit: string[];
  resources: { title: string; url: string }[];
}
