# Contributor Compass — Build Plan (v3.2)

**Event:** Hacktoberfest Hack Day (BMSCE IEEE Computer Society)
**Themes:** Use AI to Build Developer Tools · AI for Open Innovation
**Rubric:** Usability · Creativity · Scalability · Adaptability
**Special Track:** Best Use of Gemma API (Mandatory: **Exclusively Gemma 4**, no foreign models)
**Constraints:** Solo · 6–7 hours · Zero Fine-Tuning (Pure Harness Scaffolding) · Deterministic Demo

## Implementation status and scope

This document records the original target architecture; several sections below describe
planned work rather than shipped behavior. The current application selects at most five
repositories from a curated registry and supplements them with up to two cached profile
queries against GitHub Search (up to three new repositories and 30 issues per query). It
applies deterministic ranking and runs Gemma Jev on the top three candidates when
configured. It does not maintain a continuously refreshed global candidate index, read
file contents for the guide, or provide line citations.

The current JSON file cache is single-instance/demo infrastructure. A production discovery
service needs background ingestion, a shared database, a queue, source provenance, freshness
timestamps, and live revalidation of top results. The implementation must treat failed
checks as unknown rather than as evidence that an issue is uncontested. This status note
takes precedence over aspirational sections until those features are implemented.

---

## 1. Concept

One-liner: **Contributor Compass turns a developer's skills and goals into a verified, ready-to-work path into open source.**

A user describes who they are (or just says "I'm a beginner" / "I want merges").
The system returns a **ranked list of real, verified GitHub issues**, each with a
**Contribution Readiness Score** explaining *why* it fits and whether it's actually
doable — then generates a grounded **getting-started guide** for the one they pick.

It bridges both themes: a developer tool (codebase/issue understanding) that serves
open innovation (opening contribution up to newcomers).

### Positioning & Wedge Analysis

We evaluated three strategic product wedges:

1. **Wedge A — "Verified, not listed." (Locked Core Headline · Highest Value-per-Hour):**
   * *The Thesis:* Discovery tools hand developers a static, stale list. Nobody verifies feasibility right now: still unassigned? contested by an open PR? setup docs and CI present? outside contributor merges? semantic trap in the issue body?
   * *The Pitch:* **"Good-first-issue lists go stale. We verify every issue is actually doable before you start."**
   * *Status:* Shipped and demonstrated honestly through our dual-engine readiness scoring + empirical benchmark.

2. **Wedge B — "The contribution quality layer." (Narrative Context):**
   * *The Thesis:* AI made low-effort pull requests easy to generate, increasing burden on open-source maintainers. Contributor Compass makes genuine, well-scoped contributions easier for newcomers.
   * *Discipline:* Used as contemporary context for Hacktoberfest/open innovation, while avoiding claims that the tool currently functions as an automated maintainer spam classifier.

3. **Wedge C — "Merge Radar" (Deferred Future Research):**
   * *The Thesis:* Predicting numeric merge odds (e.g. "78% merge odds") based on historical pull request mining.
   * *Discipline:* Deferred to future research because presenting uncalibrated percentages without longitudinal datasets risks looking precise without being reliable.

Deliberately avoided pitch: "get to a green test run" (Docker/build times destroy demos).

### Why Gemma is load-bearing (prize track)

There is a **Best Use of Gemma API** prize. A model that only writes a closing
sentence is a wrapper, and judges will say so. Verification has two halves:

- **Structural verification** (deterministic): assigned? CI exists? do outsiders
  get merged? is a PR already open?
- **Semantic verification** (Gemma): is the issue *actually* well-scoped and
  doable — or is the label lying?

Gemma is how we verify meaning. It touches every stage:

| Stage | Gemma's job | Why it isn't a wrapper |
|---|---|---|
| Scout | **Repo Scout** selects from the supplied catalogue using the profile | Gemma can choose among known entries; it does not perform web discovery |
| Score | **Jev check** estimates beginner accessibility, label honesty, and likely scope | Its label-accuracy estimate changes issue-quality scoring for the shortlist |
| Rank | Deterministic repository and issue signals; Gemma Jev can adjust a bounded shortlist | Scores remain explainable and do not require embeddings |
| Explain | Deterministic evidence summary; tier affects score weights and guide depth | No model-generated explanation in the current result path |
| Guide | Uses issue context and a repository file tree; confirms proposed paths exist | Path checks are real; file contents and line citations are not currently available |

