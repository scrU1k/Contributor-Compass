# 🧭 Contributor Compass

> **"Verified, not listed."**  
> Existing discovery tools hand developers a static list of `good first issue` tags. **Contributor Compass** transforms a developer's skills and goals into a **live-verified, ready-to-work path into open source** — with checkable evidence for every claim.

[![Gemma 4](https://img.shields.io/badge/Gemma%204-Google%20AI%20Studio-8E75B2?style=flat-square&logo=google)](https://aistudio.google.com/)
[![Jev System-1](https://img.shields.io/badge/Decision%20Harness-Jev%20System--1-4285F4?style=flat-square)](file:///c:/Users/niger/Documents/Contributor%20Compass/core/verify/jev.ts)
[![Open Source Guide](https://img.shields.io/badge/Open%20Source-Grounded%20Onboarding-34A853?style=flat-square)](file:///c:/Users/niger/Documents/Contributor%20Compass/core/guide/guide.ts)
[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-2026-FF7518?style=flat-square)](https://hacktoberfest.com/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](file:///c:/Users/niger/Documents/Contributor%20Compass/LICENSE)
[![BYOK Privacy](https://img.shields.io/badge/BYOK%20Privacy-Zero%20Required%20Keys-00C853?style=flat-square)](file:///c:/Users/niger/Documents/Contributor%20Compass/.env.example)

---

## ⚡ Quickstart (Zero Configuration Required)

Contributor Compass runs **completely out-of-the-box**. No database to install, no Docker containers to spin up, and no mandatory API keys required to test the core pipeline, automated unit tests, or CLI.

```bash
# 1. Install dependencies
npm install

# 2. Run the automated test suite (16 tests, pure deterministic assertions)
npm test

# 3. Launch the Terminal Edition (CLI)
npm run cli

# Or pass a natural-language query directly:
npm run cli -- "I know Python and docs, looking for starter issues in pallets/flask"

# 4. Launch the Web UI
npm run dev
# Open http://localhost:3000
```

> **Optional Bring-Your-Own-Key (BYOK):**  
> To test live Gemma 4 semantic checks and AI guide generation, paste your [Google AI Studio API Key](https://aistudio.google.com/apikey) and GitHub Token into **`/settings`** (Web UI) or add them to `.env`. Credentials stay in request-scoped memory (`AsyncLocalStorage`) and are never written to disk or logged.

---

## 💡 The Motivation: Solving the Open Source Newcomer Wall

Like many developers, my earliest attempts at contributing to open source hit an immediate, frustrating wall:

1. **The Competition Blindspot:** I searched for `good first issue` on GitHub, picked an issue, and spent hours setting up the project — only to realize **3 other people had already opened pull requests** for that exact issue days prior.
2. **The Ghost Town Effect:** I picked another issue, reproduced the bug, and submitted a patch — only to wait months with zero maintainer response. The repository **hadn't merged an outside PR in over a year**; the project was functionally dormant.
3. **The Disguised Scope Trap:** I claimed a task titled "Add date helper", only to discover halfway through that it required refactoring the core database schema, breaking backward compatibility, and securing senior architectural consensus.

Open source discovery today is broken because **tools treat GitHub labels as gospel**. Aggregators like GoodFirstIssue.io passively scrape labels without checking whether the issue is actually unassigned, whether competing PRs exist, whether maintainers are active, or whether the task is a beginner trap.

**Contributor Compass was built to solve this exact shortcoming:** an automated pair-programmer and compass that runs **live verification** across repository health, git tree structure, pull request competition, and semantic issue complexity **before you write a single line of code**.

---

## 🧠 Deep Integration: Gemma 4 & The Jev Decision Structure

Rather than treating the LLM as a superficial text chatbot ("thin wrapper"), Contributor Compass integrates **Gemma 4** (`gemma-4-31b-it`) across a bifurcated **System 1 (Calibrated Decision Primitives)** vs **System 2 (Grounded Cognitive Mentor)** architecture.

```
                           ┌───────────────────────────────────────────────┐
                           │            CONTRIBUTOR COMPASS                │
                           └───────────────────────────────────────────────┘
                                                   │
                   ┌───────────────────────────────┴───────────────────────────────┐
                   ▼                                                               ▼
  ┌─────────────────────────────────┐                             ┌─────────────────────────────────┐
  │   SYSTEM 1: JEV DECISION ENGINE │                             │  SYSTEM 2: GROUNDED ONBOARDING  │
  │   (core/verify/jev.ts)          │                             │  (core/guide/guide.ts)          │
  ├─────────────────────────────────┤                             ├─────────────────────────────────┤
  │ • Gemma 4 at temperature 0.0    │                             │ • Synthesizes setup & approach  │
  │ • Thinking suppression          │                             │ • File citations extracted      │
  │ • Single-token ASCII codes      │                             │ • filterExistingPaths() checks  │
  │ • Sequential logprob cursor     │                             │   real Git tree — drops false   │
  │ • Output: Calibrated decisions  │                             │   hallucinated files            │
  └─────────────────────────────────┘                             └─────────────────────────────────┘
```

### 1. System 1: The Gemma 4 Jev Decision Harness (`core/verify/jev.ts`)
In open-source triage, evaluations must be **deterministic, reproducible, and free of conversational drift**. We emulated the **TypeSafe Jev System-1 decision model** over hosted Gemma 4:
- **Thinking Suppression & Greedy Decoding:** Temperature is locked to `0.0` with rigid single-letter JSON constraints (`{"q1": "A", "q2": "B"}`).
- **Single-Token ASCII Mapping:** Criteria are mapped to single ASCII tokens (`A`, `B`, `C`...), completely eliminating prefix-tree dispersion.
- **Sequential Logprob Cursor Calibration:** Standard LLM calls evaluate questions in one batch, which causes global search logprobs to cross-contaminate between questions. Jev uses a **sequential token cursor** with temperature-scaled softmax ($T = 1.4$) to compute true independent confidence.
- **Argmax Resilience Fallback:** If an OpenAI-compatible endpoint omits logprobs, Jev automatically falls back to deterministic argmax token attribution ($P = 0.85$ chosen) so semantic checks never fail.
- **Core Decision Primitives Evaluated:**
  - `beginner_friendly`: Binary noul evaluation of newcomer accessibility.
  - `scope_trap`: Detects architectural overhauls disguised as simple issues.
  - `needs_maintainer_triage`: Detects whether maintainers must resolve ambiguity before coding.
  - `quote`: Extracts a verbatim substring from the issue body as grounded proof.

### 2. System 2: Grounded Onboarding Copilot (`core/guide/guide.ts`)
Once an issue passes verification, Gemma 4 synthesizes a step-by-step contribution path:
- **Git Tree Path Verification (`filterExistingPaths`):** The LLM's suggested file citations are cross-checked live against the repository's real git tree. Any hallucinated file path is automatically dropped before the guide is presented to the user.
- **Safe Resource Protocol Enforcement (`isSafeHttpUrl`):** All external links recommended by Gemma 4 are validated to prevent `javascript:` or `data:` URL injections.

### 3. Gemma 4 Repo Scout (`core/scout/scout.ts`) & Intent Parser (`cli.ts`)
- **Intelligent Repo Scouting:** Matches developer fluency, interests, and stated fears against the curated open-source catalogue using schema-enforced JSON.
- **Natural Language CLI:** Translates free-form developer goals into structured profile constraints.

### 4. Interactive "Ask Gemma" Assistant (`app/api/guide/ask/route.ts`)
Contributors stuck on an issue can ask targeted questions ("How do I reproduce this?", "Where are the unit tests located?") and receive grounded answers attuned to the exact issue body, labels, and repository signals.

---

## 🌐 Web Application & Interactive Experience

Contributor Compass provides a clean, responsive, and developer-first web interface designed for rapid exploration and distraction-free onboarding:

```
[ Hero Landing Page (/) ] ──► [ Interactive Questionnaire ] ──► [ Verified Results & Graph (/results) ]
         │                                                                   │
         ├─► [ ★ Saved Issues Modal / Hover Tooltip ]                         ├─► [ Interactive Static Node Graph ]
         ├─► [ 🔗 Find by Link (Multi-URL + Tags) ]                          ├─► [ Attuned Issue Guide (/guide) ]
         └─► [ History Page (/history) ]                                     └─► [ 💬 Ask Gemma Assistant ]
             (Snapshots & Stale Notices)
```

1. **Dedicated Search History (`/history`):**
   - Accessible via the **History** button (crisp SVG clock icon) in the top navigation bar (between the theme toggle and "Find issues").
   - Records past discovery runs into structured snapshots with query profiles, timestamps, and candidate counts.
   - **Click-to-Expand Cards:** Inspect all verified issues captured during past runs without re-executing GitHub queries.
   - **Restore Search:** One click restores any prior search directly back into the live `/results` view.
   - **Stale State Notice:** Prominently alerts contributors that GitHub issue states evolve continuously (PR merges, maintainer assignments, closures), ensuring developers understand historical snapshot context.

2. **Hero Saved Issues Engine:**
   - Located directly on the home page hero section (`/`).
   - **Smart Tooltip:** When no issues are saved, hovering or clicking displays an informative tooltip guiding newcomers on how to bookmark issues.
   - **Instant Backdrop Modal:** When issues are saved, a badge counter lights up. Clicking opens a modal listing all bookmarked issues with direct actions to **"Get the guide ➔"**, inspect on **GitHub**, or remove bookmarks.

3. **Find by Link — Multi-Target & Custom Tags (`/verify`):**
   - Prominently styled in the top navigation and hero section for direct side-door exploration.
   - **Multi-Link Verification:** Users can dynamically click **`+ Add another link`** to input multiple repositories, issues, or organizations simultaneously. All links are evaluated concurrently with unified filters (`isPromising`, `hasNotReadyLabels`, `fitsHardConstraints`).
   - **Custom Tags & Focus Areas:** Enter custom comma-separated tags or click quick suggestions (e.g. `good first issue`, `documentation`, `python`, `bug`) to focus and prioritize issues matching specific labels, languages, or keywords.
   - **Unified Filtering & Resilient Degradation:** Applies identical quality gates across single repos, whole organizations, or specific issue numbers.

4. **Interactive Static Node Graph (`/results`):**
   - Visualizes the topology of verified issues, parent repositories, and technology tags.
   - Designed with static equilibrium to prevent distracting layout shifts, featuring click-to-pin inspection popovers with issue health indicators, readiness scores, and maintainer activity.

5. **Attuned Issue Guides & "Ask Gemma" Inline Copilot (`/guide`):**
   - Each guide provides bespoke setup instructions, verified file citations, and contribution approaches.
   - Stuck on setup? Click **"💬 Ask Gemma"** directly beside the issue title to open an interactive Q&A assistant grounded in the issue's real repository context.

6. **Pure SVG Dark / Light Mode Toggle:**
   - Seamless instantaneous theme switching with pure inline SVG icons, persisting across sessions.

7. **Personal Contribution Tracker:**
   - Mark issues as "Done / Fixed", "PR Opened", or "Merged", tracking your open-source journey in real time with an automated header badge counter.

## 🔬 How Real Signals Are Verified (No Hallucinations)

Contributor Compass doesn't guess; it extracts live data using GitHub's Core REST API:

```
Candidate Issue ──► LIVENESS CHECK ──► COMPETITION CHECK ──► JEV SEMANTIC CHECK ──► READINESS SCORE
                     • pushed_at        • pulls referencing   • Gemma 4 System-1    • 6 weighted
                     • 90d human PRs      #123 in title/body    scope trap check      dimensions
                     • bot PR exclusion
```

### Is the "Ghost Town Effect" Really Checked?
**Yes, 100% verified live in code.**
In [`core/github/signals.ts`](file:///c:/Users/niger/Documents/Contributor%20Compass/core/github/signals.ts):
1. We query `/repos/:owner/:repo/pulls?state=closed&per_page=100`.
2. We filter for `merged_at >= Date.now() - 90 days`.
3. We **strictly exclude bot accounts** (`user.type === "Bot"`, `[bot]` usernames, Dependabot, Renovate).
4. We verify `author_association` to count only genuine community outsiders (excluding core owners and members).
5. We calculate the median maintainer turnaround response time in hours.
6. In [`core/score/readiness.ts`](file:///c:/Users/niger/Documents/Contributor%20Compass/core/score/readiness.ts), the **Liveness score** directly penalizes projects with zero outside merges:
   $$\text{Liveness} = 0.5 \times e^{-\frac{\text{daysSincePushed}}{60}} + 0.5 \times \min\left(1.0, \frac{\text{mergesFromOutsiders90d}}{10}\right)$$

### Is Competition Checked?
**Yes.** We fetch open pull requests across the repository and scan titles and bodies for references matching `#<issueNumber>` or `GH-<issueNumber>`. If open competing PRs exist, the competition sub-score drops, and the UI flags the conflict.

---

## 🧪 Real Automated Test Suite (Not 'Trust Me Bro')

The test battery in [`core/**/*.test.ts`](file:///c:/Users/niger/Documents/Contributor%20Compass/package.json#L12) consists of **16 pure, deterministic unit tests** executed in ~260ms via Node's native test runner (`npm test`):

```bash
npm test
```

```
✔ isNotReadyLabel matches triage and blocker variants (1.0ms)
✔ isNotReadyLabel does NOT block question, stale, or beginner-friendly labels (0.2ms)
✔ isPromising rejects stale, crowded, or assigned issues (1.3ms)
✔ fitsHardConstraints enforces time budget, effort, and repo constraints (0.5ms)
✔ parseGitHubTarget parses issue URLs (0.8ms)
✔ parseGitHubTarget parses repository URLs and short identifiers (0.2ms)
✔ parseGitHubTarget parses organization and owner targets (0.1ms)
✔ parseGitHubTarget returns null for invalid input (0.1ms)
✔ isSafeHttpUrl allows http and https URLs (0.5ms)
✔ isSafeHttpUrl blocks javascript, data, file, and malformed URLs (0.1ms)
✔ daysSince computes positive day difference (1.0ms)
✔ tagOverlap handles language and topic matching (0.4ms)
✔ scoreCandidate produces balanced total score between 0 and 100 (0.6ms)
✔ scoreCandidate applies maintainer triage penalty when Jev flags unready issue (0.4ms)
✔ GemmaJevHarness sequential cursor separates multiple questions (1.0ms)
✔ GemmaJevHarness falls back to greedy argmax when logprobs are absent (0.1ms)

ℹ tests 16 | pass 16 | fail 0 | duration 261ms
```

### What These Tests Actually Prove:
1. **Maintainer Regex Safety:** Proves `isNotReadyLabel` matches 15+ real-world triage variants (`needs: triage`, `status: awaiting triage`, `waiting for maintainer`) without accidentally killing valid `question` or `good first issue` tags.
2. **Quality Gate Integrity:** Proves `isPromising` drops stale issues (>240d), crowded threads (>25 comments), and assigned issues.
3. **Logprob Cross-Contamination Fix:** Proves the sequential cursor isolates logits between question 1 and question 2 in `GemmaJevHarness`.
4. **XSS & Injection Defense:** Proves `isSafeHttpUrl` rejects `javascript:`, `data:`, and local file URIs.
5. **Score Penalization:** Proves that when Jev flags `NEEDS_TRIAGE` or a scope trap, the Contribution Readiness Score mathematically drops.

---

## 💻 Terminal Edition (CLI)

Open-source contributors and maintainers live in the terminal:

```bash
# Interactive natural-language prompt
npm run cli

# Targeted query
npm run cli -- "I know TypeScript and React, looking for quick bug fixes"

# Scan an entire organization
npm run cli -- --org openstreetmap

# Live-verify a single issue directly
npm run cli -- --issue https://github.com/pallets/flask/issues/5555
```

```
🧭 CONTRIBUTOR COMPASS — TERMINAL EDITION
Headline: "Verified, not listed." Good-first-issue lists go stale. We verify doable work.

Analyzing query with Gemma 4...

┌────────────────────────────────────────────────────────┐
│ PARSED DEVELOPER PROFILE                               │
├────────────────────────────────────────────────────────┤
│ Tier        : newcomer                                 │
│ Languages   : Python (3/5)                             │
│ Interests   : documentation                            │
│ Time Budget : weekend                                  │
│ Target Scope: pallets/flask                            │
└────────────────────────────────────────────────────────┘

Top Verified Candidates:

1. [pallets/flask #5555] Fix url_for endpoint parameter handling in blueprints
   Readiness: 84/100 | ✅ Ready to start
   🔍 Grounded Quote: "url_for raises BuildError when blueprint prefix is omitted"
   Evidence: Nobody is assigned yet • 0 competing PRs • Has tests • CI passing • 14 human merges in 90d
   URL: https://github.com/pallets/flask/issues/5555

Enter an issue number (1) to generate a step-by-step guide, or press [Enter] to exit:
```

---

## 🚀 Scalability: What Changes at 100x Scale?

If Contributor Compass scaled to **100,000+ daily developers across millions of GitHub repositories**, the architecture evolves from a local read-through cache to a distributed event-driven platform:

```
[GitHub Event Stream] ──► [Webhook Ingestion Worker] ──► [BullMQ / Redis] ──► [PostgreSQL + pgvector]
 (GH Archive / Firehose)   (Validates PR merges & state)   (Async Job Queue)     (Candidate Issues & Signals)
                                                                                       │
                                                                                       ▼
[User Request (CLI/Web)] ──► [Edge Route Handler] ──► [Distributed Redis] ──► [Shortlist Gemma 4 Eval]
                              (Rate-limited by IP)     (L2 Cache & Locks)      (Batch Inference Queue)
```

1. **Ingestion (Event Stream vs On-Demand Polling):**
   - *Current:* REST queries triggered when a user searches.
   - *100x Scale:* Continuous event ingestion using **GH Archive** and repository webhooks. Issues, assignments, and PR closes are streamed into PostgreSQL, completely decoupling user requests from GitHub API rate limits.
2. **Distributed Caching (Multi-Tier vs Local Disk):**
   - *Current:* Local `.cache/` directory with atomic file renames and in-memory `Map<string, Promise>` deduplication.
   - *100x Scale:* **Redis / Upstash cluster** with distributed locks (Redlock). Hot issues are served from an L1 in-memory LRU with a 99% hit rate.
3. **API Rate Limit Economics:**
   - *Current:* Personal PATs (5,000 req/hr) or unauthenticated fallback (60 req/hr).
   - *100x Scale:* Deploy as a certified **GitHub App**, granting 15,000 requests/hour per installed organization, combined with GraphQL batching to fetch 100 issues + linked PRs in a single query.
4. **LLM Inference Optimization:**
   - *Current:* On-demand Gemma 4 completion with disk-cached responses (24h TTL).
   - *100x Scale:* Tiered evaluation. Deterministic heuristics filter out 90% of issues; Gemma 4 is queued via batch worker only for the top 5 candidates per user. Pre-tokenized embeddings index repository difficulty.

---

## 🔒 Security & Privacy by Design

- **Memory-Scoped Credentials (BYOK):** User-supplied GitHub tokens and Google AI Studio keys are scoped exclusively to the active HTTP request via Node's `AsyncLocalStorage`. They are never saved to `.env`, never written to disk, and never logged.
- **SSRF Hardening:** The internal GitHub fetch client (`gh()`) strictly validates origins against `api.github.com`, rejecting local subnet or redirected URLs.
- **URL Protocol Sanitization:** Gemma-generated guide resources are validated through `isSafeHttpUrl()`, strictly permitting `http:` and `https:` schemes and blocking `javascript:` or `data:` injections.
- **Safe Session Storage:** Client-side storage parsing is wrapped in fallback guards to eliminate white-screen crashes on truncated payloads.

---

## 🛠️ Project Structure

```
core/                 # Framework-agnostic core library
├── cache/            # Read-through disk cache with in-flight deduplication
├── config/           # Environment, request-scoped credentials, tier weights
├── format/           # Plain-English verdict badges and evidence formatting
├── github/           # GitHub client, filters, issues, signals, URL target parser
├── guide/            # Grounded guide builder & safe URL validator
├── llm/              # Gemma 4 adapter & SHA1 completion cache
├── profile/          # Profile schemas and defaults
├── registry/         # Curated catalogue of active open-source repositories
├── score/            # Contribution Readiness Score calculation engine
├── verify/           # Evidence verifier, Jev harness, and single-issue verifier
app/                  # Next.js App Router (UI & Route Handlers)
├── components/       # UI Components (SiteHeader, ScopeForm, HeroSavedButton, NodeGraph, etc.)
├── history/          # Dedicated Search History page with stale-state warnings
├── results/          # Verified issue rankings & interactive topology graph
├── guide/            # Step-by-step issue guide & inline Ask Gemma Q&A
├── settings/         # BYOK credentials configuration
├── verify/           # Live direct issue/repo URL verifier
├── api/              # Route handlers (find, scout, verify, guide, ask)
cli.ts                # Contributor Compass Terminal Edition
scripts/              # Prefetch cache warmer & Jev evaluation benchmarks
```

---

## 📜 License

Licensed under the **Apache License, Version 2.0** (the "License"). You may obtain a copy of the License in the [`LICENSE`](file:///c:/Users/niger/Documents/Contributor%20Compass/LICENSE) file or at:

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License. Built with ❤️ for open-source newcomers and maintainers everywhere.
