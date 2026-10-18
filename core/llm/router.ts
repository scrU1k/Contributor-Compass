import type { Guidance, IssueCandidate, JevDecision, Profile, RankedCandidate, RepoSignals } from "@/core/types";
import { evaluateIssueWithJev } from "@/core/verify/jev";
import { buildGuidance } from "@/core/guide/guide";

/**
 * Dual-Engine Execution Router.
 *
 * Implements the System 1 (Jev Decision Engine) vs System 2 (Copilot Mentor)
 * self-triggered toggle across the application.
 */

export type GemmaExecutionMode =
  | {
      type: "SYSTEM_1_JEV";
      candidate: IssueCandidate;
      signals: RepoSignals;
    }
  | {
      type: "SYSTEM_2_COPILOT";
      candidate: RankedCandidate;
      profile: Profile;
    };

export type GemmaExecutionResult =
  | { type: "SYSTEM_1_JEV"; decision: JevDecision }
  | { type: "SYSTEM_2_COPILOT"; guidance: Guidance };

export async function dispatchGemma(mode: GemmaExecutionMode): Promise<GemmaExecutionResult> {
  if (mode.type === "SYSTEM_1_JEV") {
    const decision = await evaluateIssueWithJev(mode.candidate, mode.signals);
    return { type: "SYSTEM_1_JEV", decision };
  }

  const guidance = await buildGuidance(mode.candidate, mode.profile);
  return { type: "SYSTEM_2_COPILOT", guidance };
}