**Possible demo moment:** Gemma may flag a beginner label as misleading or mention a
hidden prerequisite. Treat this as an advisory model assessment, show its evidence, and
do not imply that every prerequisite has been confirmed from repository code.

**Accurate pitch line:** "Structural checks establish issue and repository facts. Gemma
adds an advisory semantic assessment of a small shortlist and helps draft the guide."

#### The Dual-Engine Architecture: System 1 (Jev) + System 2 (Copilot)

To satisfy the strict hackathon track criteria, **no model other than Gemma 4 is used**. Jev is **not** an external model or third-party service; it is an **architectural execution paradigm** implemented directly on Gemma 4.

Inspired by cognitive science (*Thinking, Fast and Slow*), Gemma 4 operates via a **self-triggered dual-engine harness**:

```
                              ┌───────────────────────────────────────────────┐
                              │            SOLE MODEL: GEMMA 4                │
                              └───────────────────────────────────────────────┘
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
         [SYSTEM 1: JEV DECISION ENGINE]                               [SYSTEM 2: ONBOARDING COPILOT]
          - One request for each shortlisted issue                       - One guide request after selection
          - JSON-shaped response prompt                                  - Bounded issue and file-tree context
          - Provider latency and token cost                               - No streaming conversation
          - Output: JevDecision record                                    - Output: guide with checked paths
```

1. **System 1: The Jev Decision Engine (`core/verify/jev.ts`):** Typed classification used on the top three candidates in a normal match and on a pasted issue. Latency and confidence depend on the provider; probability outputs have not been calibrated against a labeled evaluation set.
2. **System 2: Generative Copilot / Mentor Mode (`core/llm/router.ts`):** When the developer selects an issue, Gemma generates a guide from the issue and a repository file tree. It does not stream interactive chat or read source-file contents.

#### The "Harness Problem" (Why Zero Fine-Tuning is Better)

Fine-tuning is outside the scope of this build. The model assessment remains fallible and
needs evaluation against a labeled set before its confidence or accuracy can be claimed.

Current safeguards are bounded input context, a JSON response instruction, defensive parsing,
and deterministic fallbacks. The Jev response does not use schema-constrained decoding, and
the temperature-scaled token scores are not statistically calibrated. Guide paths are
checked against the fetched tree before rendering.


#### The Gemma 4 Jev Client Harness (Google AI Studio Implementation)

The current client sends a JSON-only prompt with letter-coded options and requests token
log-probabilities from the OpenAI-compatible endpoint. It parses returned choices and uses
available token scores as a heuristic; it does not provide constrained decoding or a
validated calibration method. Missing token scores produce conservative uncertainty.

##### Architectural Comparison: True Jev vs. Gemma 4 AI Studio Harness

| Feature | TypeSafe Jev / `djev` (`DiffusionGemma` + vLLM) | Gemma 4 + Google AI Studio API Harness |
| --- | --- | --- |
| **Execution Mechanism** | Not implemented in this application. | Autoregressive request to the configured Gemma 4 endpoint. |
| **Probability Source** | Not implemented. | Optional endpoint token scores; absent scores are treated as uncertain. |
| **Calibration** | No benchmark or calibration set is included. | Temperature scaling is a heuristic, not validated calibration. |
| **Latency** | Not measured. | Depends on provider, network, and model load; not benchmarked. |
| **Infra Dependency** | Not part of the current build. | Requires a reachable configured endpoint and a valid key. |

##### The 4 Harness Mechanisms (`core/verify/jev.ts`)

1. **Thinking Suppression & Greedy Decoding:**
   * Rigid system instruction: *"You are a deterministic System-1 decision classifier. Output ONLY the JSON object mapping each question key to its single-letter option code."*
   * Disables `<|think|>` tags, enforces `temperature: 0.0`.
2. **Single-Token Letter Mapping:**
   * Multi-token option labels (e.g., `"completely_misleading_trap"`) are mapped to single ASCII characters (`"A"`, `"B"`, `"C"`) before evaluation, collapsing joint prefix-tree computations into a single token step.
