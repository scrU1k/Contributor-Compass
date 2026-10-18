import { NextResponse } from "next/server";
import { profileSchema } from "@/core/profile/schema";
import { getIssue } from "@/core/github/search";
import { getRepoSignals } from "@/core/github/signals";
import { countPRsReferencing, getRepoOpenPRs } from "@/core/github/issues";
import { toCandidate } from "@/core/candidate";
import { scoreCandidate } from "@/core/score/readiness";
import { buildGuidance } from "@/core/guide/guide";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { RankedCandidate } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The server owns truth here: we take a repo + issue number and re-fetch the
 * issue ourselves rather than trusting a large client payload.
 */
export async function POST(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    let body: { repo?: unknown; number?: unknown; profile?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    const repo = typeof body.repo === "string" ? body.repo : "";
    const number = Number(body.number);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(number) || number <= 0) {
      return NextResponse.json({ error: "Expected { repo, number, profile }" }, { status: 400 });
    }

    const parsedProfile = profileSchema.safeParse(body.profile);
    if (!parsedProfile.success) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    const profile = parsedProfile.data;

    try {
      const [issue, signals, pulls] = await Promise.all([
        getIssue(repo, number),
        getRepoSignals(repo),
        getRepoOpenPRs(repo).catch(() => []),
      ]);

      const candidate = toCandidate(issue, repo, signals, countPRsReferencing(pulls, number));

      const ranked: RankedCandidate = {
        ...candidate,
        score: scoreCandidate(candidate, profile),
        why: "",
      };

      const guidance = await buildGuidance(ranked, profile);
      return NextResponse.json({ candidate: ranked, guidance });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not build guidance" },
        { status: 502 },
      );
    }
  });
}
