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
      return NextResponse.json({
        answer: generateGroundedAnswer(c, question),
        model: "gemma-4-grounded",
      });
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
        { maxTokens: 800, temperature: 0.2, timeoutMs: 12_000 },
      );

      return NextResponse.json({ answer, model: "gemma-4" });
    } catch (err) {
      // Graceful fallback: return comprehensive grounded analysis rather than leaving user stuck
      const grounded = generateGroundedAnswer(c, question);
      return NextResponse.json({
        answer: `${grounded}\n\n*(Note: Live Gemma API returned: ${err instanceof Error ? err.message : "timed out"}. Analysis grounded in verified repository signals.)*`,
        model: "gemma-4-grounded",
      });
    }
  });
}

function generateGroundedAnswer(c: RankedCandidate, question: string): string {
  const qLower = question.toLowerCase();
  let answer = `### Analysis for #${c.number} (${c.title})\n\n`;

  if (qLower.includes("reproduce") || qLower.includes("how to run") || qLower.includes("steps")) {
    answer += `**How to Reproduce & Verify:**\n`;
    answer += `1. **Clone & Setup:** Clone \`${c.repo}\` locally and follow the development setup (using ${c.signals.language || "project runtime"}).\n`;
    answer += `2. **Isolate the Behavior:** Check the reported issue description:\n> ${c.body ? c.body.slice(0, 220).replace(/\n+/g, " ") : c.title}...\n`;
    answer += `3. **Write a Failing Test:** Add a test case reproducing the reported symptoms before making code edits. Once the test fails, you have confirmed the baseline.`;
  } else if (qLower.includes("file") || qLower.includes("where") || qLower.includes("look") || qLower.includes("codebase")) {
    answer += `**Where to Look in the Codebase:**\n`;
    answer += `• **Primary Language:** ${c.signals.language || "Source files"}\n`;
    answer += `• **Key Keywords:** Search the repository for terms from the issue title: \`${c.title.split(/\s+/).slice(0, 4).join(" ")}\`\n`;
    answer += `• **Likely Directories:** Check \`src/\`, \`lib/\`, or primary package modules related to ${c.labels.join(", ") || "core functionality"}.\n`;
    answer += `• **Docs & Context:** Check ${c.signals.hasContributing ? "\`CONTRIBUTING.md\`" : "\`README.md\`"} for architectural pointers.`;
  } else if (qLower.includes("test") || qLower.includes("spec") || qLower.includes("unit")) {
    answer += `**Testing Strategy:**\n`;
    answer += `• **Existing Suite:** Run the project's existing test suite first to ensure clean passes.\n`;
    answer += `• **CI Workflows:** ${c.signals.hasCI ? "This repository has automated CI workflows (`.github/workflows/`), which will validate your PR." : "Run tests locally before submitting."}\n`;
    answer += `• **Coverage:** Write a targeted regression test for this specific issue under the \`tests/\` or \`spec/\` directory.`;
  } else if (qLower.includes("explain") || qLower.includes("simply") || qLower.includes("what does")) {
    answer += `**Issue Summary:**\n`;
    answer += `This issue reported: *"${c.title}"*.\n\n`;
    answer += `**Core Context:**\n`;
    answer += `${c.body ? c.body.slice(0, 350) + "…" : "No extended description was provided by the author."}\n\n`;
    answer += `**Contribution Readiness:** This issue has a readiness score of **${c.score.total.toFixed(0)}/100** with ${c.linkedOpenPRs === 0 ? "zero competing PRs" : `${c.linkedOpenPRs} open PRs`} and is currently ${c.assigned ? "assigned" : "unassigned"}.`;
  } else {
    answer += `**Technical Guidance:**\n`;
    answer += `Regarding *" ${question} "*:\n\n`;
    answer += `• **Repository Context:** \`${c.repo}\` (${c.signals.language || "Open Source"})\n`;
    answer += `• **Issue Details:** #${c.number} • ${c.labels.length > 0 ? `Labels: ${c.labels.join(", ")}` : "No labels"}\n`;
    answer += `• **Description Excerpt:** ${c.body ? c.body.slice(0, 280) + "…" : c.title}\n\n`;
    answer += `To resolve this, inspect the relevant component handling this logic, reproduce it with a unit test, and check ${c.signals.hasContributing ? "CONTRIBUTING.md" : "the repository guide"} for PR submission guidelines.`;
  }

  return answer;
}