3. **Logprob Extraction & Temperature Scaling ($T \approx 1.4$):**
   * If `response_logprobs` are returned, extracts logits $\ell_i$ across candidate letters and applies temperature scaling:
     $$P(y_i) = \frac{\exp(\ell_i / T)}{\sum_j \exp(\ell_j / T)}$$
   * Graceful fallback: If logprobs are unavailable on a given tier, falls back to argmax $P=1.0 / 0.0$.
4. **Deterministic Jev Primitives Math in TypeScript:**
   * **`choice`**: Returns option with $\max(P)$, full probability map, and `confidence = max(P)`.
   * **`score`**: Ordinal expected value $\sum i \cdot P(y_i)$ + confidence via Mean Absolute Deviation (MAD) around the mode.
   * **`noul`**: Maps `["yes", "no"]` to `["Y", "N"]` and returns $P("yes")$ directly as boolean probability.

##### 5. Stringent Evaluation & Empirical Benchmark Results (`scripts/evaluate_jev.ts`)

To avoid speculation or unverified marketing claims ("60% latency reduction", "100% anti-hallucination"), the Gemma 4 Jev decision harness was subjected to an empirical benchmark across a battery of 6 curated edge-case and representative open-source issues:
1. *Clean Typo & Doc Clarification:* Genuine good first issue with isolated scope.
2. *Mislabeled Trap (Redis/Infra):* Marked `good first issue` by maintainers, but body requires local Redis cluster and Sentinel failover.
3. *Contested Issue:* Clean fix, but already has 2 open competing pull requests.
4. *Vague Crash Report:* Lacks reproduction steps or logs; high newcomer stall risk.
5. *Concurrency & Lock-Free Trap:* Marked `starter`, but requires debugging work-stealing thread-pool race conditions using atomic CAS primitives.
6. *Adversarial Hallucination Test:* Tests whether ungrounded / paraphrased quotes are caught and rejected.

###### Benchmark Comparison Matrix

| Evaluation Architecture | Classification Accuracy | False Negatives on Traps | Avg Latency | Avg Round-Trips | Total Tokens |
|---|---|---|---|---|---|
| **Single-Pass Baseline (Locked)** | **100.0%** | **0** | **372 ms** | **1.0** | **1,802** |
| **Staged / Conditional Branching** | 66.7% | 2 (Critical Risk) | 282 ms | 1.2 | 1,938 |

###### Architectural Decisions Derived from Evaluation:
1. **Conditional Staging Rejected:** Staged evaluation (asking `beginner_friendly` first, and only diagnosing traps if negative) introduced a fatal failure mode: the model looking at the superficial label `good first issue` classified both the Redis trap and the concurrency lock trap as beginner-friendly, skipping Stage 2 entirely! For newcomers, missing a trap is the most damaging outcome. Furthermore, when branches were taken, sequential network latency jumped to **552 ms** across 2 round-trips. Single-pass evaluation is retained as the locked architecture.
2. **Grounded Verbatim Substring Quote Rule Approved:** Strict literal verification (`candidate.body.includes(quote.trim())`) achieved 100% precision in catching hallucinations (dropping the adversarial fake quote), while attaching exact quotes for genuine traps. If the model hallucinates even one word or paraphrases, the quote is discarded (`quote = null, quoteVerified = false`), keeping the assessment strictly advisory.
3. **Native `djev` Deferred:** DiffusionGemma / native `djev` remains an optional future adapter. The current production application strictly adheres to the hackathon's "Exclusively Gemma 4" requirement via the Google AI Studio API harness with zero fine-tuning.
4. **Scope-Bounded Results Visualization:** Any graph or mindmap view in the app is strictly a *derived visual layout* of the current in-memory results (`User Profile -> Matched Repositories -> Top Issues -> Grounded Evidence & Verdicts`). We explicitly reject premature claims of a global persistent knowledge-graph engine or cross-repo verdict propagation.

#### Model choice, revisited

