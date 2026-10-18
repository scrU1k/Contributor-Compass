import type { RankedCandidate } from "@/core/types";
import { effortFromLabels } from "@/core/format/effort";

/**
 * Plain-language rendering for the newcomer tier.
 *
 * A beginner cannot act on "4 outsider merges/90d". They can act on "people like
 * you have gotten merged here". Same evidence, different words.
 */

export function effortLabel(candidate: RankedCandidate): string {
  const effort = effortFromLabels(candidate.labels);
  if (effort === "large") return "a multi-day task";
  if (effort === "medium") return "a few hours";

  switch (candidate.sizeHint) {
    case "tiny":
      return "15–30 minutes";
    case "small":
      return "30–60 minutes";
    default:
      return "an hour or two";
  }
}

export function kindLabel(candidate: RankedCandidate): string {
  const labels = candidate.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes("doc"))) return "documentation fix";
  if (labels.some((l) => l.includes("test"))) return "test improvement";
  if (labels.some((l) => l.includes("bug"))) return "bug fix";
  if (labels.some((l) => l.includes("design") || l.includes("ui"))) return "small UI change";
  return "small code change";
}

export function friendliness(candidate: RankedCandidate): "friendly" | "established" | "quiet" {
  const s = candidate.signals;
  if (!s.outsiderMergeStatusKnown) return "established";
  if (s.hasContributing && s.mergedPRsFromOutsiders90d >= 3) return "friendly";
  if (s.mergedPRsFromOutsiders90d === 0 && !s.hasContributing) return "quiet";
  return "established";
}

export function plainSummary(candidate: RankedCandidate): string {
  const f = friendliness(candidate);
  const adjective =
    f === "friendly" ? "an active" : f === "established" ? "an established" : "a low-traffic";
  const language = candidate.signals.language ?? "open-source";
  const setup = candidate.signals.hasReadmeSetup
    ? "A README and install manifest are present; their setup instructions haven't been checked."
    : "A README with an install manifest wasn't found; check the project setup before starting.";
  const merged =
    !candidate.signals.outsiderMergeStatusKnown
      ? " Merge history couldn't be checked."
      : candidate.signals.mergedPRsFromOutsiders90d > 0
      ? ` It has recently merged ${candidate.signals.outsiderMergeSampled ? "at least " : ""}${candidate.signals.mergedPRsFromOutsiders90d} pull request${
          candidate.signals.mergedPRsFromOutsiders90d === 1 ? "" : "s"
        } from people outside the team.`
      : "";

  const competition = candidate.linkedOpenPRs === null
    ? " The competing pull request check is currently unknown."
    : candidate.linkedOpenPRs > 0
      ? ` ${candidate.linkedOpenPRs} linked open pull request(s) were found.`
      : " No linked open pull request was found in the checked sample.";

  return `A ${kindLabel(candidate)} in ${adjective} ${language} project — about ${effortLabel(
    candidate,
  )} of work. ${setup}${merged}${competition}`;
}

export type Verdict = { label: string; tone: "good" | "warn" | "bad" };

export function verdict(candidate: RankedCandidate): Verdict {
  const jev = candidate.score.jevDecision ?? candidate.jevDecision;
  if (jev && jev.decisionSource !== "fallback") {
    if (jev.verdict === "MISLABELED_TRAP") {
      return { label: `⚠️ Trap: ${jev.calibratedScope.replace(/_/g, " ")}`, tone: "bad" };
    }
    if (jev.verdict === "CONTESTED") {
      return { label: "Contested / Assigned", tone: "bad" };
    }
    if (jev.verdict === "VERIFIED_READY") {
      return { label: "Jev Verified Ready", tone: "good" };
    }
    if (jev.verdict === "NEEDS_TRIAGE") {
      return { label: "Needs Maintainer Triage", tone: "warn" };
    }
  }

  const s = candidate.score;
  if (s.total >= 68 && s.competition >= 0.6 && s.accessibility >= 0.6) {
    return { label: "Ready to start", tone: "good" };
  }
  if (s.total >= 48) {
    return { label: "Doable — some setup", tone: "warn" };
  }
  return { label: "Risky — needs care", tone: "bad" };
}

/** The three or four facts a beginner should see on the card. */
export function plainEvidence(candidate: RankedCandidate): string[] {
  const s = candidate.signals;
  const out: string[] = [];

  const jev = candidate.score.jevDecision ?? candidate.jevDecision;
  if (jev && jev.decisionSource !== "fallback") {
    if (jev.verdict === "MISLABELED_TRAP") {
      out.push(`⚠️ Gemma-Jev: ${jev.evidence}`);
    } else if (jev.verdict === "VERIFIED_READY") {
      out.push(`✅ Gemma-Jev: ${jev.evidence}`);
    }
    if (jev.quote && jev.quoteVerified) {
      out.push(`🔍 Grounded quote: "${jev.quote}"`);
    }
  }

  // Priority 1: Assignment and Competition (most critical to avoid duplicate work)
  if (!candidate.assigned) out.push("Nobody is assigned yet");
  else out.push("Already assigned to someone");

  if (candidate.linkedOpenPRs === 0) out.push("No linked open PR found");
  else if (candidate.linkedOpenPRs === null) out.push("Competing PR status could not be checked");
  else out.push(`${candidate.linkedOpenPRs} open PR(s) already exist`);

  // Priority 2: Setup & Documentation
  if (s.hasReadmeSetup) out.push("Setup is documented");
  if (s.hasContributing) out.push("Has a contribution guide");
  if (s.hasTests) out.push("Has tests");

  // Priority 3: Community activity
  if (s.mergedPRsFromOutsiders90d > 0) {
    out.push(`${s.outsiderMergeSampled ? "At least " : ""}${s.mergedPRsFromOutsiders90d} outside PR${s.mergedPRsFromOutsiders90d === 1 ? "" : "s"} merged recently`);
  } else if (!s.outsiderMergeStatusKnown) {
    out.push("Outside merge history could not be checked");
  }

  if (s.license) out.push(`${s.license} licensed`);

  const effort = effortFromLabels(candidate.labels);
  if (effort === "large") out.push("Labelled large effort — not a first PR");
  else if (effort === "medium") out.push("Labelled medium effort");

  return out.slice(0, 5);
}
