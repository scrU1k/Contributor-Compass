import type { ScoreWeights, Tier } from "@/core/types";

/**
 * A tier is a *configuration*, not a code path. Adding a third tier means adding
 * an entry here — no changes to scoring, retrieval, or ranking.
 */
export interface TierConfig {
  id: Tier;
  label: string;
  blurb: string;
  weights: ScoreWeights;
  guidanceDepth: "deep" | "concise";
  resultFraming: string;
}

export const TIERS: Record<Tier, TierConfig> = {
  newcomer: {
    id: "newcomer",
    label: "New to open source",
    blurb: "Guided path, jargon explained, genuinely doable first issues.",
    weights: {
      fit: 0.25,
      accessibility: 0.25,
      liveness: 0.15,
      issueQuality: 0.2,
      competition: 0.1,
      setupCost: 0.05,
    },
    guidanceDepth: "deep",
    resultFraming: "Your first PR plan",
  },
  experienced: {
    id: "experienced",
    label: "I know my stack",
    blurb: "Fast-ranked issues worth your time.",
    weights: {
      fit: 0.35,
      accessibility: 0.1,
      liveness: 0.25,
      issueQuality: 0.15,
      competition: 0.1,
      setupCost: 0.05,
    },
    guidanceDepth: "concise",
    resultFraming: "Issues worth your time",
  },
};

export const TIER_LIST: TierConfig[] = Object.values(TIERS);

/**
 * Cheap guard so a fat-fingered weight edit fails loudly instead of quietly
 * skewing every score.
 */
export function assertWeightsSumTo1(): void {
  for (const tier of TIER_LIST) {
    const sum = Object.values(tier.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      throw new Error(`Tier "${tier.id}" weights sum to ${sum}, expected 1`);
    }
  }
}