The Issue Reader is the one Gemma call where quality is load-bearing: extracting
prerequisites and red flags from messy issue text. That is an argument for
`gemma-4-31b-it` over smaller variants, and it is the call most worth calibrating
against real issues. The comprehension adapter and the repo reader are more
forgiving — keep one model for simplicity and cache aggressively.

#### What the Reader changes in scoring

`issueQuality` is currently a heuristic over body length, labels and freshness —
dumb signals that reward verbosity. The Reader replaces "the body is 600
characters long" with "this describes a reproducible bug with a one-file fix,
but omits the Python version".

| Heuristic today | Reader signal instead |
|---|---|
| body length | does the body state a reproduction and an expected outcome? |
| any labels present | is the label accurate for the actual scope? |
| freshness only | ambiguity score + missing prerequisites |
| unassigned | underspecified / contended / needs a design decision |

The score becomes defensible instead of merely plausible.

### Judging map

| Criterion | How we win it |
|---|---|
| **Usability** | Real beginner pain; live demo of a real issue becoming a real plan |
| **Creativity** | Not an issue filter, not "chat with a repo" — *verification + readiness scoring* is the novel core |
| **Scalability** | Curated pilot now; shared inventory and queued discovery are future work |
| **Adaptability** | Pluggable LLM/matcher/signal providers, one-command setup, README extension points |

---

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Architecture | **One pipeline, two front doors** | Tier 1/2 differ only in inputs and guidance depth |
| Clarifying questions | **Fixed question bank, LLM-selected, rendered as a form** | No unbounded chat; deterministic and testable |
| Discovery & Retrieval | Curated Scout + at most two cached GitHub Search queries + targeted Core REST | Can find outside the registry while bounding search calls and keeping a curated fallback |
| Core value | **Verify & Score stage** | This is the differentiator; raw lists don't verify feasibility |
| Demos | **Prefetched + cached, with live fallback** | On-stage reliability |
| Stack | **Next.js (App Router) + TypeScript**, framework-agnostic `core/` | One process, fast polished UI, `@octokit/rest`, CLI reusable later |
| LLM | **Gemma 4 via Google AI Studio** using the OpenAI-compatible endpoint | Meets the special-track model constraint |
| Embeddings | Not implemented | Fit uses deterministic tags and issue signals |
| Gemma roles | Catalogue selection + Jev check for a bounded shortlist + guide generation | Semantic evaluation affects the issue-quality score |
| Surface | **Website**, with an API-first `core/` + quick CLI check | Ranking needs space; CLI proves adaptability |
| Storage | **File-based JSON cache** (SQLite only if needed) | Simplicity; zero infra |
| Auth | **Bring-your-own-key** — users paste their Gemma + GitHub credentials in the UI | Judges supply their own keys; nothing secret ships with the build |

**The user supplies:** a Gemma API key and optional GitHub token in `/settings`. The server
operator configures `LLM_BASE_URL` and `LLM_MODEL` in `.env`; the browser cannot override the
destination. This build accepts Gemma 4 model identifiers only.

---

## 3. Pipeline

```
                    ┌─────────────────────────────┐
                    │  S0  SCOPE  (tier-dependent) │
   rough input ───► │  question bank → candidate   │ ───► Profile
   or "I'm new"     │  questions → form answers    │
                    └─────────────────────────────┘
                                  │
                                  ▼
   Profile ──► S1 REPO SCOUT ────► Curated Registry & Gemma Web Knowledge
                                  (Selects top 3–5 active, welcoming repos)
                                  │
                                  ▼
              S2 RETRIEVAL ──────► Core REST for curated repos plus up to two cached Search queries
                                  (bounded open-issue candidate sample)
                                  │
                                  ▼
              S3 VERIFY & SCORE ─► fetch signals (README, CONTRIBUTING, CI, commits,
                                  │   merged PRs, linked open PRs) → ReadinessScore
                                  │   + Gemma Jev check on the top three candidates (when configured)
                                  ▼
              S4 RANK ──────────► tier-weighted ranking (deterministic first,
                                  │   optional LLM semantic rerank)
                                  ▼
              S5 EXPLAIN ───────► "why this fits you" (grounded in scored evidence)
                                  │
                                  ▼
              S6 GUIDE ─────────► getting-started path for the chosen issue
                                  (tier-dependent depth, citations verified)
```

