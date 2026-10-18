import { NextResponse } from "next/server";
import { profileSchema } from "@/core/profile/schema";
import { getIssue } from "@/core/github/search";
import { getRepoSignals } from "@/core/github/signals";
import { getRepoOpenPRs, linkedPRCount } from "@/core/github/issues";
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
    let body: { repo?: unknown; number?: unknown; profile?: unknown; candidate?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    const repo = typeof body.repo === "string" ? body.repo : "";
    const number = Number(body.number);
    if (!/^[A-Za-z0-9_-][\w.-]*\/[A-Za-z0-9_-][\w.-]*$/.test(repo) || !Number.isInteger(number) || number <= 0) {
      return NextResponse.json({ error: "Expected { repo, number, profile }" }, { status: 400 });
    }

    const parsedProfile = profileSchema.safeParse(body.profile);
    if (!parsedProfile.success) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    const profile = parsedProfile.data;

    try {
      let ranked: RankedCandidate;

      // If client provided the pre-evaluated candidate from the initial search, reuse it immediately
      const cand = body.candidate as RankedCandidate | undefined;
      if (
        cand &&
        typeof cand === "object" &&
        cand.repo?.toLowerCase() === repo.toLowerCase() &&
        cand.number === number &&
        cand.signals
      ) {
        ranked = cand;
      } else {
        const [issue, signals, pullsResult] = await Promise.all([
          getIssue(repo, number),
          getRepoSignals(repo),
          getRepoOpenPRs(repo).catch(() => null),
        ]);
        if (issue.state !== "open") {
          return NextResponse.json({ error: "That issue is closed, so a new contribution cannot start there." }, { status: 409 });
        }

        const candidate = toCandidate(issue, repo, signals, pullsResult ? linkedPRCount(pullsResult, number) : null);
        ranked = {
          ...candidate,
          score: scoreCandidate(candidate, profile),
          why: "",
        };
      }

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
