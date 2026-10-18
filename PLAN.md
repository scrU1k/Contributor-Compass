# Contributor Compass — Build Plan (v3.1)

**Event:** Hacktoberfest Hack Day (BMSCE IEEE Computer Society)
**Themes:** Use AI to Build Developer Tools · AI for Open Innovation
**Rubric:** Usability · Creativity · Scalability · Adaptability
**Special Track:** Best Use of Gemma API (Mandatory: **Exclusively Gemma 4**, no foreign models)
**Constraints:** Solo · 6–7 hours · Zero Fine-Tuning (Pure Harness Scaffolding) · Deterministic Demo

---

## 1. Concept

One-liner: **Contributor Compass turns a developer's skills and goals into a verified, ready-to-work path into open source.**

A user describes who they are (or just says "I'm a beginner" / "I want merges").
The system returns a **ranked list of real, verified GitHub issues**, each with a
**Contribution Readiness Score** explaining *why* it fits and whether it's actually
doable — then generates a grounded **getting-started guide** for the one they pick.

It bridges both themes: a developer tool (codebase/issue understanding) that serves
open innovation (opening contribution up to newcomers).

### Positioning (the headline)

**"The category exists. Nobody verifies."**

Discovery tools (`goodfirstissue.dev`, `up-for-grabs`, CodeTriage, GitHub label search)
hand you a *static list* by scraping the global GitHub Search API. That approach has two fatal flaws:
1. **Rate limit suicide:** GitHub's Search API enforces a strict **30 requests/minute** limit, easily breaking during live demos or high usage.
2. **Garbage-in:** Blind search queries return abandoned forks, unmaintained student repos, and dead projects with stale "good-first-issue" labels.

Contributor Compass fixes this with a **Two-Stage Hybrid Discovery Engine**:
- **Stage 1 (Repo Scout):** Matches the user's stack and interests to high-reputation, actively maintained open-source ecosystems using a curated registry backed by Gemma web/knowledge scouting.
- **Stage 2 (Targeted Core REST API):** Directly queries `/repos/{owner}/{repo}/issues` using GitHub's **Core REST API (5,000 requests/hour)** — 160x higher throughput than the Search API.
- **The Core Differentiator (Live Verification):** Before an issue is shown, we confirm it is still unassigned, not already contested by an open PR, and sits in a repo that actually has setup docs, CI, and a history of merging outsider contributions.

Secondary narrative: **the contribution quality layer.** AI made contributing easy to
fake; Hacktoberfest's well-known spam problem hurts maintainers. We use AI to make
*genuine* contribution easier — the same scoring engine serves both sides.

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
| Scout | **Repo Scout** matches profile & niche interests to reputable OSS ecosystems via web/domain knowledge | Model intelligence drives discovery beyond static keywords |
| Score | **Issue Reader** extracts required skills, likely areas, effort, prerequisites, ambiguity, red flags | Extracted fields change the ranking |
| Rank | **EmbeddingGemma 2** semantic fit | Load-bearing similarity, not prose |
| Explain | **Comprehension adapter** rewrites the same issue for newcomer vs expert | Personalised language, visibly tier-dependent |
| Guide | **Repo reader** reads real file contents and cites lines | Grounded in code, citations verified |

**The WHOA moment:** the label says "good first issue"; Gemma reads it and
disagrees — "this actually needs a Redis instance and knowledge of the scheduler."
The AI contradicts the label and the evidence is on screen. That is the
"nobody verifies" thesis made literal.

**Pitch line:** "Gemma is the verifier, not the copywriter. Structural checks tell
us the repo is alive; Gemma tells us the issue is real. And because it's
open-weight, the same pipeline can run fully local — which is the point of a
project about open source."

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
          - Single-pass typed evaluation                                - Conversational code mentor
          - Strict JSON schema decoding (temp 0.0)                      - Streaming interactive markdown (temp 0.7)
          - ~60 tokens / issue (zero latency)                           - Deep repo & setup walkthrough
          - Output: Typed JevDecision Record                            - Output: Interactive chat & debug advice