Hard rule: **any stage that can return nothing must degrade gracefully** — empty state,
not a crash. A demo that shows a clean empty state is fine; a demo that spins forever is not.

**Four entry points, one unified pipeline.**

```
Guided wizard (newcomer)          ─┐
Quick form (experienced)          ─┼─► S1/S2 retrieve → S3 verify & score → S4 rank → S5 explain → S6 guide
Target URL/Org (web side door)   ─┤         ▲
Terminal CLI (npm run cli)        ─┘         │ (Org/repo scopes S2; issue skips to S3)
```

1. **Guided wizard (newcomer):** Interactive questionnaire building a tailored developer profile.
2. **Quick form (experienced):** Minimal stack/interest input for fast matching.
3. **Pasted GitHub target (side door):**
   * *Issue URL (`/owner/repo/issues/123`):* Skips discovery; directly runs structural checks, readiness score, and Gemma 4 Jev semantic trap diagnosis.
   * *Repository URL (`/owner/repo`):* Scopes discovery to open issues within that single repository.
   * *Organization URL (`github.com/openstreetmap` or `openstreetmap`):* Resolves owner type, scans the top 100 active repositories, filters out archived/disabled/no-issue repos, budgets the top 5 active candidate repos, and returns ranked, verified issues with transparent coverage metrics (`"evaluated 5 active of 89 public repos"`).
4. **Terminal CLI (`cli.ts`, `npm run cli`):**
   * An in-terminal interactive shell for developers who prefer the command line.
   * Parses natural language developer requests using Gemma 4 (with deterministic fallback).
   * Displays parsed profile for confirmation/editing.
   * Renders colorized readiness cards with Jev badges and grounded quotes.
   * Generates step-by-step onboarding guides with verified file citations directly in the console.

---

## 4. Data model

```ts
type ExperienceLevel = "newcomer" | "dabbler" | "experienced";
type Goal = "learn" | "merge-fast" | "maintainer-track" | "portfolio";
type ContributionType = "code" | "docs" | "tests" | "design" | "translation" | "triage";
type TimeBudget = "under-1h" | "weekend" | "ongoing";
type IssueSize = "tiny" | "small" | "any";

interface Profile {
  experienceLevel: ExperienceLevel;
  goal: Goal;
  stack: { tech: string; fluency: 1 | 2 | 3 | 4 | 5 }[];
  interests: string[];
  contributionTypes: ContributionType[];
  timeBudget: TimeBudget;
  constraints: {
    license?: string[];
    requireCI?: boolean;
    maxRepoSize?: "small" | "medium" | "any";
    communicationLanguage?: string[];
  };
  issueSize: IssueSize;
}

interface RepoSignals {
  fullName: string;
  language?: string;
  topics: string[];
  stars: number;
  pushedAt: string;
  hasReadmeSetup: boolean;
  hasContributing: boolean;
  hasCI: boolean;
  hasTests: boolean;
  hasDevcontainer: boolean;
  hasLicense: boolean;
  hasCodeOfConduct: boolean;
  mergedPRsFromOutsiders90d: number;
  medianMaintainerResponseHours?: number;
  dependencyWeight: number;      // heft of setup
  evidence: Evidence[];
}

interface IssueCandidate {
  repo: string;
  number: number;
  title: string;
  url: string;
  labels: string[];
  bodyLength: number;
  createdAt: string;
  updatedAt: string;
  assigned: boolean;
  comments: number;
  linkedOpenPRs: number;
  hasReproduction: boolean;
  sizeHint: IssueSize;
  signals: RepoSignals;
  score: ReadinessScore;
}

interface JevDecision {
  verdict: "VERIFIED_READY" | "MISLABELED_TRAP" | "NEEDS_TRIAGE" | "CONTESTED";
  confidence: number;            // heuristic confidence; not statistically calibrated
  labelAccuracyScore: number;    // 0.0 to 1.0 (is 'good first issue' honest?)
  calibratedScope: "micro_fix" | "isolated_module" | "multi_file" | "architectural_overhaul";
  hiddenPrerequisites: string[]; // e.g. ['redis', 'docker', 'db_migration']
  evidence: string;              // Grounded 1-sentence explanation
  quote?: string | null;         // Verbatim substring extracted from issue body (if verified)
  quoteVerified?: boolean;       // True if quote exists verbatim in candidate.body
}

interface ReadinessScore {
  fit: number;            // 0..1
  accessibility: number;  // 0..1
  liveness: number;       // 0..1
  issueQuality: number;   // 0..1
  competition: number;    // 0..1  (higher = less contested)
  setupCost: number;      // 0..1  (higher = cheaper to set up)
  total: number;          // weighted 0..100
  weights: Record<string, number>;
  evidence: Evidence[];   // human-readable justifications
  jevDecision?: JevDecision;
}

interface Evidence {
  label: string;   // e.g. "Has CONTRIBUTING.md"
  value: string;   // e.g. "yes" / "3 merges in 90d"
  weight: number;
  source: string;  // URL or API path — provenance matters
}

interface Guidance {
  summary: string;
  setupSteps: string[];
  whereToLook: { path: string; why: string }[];  // MUST be verified to exist
  approach: string[];
  firstCommit: string[];
  resources: { title: string; url: string }[];
}
```

