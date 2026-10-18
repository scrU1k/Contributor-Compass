import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, daysSince, tagOverlap } from "./readiness";
import type { IssueCandidate, RepoSignals, Profile, JevDecision } from "../types";
import { minimalProfile } from "../profile/defaults";

const mockSignals: RepoSignals = {
  fullName: "example/web-app",
  description: "A fast web framework for modern web applications",
  language: "TypeScript",
  topics: ["web", "frontend", "devtools"],
  stars: 1200,
  createdAt: new Date(Date.now() - 365 * 86_400_000).toISOString(),
  pushedAt: new Date().toISOString(),
  openIssues: 12,
  sizeKb: 5000,
  license: "MIT",
  hasReadmeSetup: true,
  hasContributing: true,
  hasNewContributorGuide: true,
  hasCI: true,
  hasTests: true,
  hasDevcontainer: false,
  hasCodeOfConduct: true,
  dependencyWeight: 0.2,
  mergedPRsFromOutsiders90d: 8,
  outsiderMergeSampled: false,
  outsiderMergeStatusKnown: true,
  medianMaintainerResponseHours: 12,
  evidence: [],
};

const mockCandidate: IssueCandidate = {
  repo: "example/web-app",
  number: 42,
  title: "Fix button padding on mobile viewport",
  url: "https://github.com/example/web-app/issues/42",
  body: "The button padding is overflowing on screens under 480px. Needs CSS adjustment.",
  state: "open",
  labels: ["good first issue", "css"],
  createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
  assigned: false,
  comments: 2,
  linkedOpenPRs: 0,
  sizeHint: "small",
  signals: mockSignals,
};

test("daysSince computes positive day difference", () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const d = daysSince(threeDaysAgo);
  assert.ok(d >= 2.9 && d <= 3.1);
});

test("tagOverlap handles language and topic matching", () => {
  const profile: Profile = {
    ...minimalProfile("newcomer"),
    stack: [{ tech: "TypeScript", fluency: 5 }],
    interests: ["web"],
  };

  const overlap = tagOverlap(profile, mockSignals);
  assert.ok(overlap > 0.5, `Expected substantial overlap, got ${overlap}`);
});

test("scoreCandidate produces balanced total score between 0 and 100", () => {
  const profile = minimalProfile("newcomer");
  const score = scoreCandidate(mockCandidate, profile);

  assert.ok(score.total >= 0 && score.total <= 100);
  assert.ok(score.accessibility >= 0 && score.accessibility <= 1);
  assert.ok(score.liveness >= 0 && score.liveness <= 1);
  assert.ok(score.issueQuality >= 0 && score.issueQuality <= 1);
  assert.ok(score.competition >= 0 && score.competition <= 1);
  assert.ok(score.setupCost >= 0 && score.setupCost <= 1);
  assert.ok(score.fit >= 0 && score.fit <= 1);
});

test("scoreCandidate applies maintainer triage penalty when Jev flags unready issue", () => {
  const profile = minimalProfile("newcomer");
  const readyJev: JevDecision = {
    verdict: "VERIFIED_READY",
    confidence: 0.9,
    labelAccuracyScore: 0.95,
    calibratedScope: "micro_fix",
    hiddenPrerequisites: [],
    evidence: "Clear reproduction steps",
    decisionSource: "gemma",
  };

  const unreadyJev: JevDecision = {
    verdict: "NEEDS_TRIAGE",
    confidence: 0.95,
    labelAccuracyScore: 0.2,
    calibratedScope: "architectural_overhaul",
    hiddenPrerequisites: ["docker"],
    evidence: "Architectural RFC requiring senior maintainer review",
    decisionSource: "gemma",
  };

  const readyScore = scoreCandidate(mockCandidate, profile, { jev: readyJev });
  const unreadyScore = scoreCandidate(mockCandidate, profile, { jev: unreadyJev });

  assert.ok(
    readyScore.total > unreadyScore.total,
    `Ready score (${readyScore.total}) should exceed unready score (${unreadyScore.total})`,
  );
  assert.ok(
    readyScore.issueQuality > unreadyScore.issueQuality,
    "Issue quality should be penalized when maintainer triage is required",
  );
});
