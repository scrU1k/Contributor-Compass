import type { IssueCandidate, Profile, RankedCandidate } from "@/core/types";
import { scoreCandidate } from "@/core/score/readiness";
import { cosine, embedTexts, toUnitCosine } from "@/core/embed/embed";

/**
 * Tier-weighted ranking.
 *
 * This is the whole point of "one pipeline, two front doors": the candidate pool
 * does not change when you flip the tier, only the weights applied to it.
 */

export function profileText(profile: Profile): string {
  const stack = profile.stack.map((s) => `${s.tech} (fluency ${s.fluency}/5)`).join(", ");
  return [
    `Interests: ${profile.interests.join(", ") || "none stated"}`,
    `Tech stack: ${stack || "none stated"}`,
    `Goal: ${profile.goal}`,
    `Open to contributing: ${profile.contributionTypes.join(", ") || "anything"}`,
    `Time budget: ${profile.timeBudget}`,
  ].join("\n");
}

export function repoText(candidate: IssueCandidate): string {
  const s = candidate.signals;
  return [
    s.description ?? "",
    `Language: ${s.language ?? "unknown"}`,
    s.topics.length ? `Topics: ${s.topics.join(", ")}` : "",
    `Issue: ${candidate.title}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function semanticFitByRepo(candidates: IssueCandidate[], profile: Profile): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const repos = [...new Set(candidates.map((c) => c.repo))];
  if (repos.length === 0) return result;

  const byRepo = new Map<string, IssueCandidate>();
  for (const c of candidates) if (!byRepo.has(c.repo)) byRepo.set(c.repo, c);

  const vectors = await embedTexts([
    profileText(profile),
    ...repos.map((r) => repoText(byRepo.get(r)!)),
  ]);
  if (!vectors) return result;

  const [profileVector, ...repoVectors] = vectors;
  repos.forEach((repo, i) => {
    result.set(repo, toUnitCosine(cosine(profileVector, repoVectors[i])));
  });
  return result;
}

/** Deterministic "why this fits you" — used when the LLM is unavailable. */
export function explainDeterministic(candidate: RankedCandidate, profile: Profile): string {
  const s = candidate.signals;
  const bits: string[] = [];

  if (s.language && profile.stack.some((x) => x.tech.toLowerCase() === s.language!.toLowerCase())) {
    bits.push(`it's ${s.language}, which you already work in`);
  } else if (candidate.score.fit >= 0.5) {
    bits.push("it matches the topics you picked");
  }

  if (s.mergedPRsFromOutsiders90d > 0) {
    bits.push(`${s.mergedPRsFromOutsiders90d} PR(s) from outside contributors merged in the last 90 days`);
  }
  if (!candidate.assigned && candidate.linkedOpenPRs === 0) {
    bits.push("it's unassigned with no open PR competing for it");
  }
  if (s.hasReadmeSetup && s.hasContributing) {
    bits.push("setup and contribution docs are both present");
  }
  if (bits.length === 0) bits.push("nothing disqualifying showed up in verification");

  return `${bits.join("; ")}.`.replace(/^./, (c) => c.toUpperCase());
}

export async function rankCandidates(
  candidates: IssueCandidate[],
  profile: Profile,
  limit = 10,
): Promise<RankedCandidate[]> {
  const semantic = await semanticFitByRepo(candidates, profile);

  const scored: RankedCandidate[] = candidates.map((candidate) => {
    const score = scoreCandidate(candidate, profile, semantic.get(candidate.repo));
    const ranked: RankedCandidate = {
      ...candidate,
      score,
      why: "",
    };
    ranked.why = explainDeterministic(ranked, profile);
    return ranked;
  });

  scored.sort((a, b) => b.score.total - a.score.total || a.number - b.number);
  return scored.slice(0, limit);
}