---

## 5. Readiness score

Every sub-score is normalized to `[0,1]`. `total = Σ(wᵢ · sᵢ) × 100`.

### How each sub-score is computed

| Sub-score | Inputs | Formula sketch |
|---|---|---|
| **fit** | profile stack+interests and contribution types vs repo metadata and issue text | deterministic weighted tag and issue-signal overlap |
| **accessibility** | README setup, CONTRIBUTING, CI, tests, devcontainer, license, CoC | weighted fraction present |
| **liveness** | `pushedAt` recency (half-life decay), outsider merges/90d, maintainer response time | decay + normalized counts |
| **issueQuality** | freshness, `!assigned`, body length/structure, reproduction present, label set | rubric sum |
| **competition** | `linkedOpenPRs`, comment count | `1 / (1 + openPRs + max(0, comments-15)/10)` |
| **setupCost** | `dependencyWeight`, language heft, repo size | inverse-normalized |

### Tier weights

| Sub-score | Newcomer | Experienced |
|---|---|---|
| fit | 0.25 | 0.35 |
| accessibility | 0.25 | 0.10 |
| liveness | 0.15 | 0.25 |
| issueQuality | 0.20 | 0.15 |
| competition | 0.10 | 0.10 |
| setupCost | 0.05 | 0.05 |

Weights live in a **tier config object** — adding a new tier is a config entry, not code.

---

## 6. Tiers = config, not systems

| | Tier 1 — Newcomer | Tier 2 — Experienced |
|---|---|---|
| Front door | Wizard; first question is "are you new?" | 4-field quick form |
| Question bank | Jargon-explaining; comprehension, comfort, time | Stack fluency, goal, issue size |
| Retrieval breadth | Wide, generous | Targeted at stack |
| Ranking emphasis | accessibility, liveness, fresh & unassigned | quick-merge, impact, responsive maintainers |
| Guidance depth | Deep; explains fork/PR/jargon | Concise setup + technical approach |
| Output framing | "Your first PR plan" | "Issues worth your time" |
| Results shown | 3, with one explicit **"Start here"** pick | 10, ranked list |
| Score display | Verdict badge + plain-language evidence | Full numeric breakdown |

**Demo beat:** flip the tier toggle and watch the *same* candidate pool re-rank. That
proves the tiering in one interaction.

---

## 7. Caching & demo determinism

- Authenticated GitHub token → 5,000 core req/hr, 30 search req/min.
- **Cache every fetch** (repo signals, issue lists) to `.cache/` as JSON with TTL.
- **`scripts/prefetch.ts`** warms the cache for 3–5 demo scenarios before the demo.
- On stage: cached path is instant. Live path shows a spinner and is the fallback.
- **Verify before render:** drop any file path or citation that doesn't resolve.
  A visible hallucination costs more than a missing bullet.
- Timeouts on every network/LLM call; empty state instead of a hang.

---

## 8. HTTP surface

