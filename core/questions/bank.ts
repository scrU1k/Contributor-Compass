import type { ScopeQuestion, Tier } from "@/core/types";

/**
 * A fixed bank of scope questions.
 *
 * We deliberately do NOT use an open-ended chat here. The LLM's job is to
 * *select* from this bank (and, if time allows, append one custom question) —
 * never to invent the form. That keeps the flow fast, testable and demoable.
 */
export const QUESTION_BANK: ScopeQuestion[] = [
  {
    id: "background",
    prompt: "Where are you starting from?",
    kind: "single",
    options: [
      "Never opened a pull request",
      "I have forked or cloned a repo",
      "I have opened a PR",
      "I contribute regularly",
    ],
  },
  {
    id: "stack",
    prompt: "Which technologies could you work in today?",
    kind: "multi",
    options: ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C/C++", "Ruby", "PHP", "Docs / Markdown"],
  },
  {
    id: "interest",
    prompt: "What do you actually find interesting?",
    kind: "multi",
    options: ["Web", "CLI tooling", "Data / ML", "Games", "DevOps", "Design / frontend", "Accessibility", "Education"],
    why: "Interest is the strongest predictor of whether you finish.",
  },
  {
    id: "goal",
    prompt: "What are you optimising for?",
    kind: "single",
    options: ["Learning something new", "Getting a PR merged fast", "Building a portfolio", "Becoming a maintainer"],
  },
  {
    id: "time",
    prompt: "How much time can you give this?",
    kind: "single",
    options: ["Under an hour", "A weekend", "Ongoing"],
  },
  {
    id: "size",
    prompt: "How big an issue are you comfortable with?",
    kind: "single",
    options: ["Tiny — a few lines", "Small — one file or function", "Anything if the direction is clear"],
  },
  {
    id: "setup-fear",
    prompt: "How do you feel about getting a project running locally?",
    kind: "single",
    options: ["I'd rather not install much", "I can follow a README", "I can debug a broken build"],
    why: "This decides how hard we push on accessibility and setup cost.",
  },
  {
    id: "contribution-type",
    prompt: "What kind of contribution appeals to you?",
    kind: "multi",
    options: ["Code", "Docs", "Tests", "Design", "Translation", "Triaging issues"],
  },
];

/** Deterministic default selection per tier (LLM selection is a later upgrade). */
export const TIER_DEFAULT_QUESTIONS: Record<Tier, string[]> = {
  newcomer: ["background", "stack", "interest", "goal", "time", "size", "setup-fear", "contribution-type"],
  experienced: ["stack", "interest", "goal", "size", "contribution-type"],
};

export function questionsFor(tier: Tier): ScopeQuestion[] {
  const ids = TIER_DEFAULT_QUESTIONS[tier];
  return ids
    .map((id) => QUESTION_BANK.find((q) => q.id === id))
    .filter((q): q is ScopeQuestion => Boolean(q));
}

export function findQuestion(id: string): ScopeQuestion | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}