```

1. **System 1: The Jev Decision Engine (`core/verify/jev.ts`):** High-speed, single-pass classification. While normal chatbots output 500+ tokens of meandering text, Gemma-as-Jev screens 10 candidate issues in ~1.5s, outputting strictly typed confidence, label accuracy, and hidden prerequisites.
2. **System 2: Generative Copilot / Mentor Mode (`core/llm/router.ts`):** Self-triggered toggle. When the developer selects an issue and clicks *"Start Working"*, Gemma 4 switches to System 2, streaming interactive guidance, setup reproduction, and verified code citations.

#### The "Harness Problem" (Why Zero Fine-Tuning is Better)

**Fine-tuning Gemma 4 is an anti-pattern for this task.** Gemma 4 already possesses deep semantic understanding of programming languages, GitHub issues, and software architectures. The failure of naive AI tools is purely a **harness engineering problem**.

Our harness enforces four deterministic layers:
1. **Context Grounding:** Injects both the issue body AND verified repository signals (CI status, outsider merge history, open PR count).
2. **Few-Shot In-Context Calibration:** Injects calibrated reference anchors of a genuine beginner issue vs a "mislabeled trap".
3. **Constrained Schema Decoding:** Locks `temperature: 0.0` and enforces strict JSON schemas (Zod).
4. **Deterministic Validation & Fallback:** Validates all outputs through Zod parsers; drops hallucinated file paths before rendering.


#### The Gemma 4 Jev Client Harness (Google AI Studio Implementation)

Because the Google AI Studio API serves autoregressive versions of Gemma 4 (`gemma-4-26b-a4b-it` or `gemma-4-31b-it`) rather than `DiffusionGemma` with custom vLLM canvas-pinning (`vllm_xargs`), we cannot perform parallel block-diffusion through AI Studio. Instead, we force Gemma 4 to behave as a strict System-1 decision model by combining **Schema-Constrained Decoding**, **Single-Token Letter Mapping**, **Token Log-Probabilities (`response_logprobs`)**, and **Temperature-Scaled Softmax** inside `core/verify/jev.ts`.

##### Architectural Comparison: True Jev vs. Gemma 4 AI Studio Harness

| Feature | TypeSafe Jev / `djev` (`DiffusionGemma` + vLLM) | Gemma 4 + Google AI Studio API Harness |
| --- | --- | --- |
| **Execution Mechanism** | Parallel block-diffusion pass over fixed token slots. | Autoregressive decoding constrained by strict JSON/Enum schema. |
| **Probability Source** | Softmax applied strictly over allowed option logits in canvas. | Extracted from `response_logprobs` (`top_candidates`) or normalized across single-token outputs. |
| **Calibration** | Trained with RLCD (Jev) or multi-sample canvas averaging (`djev`). | Autoregressive logprobs are overconfident; calibrated via **Temperature Scaling ($T \approx 1.4$)**. |
| **Latency** | ~35–120 ms per multi-question batch. | ~150–350 ms on `gemma-4-26b-a4b-it` (MoE activates only ~3.8B params/token). |
| **Infra Dependency** | Dedicated GPU server (NVIDIA L4/A10G) running vLLM forks. | **Zero infrastructure** — runs on any free/standard Google AI Studio API key (BYOK). |

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
| **Scalability** | Stateless pipeline, cached signals, swappable retrieval source, queue story |
| **Adaptability** | Pluggable LLM/matcher/signal providers, one-command setup, README extension points |

---

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Architecture | **One pipeline, two front doors** | Tier 1/2 differ only in inputs and guidance depth |
| Clarifying questions | **Fixed question bank, LLM-selected, rendered as a form** | No unbounded chat; deterministic and testable |
| Discovery & Retrieval | **Hybrid Scout + Core REST API** (`/repos/:owner/:repo/issues`) | 5,000 req/hr Core API bypasses brittle 30 req/min search limit; filters out dead repos |
| Core value | **Verify & Score stage** | This is the differentiator; raw lists don't verify feasibility |
| Demos | **Prefetched + cached, with live fallback** | On-stage reliability |
| Stack | **Next.js (App Router) + TypeScript**, framework-agnostic `core/` | One process, fast polished UI, `@octokit/rest`, CLI reusable later |
| LLM | **Hosted open-weight, OpenAI-compatible** — Gemma 4 via Google AI Studio (or OpenRouter) | Open-model story without local-GPU risk; one env var to swap |
| Embeddings | **EmbeddingGemma 2** (same provider/endpoint) | Makes semantic fit load-bearing AI, not decoration |
| Gemma roles | Repo Scout + Issue Reader + Comprehension adapter + Repo reader | Multi-stage pipeline touchpoints; verifier, not copywriter |
| Surface | **Website**, with an API-first `core/` + quick CLI check | Ranking needs space; CLI proves adaptability |
| Storage | **File-based JSON cache** (SQLite only if needed) | Simplicity; zero infra |
| Auth | **Bring-your-own-key** — users paste their Gemma + GitHub credentials in the UI | Judges supply their own keys; nothing secret ships with the build |

**The one thing a user must supply:** an OpenAI-compatible base URL + key, entered in
`/settings`. Google AI Studio and OpenRouter both speak this protocol, so one adapter covers
both. Pick **one** provider for the build; the swap is a demo flourish, not a build task.
Server `.env` values still work as defaults, and anything entered in the UI wins for that
session.

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
              S2 CORE REST FETCH ► GitHub Core API (5,000 req/hr, NOT 30/min)
                                  (Pulls live open, unassigned issue candidates)
                                  │
                                  ▼
              S3 VERIFY & SCORE ─► fetch signals (README, CONTRIBUTING, CI, commits,
                                  │   merged PRs, linked open PRs) → ReadinessScore
                                  │   + Gemma Issue Reader semantic verification
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

**Three entry points, one pipeline.**

```
Guided wizard (newcomer)  ─┐
Quick form (experienced)  ─┼─► retrieve → verify & score → rank → explain → guide
Pasted issue URL (side)   ─┘        └──────── skipped ────────┘
```

The pasted URL enters *after* retrieval and ranking — same verification, same score,
same guide, just no discovery step. It is a shortcut for someone who already has an
issue in hand, not a replacement for the guided flow.

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
  confidence: number;            // 0.0 to 1.0 calibrated confidence
  labelAccuracyScore: number;    // 0.0 to 1.0 (is 'good first issue' honest?)
  calibratedScope: "micro_fix" | "isolated_module" | "multi_file" | "architectural_overhaul";
  hiddenPrerequisites: string[]; // e.g. ['redis', 'docker', 'db_migration']
  evidence: string;              // Grounded 1-sentence explanation
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
| **fit** | profile stack+interests (fluency-weighted) vs repo language/topics/README | **EmbeddingGemma 2** cosine + weighted tag overlap |
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
│  ├─ scout/    scout.ts                     # Gemma repo matchmaker & web intelligence
│  ├─ github/   client.ts  issues.ts  signals.ts  ratelimit.ts
│  ├─ embed/    embed.ts                     # EmbeddingGemma 2 client + cache
│  ├─ score/    readiness.ts  weights.ts
│  ├─ rank/     rank.ts
│  ├─ explain/  explain.ts
│  ├─ guide/    guide.ts
│  ├─ llm/      adapter.ts  router.ts  prompts/*.ts  # dual-engine mode dispatcher
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

- Signals cached with TTL → **index once, serve many**.
- Pipeline is **stateless** → horizontal scale.
- Swap retrieval source; add a **job queue** for prefetching at scale.
- Rate-limit-aware scheduler; backoff; partial results rather than failure.
- "At 100x users: a shared signal store + queued enrichment, retrieval behind a
  service boundary." One sentence, backed by the interfaces above.

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
| GitHub rate limits | Bypass 30 req/min Search API with Core REST API (5,000 req/hr) on scouted repos; token + cache + prefetch |
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
5. Swap the model live (one env var, Gemma 4 → another open model) — Adaptability, visible.
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
2. The user pastes a Gemma key (plus optional model and base URL) and a GitHub token.
3. Values are stored in `localStorage` only, and sent as request headers:
   `x-compass-llm-key`, `x-compass-llm-model`, `x-compass-llm-base`,
   `x-compass-github-token`.
4. Each route handler wraps its body in `withRequestConfig(configFromRequest(request), …)`.
   `core/config/env.ts` reads request-scoped values first, then `.env`.
5. "Test connection" calls `/api/health?probe=1`, which performs one cheap `/rate_limit`
   call to prove the token works before the judge runs a search.

**Why AsyncLocalStorage.** The GitHub client and LLM adapter already read credentials through
`env.*()`. Scoping those reads per request means BYOK required no signature changes anywhere
in `core/` — and guarantees one user's key can never leak into another request's context.

**Precedence.** Request headers → `.env` → built-in defaults for model and base URL. A user
can therefore paste only an API key and still run, because the model id and AI Studio base
URL are prefilled.

**Honest limitation.** Keys transit this app's server (they must, to call Google and GitHub).
They are held in memory for the duration of one request and never logged or persisted. For a
production deployment the next step is an encrypted server-side session store.