| Route | Purpose |
|---|---|
| `POST /api/scope/questions` | rough input → selected question set from bank |
| `POST /api/match` | full profile → ranked `IssueCandidate[]` with score cards |
| `POST /api/guide` | `{repo, issueNumber, profile}` → `Guidance` |
| `GET /api/repo/:owner/:name/signals` | cached `RepoSignals` (debug/inspection) |
| `GET /api/health` | liveness + cache stats |

---

## 9. UI screens

**Primary surface: the website.** The core loop is comparison and ranking, which
needs space. An issue-page overlay can only ever verify the one issue you are
already looking at — it hides the differentiator.

1. **Landing / Scope** — tier toggle, then either wizard (T1) or quick form (T2).
2. **Results** — ranked cards: title, repo, labels, **readiness score card with sub-scores**, "why it fits you".
3. **Verify** (side door) — paste any GitHub issue URL → same verification, score and guide. Enters the pipeline *after* retrieval and ranking, so it skips those stages; no profile required. This is 80% of a browser-extension experience with none of the fragility, and it is the strongest single demo interaction. Secondary for newcomers — useful when a mentor or maintainer hands them a specific issue.
4. **Guide** — chosen issue: summary, setup steps, where to look, approach, first commit, resources.
5. **About** — cached vs live, provider info, extension points (nice-to-have).

Later surfaces (not MVP): CLI over `core/`, then a VS Code extension or GitHub
Action. The API-first split is what makes those a wrapper rather than a rewrite.

Polish order: correctness → layout → transitions. Ugly-but-working first.

---

## 10. Repo structure

```
contributor-compass/
├─ README.md                 # install, one-command run, extension points
├─ .env.example              # GITHUB_TOKEN, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
├─ package.json
├─ core/                     # framework-agnostic; reusable by a future CLI
│  ├─ profile/  schema.ts          (zod)
│  ├─ questions/ bank.ts  select.ts
│  ├─ registry/ repos.ts                     # curated high-reputation repo sets
│  ├─ scout/    scout.ts                     # catalogue selector with deterministic fallback
│  ├─ github/   client.ts  issues.ts  signals.ts  ratelimit.ts
│  ├─ score/    readiness.ts  weights.ts
│  ├─ rank/     rank.ts
│  ├─ explain/  explain.ts
│  ├─ guide/    guide.ts
│  ├─ llm/      adapter.ts  router.ts         # Gemma endpoint and guide routing
│  ├─ verify/   verify.ts   jev.ts                   # System 1 Gemma-Jev typed decision engine
│  └─ cache/    cache.ts
├─ app/                      # Next.js App Router
│  ├─ page.tsx               # scope + form
│  ├─ results/page.tsx
│  ├─ guide/page.tsx
│  ├─ components/  ScoreCard.tsx  CandidateCard.tsx  TierToggle.tsx
│  └─ api/…                  # routes from §8
├─ scripts/prefetch.ts       # warm demo cache
└─ .cache/                   # gitignored
```

---

## 11. Extension points (the Adaptability pitch)

- **LLM provider:** change `LLM_BASE_URL` / `LLM_MODEL`. No code edits.
- **Matcher strategy:** implement `Matcher { buildQueries(profile): Query[] }`.
- **New signal:** implement `SignalProvider { key, fetch(repo): Evidence }`.
- **New tier:** add a config entry (weights + question bank + guidance template).
- **Retrieval source:** `SearchSource` interface — GitHub today, GH Archive / a code
  index at scale.

Document these in the README with a 3-line example. Judges score what they can see.

---

## 12. Scalability story (for the pitch)

The current implementation is a curated pilot, not a globally indexed discovery system.
Its local JSON cache and synchronous GitHub fetches are suitable for demos and low traffic.
They do not provide shared state or horizontal cache consistency.

To reach broad coverage, build a scheduled discovery worker and candidate inventory, store
repository and issue records in shared Postgres, use a durable queue for enrichment, and
revalidate shortlisted issues before presentation. Rate-limit-aware pacing, backoff, source
provenance, freshness timestamps, and partial results are requirements for that next stage,
not capabilities to claim until they ship.

---

## 13. Execution schedule (7h, solo)

