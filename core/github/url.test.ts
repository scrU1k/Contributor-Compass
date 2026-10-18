import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubTarget } from "./url";

test("parseGitHubTarget parses issue URLs", () => {
  const t1 = parseGitHubTarget("https://github.com/facebook/react/issues/1234");
  assert.equal(t1?.kind, "issue");
  if (t1?.kind === "issue") {
    assert.equal(t1.repo, "facebook/react");
    assert.equal(t1.number, 1234);
  }

  const t2 = parseGitHubTarget("https://github.com/pallets/flask/issues/55/");
  assert.equal(t2?.kind, "issue");
  if (t2?.kind === "issue") {
    assert.equal(t2.repo, "pallets/flask");
    assert.equal(t2.number, 55);
  }
});

test("parseGitHubTarget parses repository URLs and short identifiers", () => {
  const t1 = parseGitHubTarget("https://github.com/pallets/flask");
  assert.equal(t1?.kind, "repo");
  if (t1?.kind === "repo") {
    assert.equal(t1.fullName, "pallets/flask");
  }

  const t2 = parseGitHubTarget("pallets/flask");
  assert.equal(t2?.kind, "repo");
  if (t2?.kind === "repo") {
    assert.equal(t2.fullName, "pallets/flask");
  }
});

test("parseGitHubTarget parses organization and owner targets", () => {
  const t1 = parseGitHubTarget("https://github.com/openstreetmap");
  assert.equal(t1?.kind, "owner");
  if (t1?.kind === "owner") {
    assert.equal(t1.owner, "openstreetmap");
  }

  const t2 = parseGitHubTarget("openstreetmap");
  assert.equal(t2?.kind, "owner");
  if (t2?.kind === "owner") {
    assert.equal(t2.owner, "openstreetmap");
  }
});

test("parseGitHubTarget returns null for invalid input", () => {
  assert.equal(parseGitHubTarget(""), null);
  assert.equal(parseGitHubTarget("   "), null);
  assert.equal(parseGitHubTarget("https://gitlab.com/owner/repo"), null);
  assert.equal(parseGitHubTarget("random text with spaces"), null);
});
