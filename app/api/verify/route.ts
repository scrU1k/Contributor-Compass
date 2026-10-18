import { NextResponse } from "next/server";
import { parseGitHubTarget } from "@/core/github/url";
import { discoverOrgCandidates, discoverRepoCandidates, type OrgDiscoveryResult } from "@/core/github/org";
import { minimalProfile } from "@/core/profile/defaults";
import { verifySingleIssue } from "@/core/verify/single";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { IssueCandidate, Profile, RankedCandidate, Tier } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { chatJSON, llmConfigured } from "@/core/llm/adapter";

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

const semanticTagSchema = z.record(z.string(), z.array(z.string()));

/**
 * Perform semantic matching of custom tags using Gemma, falling back to literal keyword matching.
 * Conceptually relates domain tags (e.g. astronomy -> astrophysics, FITS; game dev -> shaders, engines).
 */
async function matchCustomTagsSemantically(
  candidates: IssueCandidate[],
  tags: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (candidates.length === 0 || tags.length === 0) return result;

  // 1. Literal keyword matching baseline
  for (const cand of candidates) {
    const key = `${cand.repo}#${cand.number}`;
    result.set(key, findMatchedTags(cand, tags));
  }

  if (!llmConfigured()) {
    return result;
  }

  try {
    const issueSummaries = candidates.slice(0, 15).map((cand) => ({
      id: `${cand.repo}#${cand.number}`,
      title: cand.title,
      labels: cand.labels.slice(0, 6),
      language: cand.signals.language ?? "unknown",
      topics: (cand.signals.topics ?? []).slice(0, 6),
      snippet: cand.body.slice(0, 250).replace(/\s+/g, " "),
    }));

    const tagsLowerMap = new Map(tags.map((t) => [t.toLowerCase().trim(), t]));

    const response = await chatJSON(
      [
        {
          role: "system",
          content:
            "You are an AI that evaluates open-source GitHub issues against user interest tags. Perform semantic matching: assign a tag if the issue is conceptually or technically related to that tag, even if the exact keyword is not present (for example, 'astronomy' matches astrophysics, FITS files, celestial coordinates; 'game dev' matches shaders, physics engine, sprites; 'security' matches cryptography, authentication, TLS, sanitization; 'docs' matches guides, tutorials, docstrings). Return a JSON object mapping each issue id to an array of matched tags from the user's tag list only. If none match, return an empty array.",
        },
        {
          role: "user",
          content: [
            `User Custom Tags: ${JSON.stringify(tags)}`,
            "",
            "Issues to classify:",
            JSON.stringify(issueSummaries, null, 2),
            "",
            'Return format: { "<repo>#<number>": ["tag1", "tag2"] }',
          ].join("\n"),
        },
      ],
      semanticTagSchema,
      { maxTokens: 800, temperature: 0.1, timeoutMs: 15_000 },
    );

    for (const [id, matched] of Object.entries(response)) {
      if (!Array.isArray(matched)) continue;
      const existing = new Set(result.get(id) ?? []);
      for (const m of matched) {
        const canonical = tagsLowerMap.get(m.toLowerCase().trim());
        if (canonical) {
          existing.add(canonical);
        }
      }
      result.set(id, Array.from(existing));
    }
  } catch {
    // Graceful fallback to keyword matches already populated in `result`
  }

  return result;
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
      const semanticTagMap = await matchCustomTagsSemantically(allCandidates, cleanTags);
      allCandidates.forEach((cand) => {
        const key = `${cand.repo}#${cand.number}`;
        cand.matchedTags = semanticTagMap.get(key) ?? [];
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