| Window | Work | Checkpoint |
|---|---|---|
| 0:00–0:30 | Init repo, `.env`, schema, README skeleton, prefetch stub | `npm run dev` boots |
| 0:30–1:15 | GitHub client, search queries, raw retrieval | CLI prints real issues |
| 1:15–2:15 | Signal fetchers + cache layer | Signals JSON for 1 repo |
| 2:15–3:15 | Scoring + tier weights + ranking | Ranked JSON with score cards |
| 3:15–4:00 | Profile form + tier toggle + results list UI | Toggle visibly re-ranks |
| 4:00–4:45 | Scope questions (bank + selector) | Wizard produces a profile |
| 4:45–5:30 | Explain + Guide via LLM, grounded | Guide renders, citations verified |
| 5:30–6:15 | Prefetch demo repos, empty/error states, polish | Offline demo works |
| 6:15–7:00 | README, one-command run, extension docs, rehearse pitch | Clean clone runs |

**If behind at 3:15:** cut the wizard (ship form-only) and cut `explain`.
**If behind at 4:45:** cut `guide` depth to setup steps + approach only.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| GitHub rate limits | Cache searches, cap at two Search queries and three new repos per match, use targeted Core REST for curated repos, and retain partial results |
| LLM latency/flakiness | Precompute; stream; spinner; deterministic fallback strings |
| Hallucinated citations | `verify.ts` drops non-existent paths before render |
| "Too generic" feedback | Readiness card + evidence provenance is the visible difference |
| Scope creep in 7h | Cut list is pre-decided (§13) |
| Search returns noise/stale issues | Verify stage filters assigned/stale/contested |

---

## 15. Demo script (60 seconds)

1. "I'm a complete beginner." → 3–5 verified issues, each with a readiness score card.
2. Flip to "I know my stack, I want merges." → **same pool re-ranks**.
3. Open one → readiness evidence ("CONTRIBUTING.md ✅, 3 outsider merges in 90d ✅, 0 open PRs ✅").
4. Generate the guide → cited files/lines, setup steps, first commit.
5. Show that the server operator can configure the model endpoint and model id in `.env`.
6. Close: one-command install + README extension points (Adaptability); cached signal
   store + queue (Scalability).

---

## 16. Definition of done

- [ ] `npm install && npm run dev` works from a clean clone with `.env.example`.
- [ ] All four signals of the readiness card render with evidence.
- [ ] Tier toggle visibly changes ranking order.
- [ ] ≥3 prefetched scenarios return non-empty, cited results **offline**.
- [ ] No unverified file paths rendered anywhere.
- [ ] README documents install, architecture, and ≥3 extension points.
- [ ] 60-second demo rehearsed twice.

---

## 17. Stretch (only if ahead of schedule)

AI-authored custom clarifying question · codebase file citations in the guide ·
CLI over `core/` · local-model fallback · persistent SQLite index · saved sessions.

---

## 18. Bring-your-own-key (BYOK)

Judges run this build with **their own** Gemma API key and GitHub token. Nothing secret is
committed, and a server `.env` is optional.

**Flow**

1. First visit shows a "Bring your own key" prompt; `/settings` is always in the nav.
2. The user pastes a Gemma key and optional GitHub token. The server controls the model endpoint and model id.
3. Values are stored in `localStorage` only, and sent as request headers:
   `x-compass-llm-key` and `x-compass-github-token`.
4. Each route handler wraps its body in `withRequestConfig(configFromRequest(request), …)`.
   `core/config/env.ts` reads request-scoped values first, then `.env`.
5. "Test connection" calls `/api/health?probe=1`, which performs one cheap `/rate_limit`
   call to prove the token works before the judge runs a search.

**Why AsyncLocalStorage.** The GitHub client and LLM adapter already read credentials through
`env.*()`. Scoping those reads per request means BYOK required no signature changes anywhere
in `core/` — and guarantees one user's key can never leak into another request's context.

**Precedence.** Request headers supply credentials; `.env` supplies model id and base URL.
A user can paste only an API key and still run when the server has its model configuration.

**Honest limitation.** Keys transit this app's server (they must, to call Google and GitHub).
They are held in memory for the duration of one request and never logged or persisted. For a
production deployment the next step is an encrypted server-side session store.

