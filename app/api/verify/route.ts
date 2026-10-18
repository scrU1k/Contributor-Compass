import { NextResponse } from "next/server";
import { parseGitHubTarget } from "@/core/github/url";
import { discoverOrgCandidates, discoverRepoCandidates, type OrgDiscoveryResult } from "@/core/github/org";
import { minimalProfile } from "@/core/profile/defaults";
import { verifySingleIssue } from "@/core/verify/single";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { IssueCandidate, Profile, RankedCandidate, Tier } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function findMatchedTags(cand: IssueCandidate, tags: string[]): string[] {
  const matches: string[] = [];
  const text = `${cand.title} ${cand.body} ${cand.signals.language ?? ""} ${(cand.signals.topics ?? []).join(" ")} ${(cand.labels ?? []).join(" ")}`.toLowerCase();
  for (const tag of tags) {
    const t = tag.toLowerCase().trim();
    if (!t) continue;
    if (text.includes(t)) {
      matches.push(tag);
    }
  }
  return matches;
}

/**
 * Find by Link: verify single or multiple issue URLs, repo URLs, or organizations,
 * with optional custom tags to prioritize focus areas.
 */
export async function POST(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    let body: { url?: unknown; urls?: unknown; tier?: unknown; tags?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    const tier: Tier = body.tier === "experienced" ? "experienced" : "newcomer";

    // Gather candidate URLs
    const rawList: string[] = [];
    if (Array.isArray(body.urls)) {
      body.urls.forEach((u) => {
        if (typeof u === "string" && u.trim()) rawList.push(u.trim());
      });
    }
    if (typeof body.url === "string" && body.url.trim()) {
      rawList.push(body.url.trim());
    }

    const uniqueUrls = Array.from(new Set(rawList));
    if (uniqueUrls.length === 0) {
      return NextResponse.json(
        { error: "No GitHub URLs provided. Please enter at least one issue, repo, or organization link." },
        { status: 400 },
      );
    }

    // Parse custom tags if supplied
    const cleanTags: string[] = [];
    if (Array.isArray(body.tags)) {
      body.tags.forEach((t) => {
        if (typeof t === "string" && t.trim()) cleanTags.push(t.trim());
      });
    } else if (typeof body.tags === "string" && body.tags.trim()) {
      body.tags.split(",").forEach((t) => {
        if (t.trim()) cleanTags.push(t.trim());
      });
    }

    // Build profile attuned to custom tags (if any)
    const profile: Profile =
      cleanTags.length > 0
        ? {
            tier,
            experienceLevel: tier === "newcomer" ? "newcomer" : "experienced",
            goal: tier === "newcomer" ? "learn" : "merge-fast",
            stack: cleanTags.map((t) => ({ tech: t, fluency: 3 as const })),
            interests: cleanTags,
            fears: [],
            contributionTypes: cleanTags.some((t) => /doc|readme|guide/i.test(t))
              ? (["docs", "code"] as const)
              : (["code"] as const),
            timeBudget: "weekend",
            constraints: {},
            issueSize: "any",
          }
        : minimalProfile(tier);

    const candidatesMap = new Map<string, RankedCandidate>();
    const orgResults: OrgDiscoveryResult[] = [];
    const errors: string[] = [];

    // Process all URLs concurrently
    const results = await Promise.allSettled(
      uniqueUrls.map(async (rawUrl) => {
        const target = parseGitHubTarget(rawUrl);
        if (!target) {
          throw new Error(`Invalid GitHub URL: "${rawUrl}". Expected an issue, repository, or organization link.`);
        }

        if (target.kind === "owner") {
          const orgRes = await discoverOrgCandidates(target.owner, profile);
          return { kind: "org" as const, org: orgRes, candidates: orgRes.candidates };
        }

        if (target.kind === "repo") {
          const repoRes = await discoverRepoCandidates(target.fullName, profile);
          return { kind: "repo" as const, org: repoRes, candidates: repoRes.candidates };
        }

        const scored = await verifySingleIssue(target.repo, target.number, profile);
        return { kind: "issue" as const, candidates: [scored] };
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === "fulfilled") {
        const value = res.value;
        if ("org" in value && value.org) {
          orgResults.push(value.org);
        }
        for (const cand of value.candidates) {
          const key = `${cand.repo}#${cand.number}`;
          if (!candidatesMap.has(key)) {
            candidatesMap.set(key, cand);
          }
        }
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : "Target could not be verified";
        errors.push(`${uniqueUrls[i]}: ${msg}`);
      }
    }

    if (candidatesMap.size === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: errors.join(" | ") },
        { status: 502 },
      );
    }

    let allCandidates = Array.from(candidatesMap.values());

    // Tag matching & sorting
    if (cleanTags.length > 0) {
      allCandidates.forEach((cand) => {
        cand.matchedTags = findMatchedTags(cand, cleanTags);
      });

      allCandidates.sort((a, b) => {
        const matchA = a.matchedTags?.length ?? 0;
        const matchB = b.matchedTags?.length ?? 0;
        if (matchA !== matchB) return matchB - matchA;
        return (b.score?.total ?? 0) - (a.score?.total ?? 0);
      });
    } else {
      allCandidates.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
    }

    const mode = uniqueUrls.length > 1 ? "multi" : (parseGitHubTarget(uniqueUrls[0])?.kind ?? "issue");

    return NextResponse.json({
      mode,
      candidates: allCandidates,
      candidate: allCandidates[0] || null,
      org: orgResults[0] || null,
      orgs: orgResults,
      tags: cleanTags,
      errors: errors.length > 0 ? errors : undefined,
    });
  });
}
