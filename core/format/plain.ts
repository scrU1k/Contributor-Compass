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
  if (s.hasContributing && s.mergedPRsFromOutsiders90d >= 3) return "friendly";
  if (s.mergedPRsFromOutsiders90d === 0 && !s.hasContributing) return "quiet";
  return "established";
}

export function plainSummary(candidate: RankedCandidate): string {
  const f = friendliness(candidate);
  const adjective =
    f === "friendly" ? "a friendly" : f === "established" ? "an established" : "a low-traffic";
  const language = candidate.signals.language ?? "open-source";
  const setup = candidate.signals.hasReadmeSetup
    ? "The project explains how to set it up."
    : "Setup isn't documented yet — the guide walks you through it.";
  const merged =
    candidate.signals.mergedPRsFromOutsiders90d > 0
      ? ` It has recently merged ${candidate.signals.mergedPRsFromOutsiders90d} pull request${
          candidate.signals.mergedPRsFromOutsiders90d === 1 ? "" : "s"
        } from people outside the team.`
      : "";

  return `A ${kindLabel(candidate)} in ${adjective} ${language} project — about ${effortLabel(
    candidate,
  )} of work. ${setup}${merged}`;
}

export type Verdict = { label: string; tone: "good" | "warn" | "bad" };

export function verdict(candidate: RankedCandidate): Verdict {
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

  if (s.hasReadmeSetup) out.push("Setup is documented");
  if (s.hasContributing) out.push("Has a contribution guide");
  if (s.hasTests) out.push("Has tests");
  if (s.mergedPRsFromOutsiders90d > 0) {
    out.push(`${s.mergedPRsFromOutsiders90d} outside PR${s.mergedPRsFromOutsiders90d === 1 ? "" : "s"} merged recently`);
  }
  if (!candidate.assigned) out.push("Nobody is assigned yet");
  if (candidate.linkedOpenPRs === 0) out.push("No one else is working on it");
  if (s.license) out.push(`${s.license} licensed`);

  const effort = effortFromLabels(candidate.labels);
  if (effort === "large") out.push("Labelled large effort — not a first PR");
  else if (effort === "medium") out.push("Labelled medium effort");

  return out.slice(0, 5);
}
