import { NextResponse } from "next/server";
import { chatText, llmConfigured } from "@/core/llm/adapter";
import { configFromRequest, withRequestConfig } from "@/core/config/requestConfig";
import type { RankedCandidate } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestConfig(configFromRequest(request), async () => {
    let body: {
      repo?: string;
      number?: number;
      candidate?: RankedCandidate;
      question?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "Question cannot be empty" }, { status: 400 });
    }

    const c = body.candidate;
    if (!c) {
      return NextResponse.json({ error: "Candidate issue context required" }, { status: 400 });
    }

    if (!llmConfigured()) {
      // Deterministic issue-grounded fallback response when offline / no key
      const qLower = question.toLowerCase();
      let answer = `Regarding issue #${c.number} ("${c.title}") in ${c.repo}:\n\n`;

      if (qLower.includes("reproduce") || qLower.includes("how to run")) {
        answer += `To reproduce: Check the issue description for steps. You should clone ${c.repo}, set up the local environment per README, and write a failing test case in the test directory before applying code changes.`;
      } else if (qLower.includes("file") || qLower.includes("where") || qLower.includes("look")) {
        answer += `Where to look: Start in the primary source directory for ${c.signals.language || "this codebase"}. Search for keywords from "${c.title}" to locate the relevant handler or component.`;
      } else if (qLower.includes("test")) {
        answer += `Testing: Look for existing tests under 'tests/' or 'spec/'. Run the test suite first to ensure you have a green baseline before creating a new test file or test method for issue #${c.number}.`;
      } else {
        answer += `Issue details: "${c.title}"\nLabels: ${c.labels.join(", ") || "none"}\nSummary of reported behavior: ${c.body ? c.body.slice(0, 300) : "No body provided"}\n\nTo get full AI reasoning on this question, please configure a Gemma API key in Settings.`;
      }

      return NextResponse.json({ answer, model: "fallback-grounded" });
    }

    try {
      const systemPrompt = [
        "You are Gemma, an expert AI open-source pair programmer answering a developer's question about a specific GitHub issue.",
        "Ground your answer strictly in the provided issue title, issue body, repository signals, and technical stack.",
        "Be direct, actionable, and technical. If relevant, suggest exact commands, file locations, or code patterns.",
        "Keep your response concise (2-4 paragraphs max).",
      ].join(" ");

      const userContent = [
        `Repository: ${c.repo}`,
        `Language: ${c.signals.language || "unknown"}`,
        `Issue #${c.number}: ${c.title}`,
        "",
        "Issue Body:",
        c.body ? c.body.slice(0, 3500) : "(no description)",
        "",
        "Developer Question:",
        question,
      ].join("\n");

      const answer = await chatText(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        { maxTokens: 800, temperature: 0.2 },
      );

      return NextResponse.json({ answer, model: "gemma-4" });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to answer question" },
        { status: 502 },
      );
    }
  });
}
