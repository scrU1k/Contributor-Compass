import { NextResponse } from "next/server";
import { questionsFor } from "@/core/questions/bank";
import type { Tier } from "@/core/types";

export const runtime = "nodejs";

/**
 * Returns the scope questions for a tier.
 *
 * Today the selection is deterministic per tier. The planned upgrade is for
 * Gemma to pick the most relevant questions from the bank (never invent them),
 * which is why this is an endpoint rather than a hardcoded client array.
 */
export async function POST(request: Request) {
  let body: { tier?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier: Tier = body.tier === "experienced" ? "experienced" : "newcomer";
  return NextResponse.json({ tier, questions: questionsFor(tier) });
}
