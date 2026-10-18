import { NextResponse } from "next/server";
import { getIssue, parseIssueUrl } from "@/core/github/search";
import { getRepoSignals } from "@/core/github/signals";
import { countPRsReferencing, getRepoOpenPRs } from "@/core/github/issues";
import { toCandidate } from "@/core/candidate";
import { minimalProfile } from "@/core/profile/defaults";
import { scoreCandidate } from "@/core/score/readiness";
import { explainDeterministic } from "@/core/rank/rank";
import { evaluateIssueWithJev } from "@/core/verify/jev";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { RankedCandidate, Tier } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The side door: any GitHub issue URL in, a verified verdict out. */
export async function POST(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    let body: { url?: unknown; tier?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    const url = typeof body.url === "string" ? body.url : "";
    const tier: Tier = body.tier === "experienced" ? "experienced" : "newcomer";

    const parsed = parseIssueUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "That doesn't look like a GitHub issue URL. Expected /owner/repo/issues/123." },
        { status: 400 },
      );
    }

    try {
      const [issue, signals, pulls] = await Promise.all([
        getIssue(parsed.repo, parsed.number),
        getRepoSignals(parsed.repo),
        getRepoOpenPRs(parsed.repo).catch(() => []),
      ]);

      const candidate = toCandidate(
        issue,
        parsed.repo,
        signals,
        countPRsReferencing(pulls, parsed.number),
      );

      const profile = minimalProfile(tier);
      // Run Gemma 4 Jev decision harness
      const jev = await evaluateIssueWithJev(candidate, signals).catch(() => undefined);

      const scored: RankedCandidate = {
        ...candidate,
        score: scoreCandidate(candidate, profile, { ignoreFit: true, jev }),
        why: "",
        jevDecision: jev,
      };
      scored.why = jev?.evidence || explainDeterministic(scored, profile);

      return NextResponse.json({ candidate: scored });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not verify that issue" },
        { status: 502 },
      );
    }
  });
}
