import { env } from "@/core/config/env";
import { llmConfigured } from "@/core/llm/adapter";
import type { IssueCandidate, JevDecision, RepoSignals } from "@/core/types";

/**
 * Gemma 4 Jev Client Harness (Google AI Studio Implementation).
 *
 * Emulates the TypeSafe Jev / djev System-1 decision model input/output contract
 * (choice, score, noul) over hosted autoregressive Gemma 4.
 *
 * Mechanisms:
 *   1. Thinking suppression & greedy decoding (temperature = 0.0)
 *   2. Single-token ASCII letter mapping ("A", "B", "C"...) to collapse option prefix-trees
 *   3. Token log-probability extraction & temperature-scaled softmax (T = 1.4)
 *   4. Deterministic post-processing for choice, score, and noul
 */

export type JevQuestionType = "noul" | "choice" | "score";

export interface JevQuestionSpec {
  type: JevQuestionType;
  instructions: string;
  criteria?: string[];
}

export interface JevNoulAnswer {
  type: "noul";
  probability: number;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevEvaluationResult {
  model: string;
  answers: Record<string, JevAnswer>;
}

const ASCII_UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class GemmaJevHarness {
  private calibrationTemp: number;

  constructor(calibrationTemp = 1.4) {
    this.calibrationTemp = calibrationTemp;
  }

  /**
   * Executes a Jev-style /v1/systemone decision pass using Gemma 4 via AI Studio.
   */
  async evaluate(
    state: Record<string, unknown>,
    questions: Record<string, JevQuestionSpec>,
  ): Promise<JevEvaluationResult> {
    const base = env.llmBaseUrl();
    const key = env.llmApiKey();
    const model = env.llmModel() || "gemma-4-26b-a4b-it";

    if (!base || !key) {
      throw new Error("Gemma LLM credentials not configured");
    }

    // 1. Build single-token alias maps for each question
    const aliasMaps: Record<string, Record<string, string>> = {};
    const promptQuestions: Record<string, { instructions: string; options: Record<string, string> }> = {};

    for (const [qId, qSpec] of Object.entries(questions)) {
      const criteria = qSpec.type === "noul" ? ["yes", "no"] : qSpec.criteria ?? [];
      const letters = Array.from(ASCII_UPPERCASE.slice(0, criteria.length));

      aliasMaps[qId] = {};
      letters.forEach((ltr, idx) => {
        aliasMaps[qId][ltr] = criteria[idx];
      });

      promptQuestions[qId] = {
        instructions: qSpec.instructions,
        options: aliasMaps[qId],
      };
    }

    // 2. Rigid System-1 Prompt
    const systemInstruction =
      "You are a deterministic System-1 decision classifier. " +
      "Evaluate the STATE against each question in QUESTIONS and output ONLY " +
      "a valid JSON object mapping each question key to its single-letter option code (e.g. {\"q1\": \"A\"}). " +
      "No explanations, no markdown fences, no thinking.";

    const userPrompt = `STATE:\n${JSON.stringify(state, null, 2)}\n\nQUESTIONS:\n${JSON.stringify(promptQuestions, null, 2)}`;

    // 3. Dispatch to OpenAI-compatible endpoint with temperature 0.0 & logprobs
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.0,
        max_tokens: 180,
        // Request token logprobs where supported
        logprobs: true,
        top_logprobs: 20,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemma-Jev API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const payload = await res.json();
    const content = payload.choices?.[0]?.message?.content ?? "{}";
    const logprobsContent = payload.choices?.[0]?.logprobs?.content;

    // Parse raw letter choices from JSON
    let rawChoices: Record<string, string> = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      rawChoices = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      // Fallback: search for single letters in raw text if JSON parser fails
      for (const qId of Object.keys(questions)) {
        const regex = new RegExp(`"${qId}"\\s*:\\s*"([A-Z])"`, "i");
        const match = content.match(regex);
        if (match) rawChoices[qId] = match[1].toUpperCase();
      }
    }

    // 4. Process calibrated probabilities & compute Jev primitives
    const answers: Record<string, JevAnswer> = {};

    for (const [qId, qSpec] of Object.entries(questions)) {
      const validLetters = Object.keys(aliasMaps[qId]);
      const chosenLetter = (rawChoices[qId] || validLetters[0] || "A").toUpperCase();

      // Extract temperature-scaled probabilities
      const letterProbs = this.extractCalibratedProbs(
        logprobsContent,
        chosenLetter,
        validLetters,
      );

      // Map single-letter probabilities back to original criteria labels
      const labelProbs: Record<string, number> = {};
      for (const [ltr, prob] of Object.entries(letterProbs)) {
        const label = aliasMaps[qId][ltr] ?? ltr;
        labelProbs[label] = Math.round(prob * 10000) / 10000;
      }

      if (qSpec.type === "noul") {
        answers[qId] = {
          type: "noul",
          probability: labelProbs["yes"] ?? (chosenLetter === "A" ? 1.0 : 0.0),
        };
      } else if (qSpec.type === "choice") {
        let bestLabel = Object.keys(labelProbs)[0];
        let maxP = -1;
        for (const [label, p] of Object.entries(labelProbs)) {
          if (p > maxP) {
            maxP = p;
            bestLabel = label;
          }
        }
        answers[qId] = {
          type: "choice",
          choice: bestLabel,
          probabilities: labelProbs,
          confidence: Math.round(maxP * 10000) / 10000,
        };
      } else if (qSpec.type === "score") {
        const criteria = qSpec.criteria ?? [];
        // Expected value: weighted average across indices (0 to K-1)
        const weightedScore = criteria.reduce((sum, label, idx) => {
          return sum + idx * (labelProbs[label] ?? 0);
        }, 0);

        // Confidence via normalized Mean Absolute Deviation around mode
        let modeIdx = 0;
        let maxModeP = -1;
        criteria.forEach((label, idx) => {
          const p = labelProbs[label] ?? 0;
          if (p > maxModeP) {
            maxModeP = p;
            modeIdx = idx;
          }
        });

        const maxDev = Math.max(modeIdx, criteria.length - 1 - modeIdx) || 1;
        const mad = criteria.reduce((sum, label, idx) => {
          return sum + Math.abs(idx - modeIdx) * (labelProbs[label] ?? 0);
        }, 0);
        const confidence = Math.max(0.0, 1.0 - mad / maxDev);

        answers[qId] = {
          type: "score",
          score: Math.round(weightedScore * 10000) / 10000,
          probabilities: labelProbs,
          confidence: Math.round(confidence * 10000) / 10000,
        };
      }
    }

    return { model, answers };
  }

