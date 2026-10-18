import type { IssueSize } from "@/core/types";

/**
 * Label literacy, kept client-safe.
 *
 * Repositories encode difficulty in labels ("effort: large", "good first issue",
 * "size/M"). Reading those is cheap and deterministic — and it is the first line
 * of defence against a label that says "beginner" on a multi-day task.
 *
 * This module imports only types, so both server scoring and client rendering can
 * use the same interpretation.
 */

export type EffortLevel = "tiny" | "small" | "medium" | "large" | "unknown";

export function effortFromLabels(labels: string[]): EffortLevel {
  for (const raw of labels) {
    const label = raw.toLowerCase();
    if (!label.includes("effort") && !label.includes("size")) continue;

    if (/tiny|trivial|\bxs\b|one[- ]line/.test(label)) return "tiny";
    if (/small|\bs\b|easy|low/.test(label)) return "small";
    if (/medium|\bm\b|moderate/.test(label)) return "medium";
    if (/large|big|\bl\b|xl|epic|hard|high/.test(label)) return "large";
  }

  return "unknown";
}

export function sizeHintFromLabels(labels: string[]): IssueSize {
  const effort = effortFromLabels(labels);
  if (effort === "tiny") return "tiny";
  if (effort === "small") return "small";
  if (effort === "medium" || effort === "large") return "any";

  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l.includes("good first issue") || l.includes("beginner"))) {
    return "small";
  }
  if (lower.some((l) => /tiny|trivial|doc(s|umentation)?/.test(l))) return "tiny";

  return "any";
}
