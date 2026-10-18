import type { Profile, Tier } from "@/core/types";

/**
 * A profile for the verification side door, where the user pasted a link and
 * told us nothing else. Fit is explicitly excluded from scoring in that mode.
 */
export function minimalProfile(tier: Tier): Profile {
  return {
    tier,
    experienceLevel: tier === "newcomer" ? "newcomer" : "experienced",
    goal: tier === "newcomer" ? "learn" : "merge-fast",
    stack: [],
    interests: [],
    contributionTypes: ["code"],
    timeBudget: "weekend",
    constraints: {},
    issueSize: "any",
  };
}