  private extractCalibratedProbs(
    logprobsContent: Array<{ token: string; logprob: number; top_logprobs?: Array<{ token: string; logprob: number }> }> | undefined,
    chosenLetter: string,
    validLetters: string[],
  ): Record<string, number> {
    // If endpoint did not return logprobs, fallback to deterministic argmax
    if (!logprobsContent || !Array.isArray(logprobsContent) || logprobsContent.length === 0) {
      const fallback: Record<string, number> = {};
      for (const ltr of validLetters) {
        fallback[ltr] = ltr === chosenLetter ? 1.0 : 0.0;
      }
      return fallback;
    }

    // Locate token step where chosenLetter was emitted
    const step = logprobsContent.find((s) => s.token.trim().replace(/"/g, "") === chosenLetter);
    const topCandidates = step?.top_logprobs ?? [];

    const rawLogprobs: Record<string, number> = {};
    for (const ltr of validLetters) {
      rawLogprobs[ltr] = -15.0; // Floor for unseen tokens
    }

    for (const alt of topCandidates) {
      const cleaned = alt.token.trim().replace(/"/g, "");
      if (cleaned in rawLogprobs) {
        rawLogprobs[cleaned] = Math.max(rawLogprobs[cleaned], alt.logprob);
      }
    }

    // If step was not found or empty, ensure chosenLetter has baseline
    if (rawLogprobs[chosenLetter] === -15.0) {
      rawLogprobs[chosenLetter] = 0.0;
    }

    // Temperature-scaled softmax
    const maxLp = Math.max(...Object.values(rawLogprobs));
    const expScores: Record<string, number> = {};
    let totalExp = 0;

    for (const [ltr, lp] of Object.entries(rawLogprobs)) {
      const expVal = Math.exp((lp - maxLp) / this.calibrationTemp);
      expScores[ltr] = expVal;
      totalExp += expVal;
    }

    const result: Record<string, number> = {};
    for (const ltr of validLetters) {
      result[ltr] = (expScores[ltr] ?? 0) / (totalExp || 1);
    }
    return result;
  }
}

/**
 * Evaluates an issue using the Gemma-Jev System-1 decision harness.
 */
export async function evaluateIssueWithJev(
  candidate: IssueCandidate,
  signals: RepoSignals,
): Promise<JevDecision> {
  if (!llmConfigured()) {
    // Deterministic offline fallback
    const hasLabel = candidate.labels.some((l) => /good first issue|beginner|starter/i.test(l));
    return {
      verdict: candidate.assigned ? "CONTESTED" : hasLabel ? "VERIFIED_READY" : "NEEDS_TRIAGE",
      confidence: 0.85,
      labelAccuracyScore: hasLabel ? 0.9 : 0.5,
      calibratedScope: candidate.body.length > 1500 ? "multi_file" : "micro_fix",
      hiddenPrerequisites: [],
      evidence: "Deterministic structural assessment (no LLM configured).",
    };
  }

  try {
    const harness = new GemmaJevHarness(1.4);

    const state = {
      repository: candidate.repo,
      issue_title: candidate.title,
      labels: candidate.labels,
      body_snippet: candidate.body.slice(0, 2000),
      repo_stars: signals.stars,
      has_ci: signals.hasCI,
      has_tests: signals.hasTests,
      outsider_merges_90d: signals.mergedPRsFromOutsiders90d,
      is_assigned: candidate.assigned,
      linked_open_prs: candidate.linkedOpenPRs,
    };

    const result = await harness.evaluate(state, {
      beginner_friendly: {
        type: "noul",
        instructions: "Is this issue genuinely solvable by an open-source newcomer without deep internal architectural knowledge?",
      },
      label_honesty: {
        type: "score",
        instructions: "How honest and accurate is the beginner/good-first-issue label for this issue?",
        criteria: [
          "completely_misleading_trap",
          "understated_complexity",
          "fairly_accurate",
          "ideal_first_pr",
        ],
      },
      scope_trap: {
        type: "choice",
        instructions: "What is the primary hidden architectural hurdle in this issue?",
        criteria: [
          "none_clear_and_isolated",
          "requires_redis_or_external_infra",
          "vague_missing_reproduction",
          "needs_maintainer_design_decision",
          "deep_scheduler_or_concurrency_internals",
        ],
      },
    });

    const beginnerAnswer = result.answers["beginner_friendly"] as JevNoulAnswer;
    const honestyAnswer = result.answers["label_honesty"] as JevScoreAnswer;
    const trapAnswer = result.answers["scope_trap"] as JevChoiceAnswer;

    // Ordinal score is 0 to 3 -> normalize to 0..1
    const normalizedHonesty = Math.min(1.0, Math.max(0.0, (honestyAnswer.score ?? 2) / 3));
    const trapChoice = trapAnswer.choice;
    const hasTrap = trapChoice !== "none_clear_and_isolated" && trapAnswer.confidence > 0.35;

    let verdict: JevDecision["verdict"] = "VERIFIED_READY";
    const hiddenPrerequisites: string[] = [];
    let evidence = "Well-scoped, isolated contribution accessible to newcomers.";

    if (candidate.assigned || candidate.linkedOpenPRs > 0) {
      verdict = "CONTESTED";
      evidence = candidate.assigned
        ? "Issue is already assigned to another contributor."
        : `Already has ${candidate.linkedOpenPRs} competing open pull request(s).`;
    } else if (hasTrap || normalizedHonesty < 0.35) {
      verdict = "MISLABELED_TRAP";
      if (trapChoice === "requires_redis_or_external_infra") {
        hiddenPrerequisites.push("external_infra", "redis");
        evidence = "Requires external infrastructure/Redis not mentioned in the beginner label.";
      } else if (trapChoice === "vague_missing_reproduction") {
        hiddenPrerequisites.push("needs_repro");
        evidence = "Lacks reproduction steps; high risk of newcomer stall.";
      } else if (trapChoice === "deep_scheduler_or_concurrency_internals") {
        hiddenPrerequisites.push("concurrency_internals");
        evidence = "Involves concurrency/scheduler internals; misleading beginner label.";
      } else {
        evidence = "Requires maintainer architectural decision before code can be accepted.";
      }
    } else if (normalizedHonesty < 0.6 || beginnerAnswer.probability < 0.45) {
      verdict = "NEEDS_TRIAGE";
      evidence = "Partially specified; may require maintainer clarification.";
    }

    let calibratedScope: JevDecision["calibratedScope"] = "isolated_module";
    if (trapChoice === "deep_scheduler_or_concurrency_internals") {
      calibratedScope = "architectural_overhaul";
    } else if (normalizedHonesty > 0.8) {
      calibratedScope = "micro_fix";
    }

    return {
      verdict,
      confidence: Math.round(
        ((honestyAnswer.confidence + trapAnswer.confidence + beginnerAnswer.probability) / 3) * 100,
      ) / 100,
      labelAccuracyScore: Math.round(normalizedHonesty * 100) / 100,
      calibratedScope,
      hiddenPrerequisites,
      evidence,
    };
  } catch (err) {
    // Graceful fallback on network or API failure
    return {
      verdict: "NEEDS_TRIAGE",
      confidence: 0.5,
      labelAccuracyScore: 0.5,
      calibratedScope: "isolated_module",
      hiddenPrerequisites: [],
      evidence: `Evaluation fallback: ${err instanceof Error ? err.message : "API unavailable"}`,
    };
  }
}
