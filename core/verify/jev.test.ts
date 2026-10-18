import test from "node:test";
import assert from "node:assert/strict";
import { GemmaJevHarness } from "./jev";

test("GemmaJevHarness sequential cursor separates multiple questions", () => {
  const harness = new GemmaJevHarness();

  // Mock logprob token stream where question 1 answer is at token 2 and question 2 answer is at token 6
  const mockLogprobs = [
    { token: "{\n" },
    { token: '  "q1": ' },
    {
      token: "A",
      top_logprobs: [
        { token: "A", logprob: -0.1 },
        { token: "B", logprob: -2.3 },
      ],
    },
    { token: ',\n  "q2": ' },
    {
      token: "B",
      top_logprobs: [
        { token: "B", logprob: -0.2 },
        { token: "A", logprob: -1.8 },
      ],
    },
  ];

  // Test question 1 extraction
  const q1Result = (harness as any).extractCalibratedProbs(
    mockLogprobs,
    "A",
    ["A", "B"],
    0,
  );
  assert.equal(q1Result.nextCursor > 0, true);
  assert.ok(q1Result.probs["A"] > q1Result.probs["B"]);

  // Test question 2 extraction starting from nextCursor
  const q2Result = (harness as any).extractCalibratedProbs(
    mockLogprobs,
    "B",
    ["A", "B"],
    q1Result.nextCursor,
  );
  assert.ok(q2Result.probs["B"] > q2Result.probs["A"]);
});

test("GemmaJevHarness falls back to greedy argmax when logprobs are absent", () => {
  const harness = new GemmaJevHarness();

  const result = (harness as any).extractCalibratedProbs(
    undefined, // No logprobs
    "A",
    ["A", "B"],
    0,
  );

  assert.equal(result.nextCursor, 0);
  assert.equal(result.probs["A"], 0.85);
  assert.equal(result.probs["B"], 0.15);
});
