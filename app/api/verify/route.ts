import { NextResponse } from "next/server";
import { parseGitHubTarget } from "@/core/github/url";
import { discoverOrgCandidates, discoverRepoCandidates } from "@/core/github/org";
import { minimalProfile } from "@/core/profile/defaults";
import { verifySingleIssue } from "@/core/verify/single";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { Tier } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The side door: issue URL, repo URL, or entire organization/owner in, verified candidates out. */
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
    const profile = minimalProfile(tier);

    const target = parseGitHubTarget(url);
    if (!target) {
      return NextResponse.json(
        {
          error:
            "Invalid GitHub URL or identifier. Expected an issue (/owner/repo/issues/123), repository (/owner/repo), or organization (github.com/openstreetmap or openstreetmap).",
        },
        { status: 400 },
      );
    }

    try {
      // 1. Organization / User target (e.g. "https://github.com/openstreetmap" or "openstreetmap")
      if (target.kind === "owner") {
        const orgResult = await discoverOrgCandidates(target.owner, profile);
        return NextResponse.json({
          mode: "org",
          target,
          org: orgResult,
          candidates: orgResult.candidates,
          candidate: orgResult.candidates[0] || null,
        });
      }

      // 2. Repository target (e.g. "https://github.com/pallets/flask" or "pallets/flask")
      if (target.kind === "repo") {
        const repoResult = await discoverRepoCandidates(target.fullName, profile);
        return NextResponse.json({
          mode: "repo",
          target,
          org: repoResult,
          candidates: repoResult.candidates,
          candidate: repoResult.candidates[0] || null,
        });
      }

      // 3. Single Issue target (e.g. "https://github.com/owner/repo/issues/123")
      const scored = await verifySingleIssue(target.repo, target.number, profile);

      return NextResponse.json({
        mode: "issue",
        target,
        candidate: scored,
        candidates: [scored],
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not verify that GitHub target" },
        { status: 502 },
      );
    }
  });
}
