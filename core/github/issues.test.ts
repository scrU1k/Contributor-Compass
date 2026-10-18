import test from "node:test";
import assert from "node:assert/strict";
import { countPRsReferencing, type GhPullRef } from "./issues";

test("countPRsReferencing identifies exact issue references and variants", () => {
  const pulls: GhPullRef[] = [
    { number: 201, title: "Fix bug (#123)", body: "Closes #123" },
    { number: 202, title: "Improve styling", body: "Resolves pallets/flask#123 completely" },
    { number: 203, title: "Refactor router", body: "Addresses GH-123" },
    { number: 204, title: "Unrelated PR", body: "Fixes #1234 but not the target issue" },
    { number: 205, title: "Another PR", body: "Check /issues/123 for context" },
    { number: 206, title: "No reference", body: "Just a clean PR" },
  ];

  // Should match 201 (#123), 202 (pallets/flask#123), 203 (GH-123), and 205 (/issues/123)
  // Should NOT match 204 (#1234) or 206
  const count = countPRsReferencing(pulls, 123);
  assert.equal(count, 4);

  // Searching for issue 1234 should only match 204
  const count1234 = countPRsReferencing(pulls, 1234);
  assert.equal(count1234, 1);

  // Searching for non-existent issue 999 should return 0
  const count999 = countPRsReferencing(pulls, 999);
  assert.equal(count999, 0);
});
