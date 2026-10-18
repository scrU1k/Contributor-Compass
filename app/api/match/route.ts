import { NextResponse } from "next/server";
import { profileSchema } from "@/core/profile/schema";
import { runMatch } from "@/core/pipeline";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The match path is intentionally LLM-free after the scout step.
 *
 * Ranking is deterministic and explainable, so this endpoint returns in seconds
 * and cannot be taken down by a model timeout. Gemma is used where it adds
 * something a formula cannot: choosing where to look, and writing the guide.
 *
 * Credentials arrive per-request (bring-your-own-key) and are scoped to this
 * handler by AsyncLocalStorage.
 */
export async function POST(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid profile", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    try {
      const { candidates, scout } = await runMatch(parsed.data, 10);
      return NextResponse.json({
        tier: parsed.data.tier,
        count: candidates.length,
        results: candidates,
        scout,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Match failed" },
        { status: 502 },
      );
    }
  });
}
