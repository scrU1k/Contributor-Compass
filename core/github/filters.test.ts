import test from "node:test";
import assert from "node:assert/strict";
import { isNotReadyLabel, isPromising, fitsHardConstraints } from "./filters";
import type { GhIssue } from "./search";
import type { IssueCandidate, Profile } from "../types";
import { minimalProfile } from "../profile/defaults";

test("isNotReadyLabel matches triage and blocker variants", () => {
  const blocking = [
    "needs triage",
    "needs: triage",
    "needs-triage",
    "status: needs triage",
    "Status: Awaiting Triage",
    "waiting-for-maintainer",
    "waiting for author",
    "blocked",
    "duplicate",
    "wontfix",
    "in progress",
    "claimed",
  ];

  for (const label of blocking) {
    assert.equal(isNotReadyLabel(label), true, `Expected "${label}" to be recognized as not ready`);
  }
});

test("isNotReadyLabel does NOT block question, stale, or beginner-friendly labels", () => {
  const allowed = [
    "question",
    "stale",
    "good first issue",
    "good-first-issue",
    "help wanted",
    "documentation",
    "bug",
    "enhancement",
    "beginner friendly",
  ];

  for (const label of allowed) {
    assert.equal(isNotReadyLabel(label), false, `Expected "${label}" NOT to be blocked`);
  }
});

test("isPromising rejects stale, crowded, or assigned issues", () => {
  const baseIssue: GhIssue = {
    number: 101,
    title: "Fix broken button style",
    body: "The button style is misaligned in dark mode.",
    html_url: "https://github.com/example/repo/issues/101",
    state: "open",
    created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    comments: 2,
    labels: [{ name: "good first issue" }],
    assignee: null,
    assignees: [],
    repository_url: "https://api.github.com/repos/example/repo",
  };

  assert.equal(isPromising(baseIssue), true);

  // Stale > 240 days
  const staleIssue = {
    ...baseIssue,
    updated_at: new Date(Date.now() - 250 * 86_400_000).toISOString(),
  };
  assert.equal(isPromising(staleIssue), false);

  // Crowded > 25 comments
  const crowdedIssue = {
    ...baseIssue,
    comments: 26,
  };
  assert.equal(isPromising(crowdedIssue), false);

  // Assigned
  const assignedIssue = {
    ...baseIssue,
    assignees: [{ login: "contributor1" }],
  };
  assert.equal(isPromising(assignedIssue), false);

  // Assigned via label
  const assignedByLabel = {
    ...baseIssue,
    labels: [{ name: "assigned" }],
  };
  assert.equal(isPromising(assignedByLabel), false);

  // Not ready label
  const triageIssue = {
    ...baseIssue,
    labels: [{ name: "needs: triage" }],
  };
  assert.equal(isPromising(triageIssue), false);
});

test("fitsHardConstraints enforces time budget, effort, and repo constraints", () => {
  const profile: Profile = {
    ...minimalProfile("newcomer"),
    timeBudget: "under-1h",
    constraints: {
      requireCI: true,
      license: ["mit"],
      maxRepoSize: "small",
    },
  };

  const baseSignals = {
    fullName: "example/repo",
    description: "example",
    language: "TypeScript",
    topics: [],
    stars: 100,
    createdAt: new Date().toISOString(),
    pushedAt: new Date().toISOString(),
    openIssues: 5,
    sizeKb: 500,
    license: "MIT",
    hasReadmeSetup: true,
    hasContributing: true,
    hasNewContributorGuide: true,
    hasCI: true,
    hasTests: true,
    hasDevcontainer: false,
    hasCodeOfConduct: true,
    dependencyWeight: 0.1,
    mergedPRsFromOutsiders90d: 5,
    outsiderMergeSampled: false,
    outsiderMergeStatusKnown: true,
    medianMaintainerResponseHours: 12,
    evidence: [],
  };

  const normalCandidate: IssueCandidate = {
    repo: "example/repo",
    number: 1,
    title: "Fix documentation typo",
    url: "https://github.com/example/repo/issues/1",
    body: "Small typo in readme.",
    state: "open",
    labels: ["docs"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assigned: false,
    comments: 0,
    linkedOpenPRs: 0,
    sizeHint: "tiny",
    signals: baseSignals,
  };

  assert.equal(fitsHardConstraints(normalCandidate, profile), true);

  // Time budget under-1h rejects large effort
  const largeCandidate: IssueCandidate = {
    ...normalCandidate,
    labels: ["effort: large"],
  };
  assert.equal(fitsHardConstraints(largeCandidate, profile), false);

  // CI constraint rejects repo without CI
  const noCiCandidate: IssueCandidate = {
    ...normalCandidate,
    signals: { ...baseSignals, hasCI: false },
  };
  assert.equal(fitsHardConstraints(noCiCandidate, profile), false);

  // Repo size constraint rejects oversized repo
  const hugeRepoCandidate: IssueCandidate = {
    ...normalCandidate,
    signals: { ...baseSignals, sizeKb: 250_000 },
  };
  assert.equal(fitsHardConstraints(hugeRepoCandidate, profile), false);
});
