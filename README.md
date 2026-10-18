# 🧭 Contributor Compass

> **"Verified, not listed."**  
> Existing discovery tools hand developers a static list of `good first issue` tags. **Contributor Compass** transforms a developer's skills and goals into a **live-verified, ready-to-work path into open source** — with checkable evidence for every claim.

[![Gemma 4](https://img.shields.io/badge/Gemma%204-Google%20AI%20Studio-8E75B2?style=flat-square&logo=google)](https://aistudio.google.com/)
[![Jev System-1](https://img.shields.io/badge/Decision%20Harness-Jev%20System--1-4285F4?style=flat-square)](core/verify/jev.ts)
[![Open Source Guide](https://img.shields.io/badge/Open%20Source-Grounded%20Onboarding-34A853?style=flat-square)](core/guide/guide.ts)
[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-2026-FF7518?style=flat-square)](https://hacktoberfest.com/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![BYOK Privacy](https://img.shields.io/badge/BYOK%20Privacy-Zero%20Required%20Keys-00C853?style=flat-square)](.env.example)

---

## ⚡ Quickstart (Zero Configuration Required)

Contributor Compass runs **completely out-of-the-box**. No database to install, no Docker containers to spin up, and no mandatory API keys required to test the core pipeline, automated unit tests, or CLI.

```bash
# 1. Install dependencies
npm install

# 2. Run the automated test suite (17 tests, pure deterministic assertions)
npm test

# 3. Launch the Web Application (GUI / localhost)
npm run dev
# -> Open your browser at http://localhost:3000

# 4. (Optional) Run the production build locally
npm run build
npm start
# -> Open your browser at http://localhost:3000

# 5. Launch the Terminal Edition (CLI)
npm run cli

# Or pass a natural-language query directly:
npm run cli -- "I know Python and docs, looking for starter issues in pallets/flask"

# Or configure your API keys for the CLI:
npm run cli -- --keys
```

### 🌐 Running the Web Application (Localhost GUI)

To run Contributor Compass locally in your browser:

1. **Start the development server:**
   ```bash
   npm run dev
   ```
2. **Open the application:** Navigate to [**`http://localhost:3000`**](http://localhost:3000) in your web browser.
3. **What's included out of the box:**
   - **Interactive PR Scope Form (`/`):** Choose your experience tier (Newcomer vs. Experienced), stack, and interests to generate your personalized open-source plan.
   - **Find by Link (`/verify`):** Paste single or multiple GitHub links (issues, repositories, or entire organizations) with optional custom focus tags to verify feasibility before you write code.
   - **Interactive Topology Node Graph (`/results`):** Inspect relationships between repos, issues, and tech stacks in a stable, static layout with click-to-pin popovers.
   - **Grounded Contribution Guides (`/guide`):** Step-by-step contribution plans featuring file citations cross-checked against the real Git tree.
   - **Ask Gemma Assistant (`/guide`):** Ask targeted questions about any issue ("How do I set up tests?", "Where is this defined?") answered by Gemma using grounded repository signals.
   - **Search History & Saved Bookmarks (`/history`):** Review prior searches, inspect snapshots, and access saved issues across browser sessions.
   - **Dark / Light Mode Toggle:** Pure SVG theme switcher in the top bar.
   - **Bring Your Own Key (`/settings`):** Securely enter a Google AI Studio Gemma API Key and GitHub Token stored solely in browser `localStorage` and sent request-scoped.

> **Optional Bring-Your-Own-Key (BYOK):**  
> To test live Gemma 4 semantic checks and AI guide generation, enter your [Google AI Studio API Key](https://aistudio.google.com/apikey) and GitHub Token in **`/settings`** (Web UI) or add them to `.env` / CLI via `npm run cli -- --keys`. In the Web UI, keys are stored in the browser's `localStorage` and transmitted per-request via headers; the Node.js server scopes them strictly to that request via `AsyncLocalStorage` and never persists them to server disks, databases, or logs.

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
  │ • Output: Advisory triage checks│                             │   hallucinated files            │
  └─────────────────────────────────┘                             └─────────────────────────────────┘
```

### 1. System 1: The Gemma 4 Jev Decision Harness (`core/verify/jev.ts`)
In open-source triage, evaluations must be **deterministic, reproducible, and free of conversational drift**. We implemented a structured **System-1 decision harness** over hosted Gemma 4 (`gemma-4-31b-it`):
- **Thinking Suppression & Greedy Decoding:** Temperature is locked to `0.0` with rigid single-letter JSON constraints (`{"q1": "A", "q2": "B"}`) to prevent conversational drift.
- **Single-Token ASCII Mapping:** Evaluation criteria map to single ASCII tokens (`A`, `B`, `C`...), eliminating multi-token prefix dispersion.
- **Sequential Token Cursor:** Isolates evaluation steps across multiple questions to prevent cross-question attribution bleed.
- **Advisory Decision Output:** When hosted endpoints omit token logprobs, the harness attributes greedy argmax token selection ($P = 0.85$ baseline). These scores serve as **advisory triage signals** (heuristics) rather than empirical statistical probabilities.
- **Core Decision Primitives Evaluated:**
  - `beginner_friendly`: Binary noul evaluation of newcomer accessibility.
  - `scope_trap`: Detects architectural overhauls disguised as simple issues.
  - `needs_maintainer_triage`: Detects whether maintainers must resolve ambiguity before coding.
  - `quote`: Extracts a verbatim substring from the issue body as checkable proof.

### 2. System 2: Grounded Onboarding Copilot (`core/guide/guide.ts`)
Once an issue passes verification, Gemma 4 synthesizes a step-by-step contribution path:
- **Git Tree Path Verification (`filterExistingPaths`):** File citations suggested by the LLM are checked against the repository's real git tree (`core/github/signals.ts`). Any non-existent file path is dropped before the guide is displayed.
- **Safe Resource Protocol Enforcement (`isSafeHttpUrl`):** All external links recommended by Gemma 4 are validated to allow only `http:` and `https:`, blocking `javascript:` or `data:` injections.

### 3. Gemma 4 Repo Scout (`core/scout/scout.ts`) & Bounded Discovery (`core/github/org.ts`)
- **Intelligent Repo Scouting:** Matches developer fluency, interests, and stated fears against the curated open-source catalogue using schema-enforced JSON.
- **Budgeted Organization Scan:** Evaluates up to 100 recently active public repositories in an organization, selects up to 5 candidate repos matching the developer's stack, and inspects verified starter issues.
- **Natural Language CLI (`cli.ts`):** Translates free-form developer goals into structured profile constraints.

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

3. **Find by Link — Multi-Target & Semantic Tags (`/verify`):**
   - Prominently styled in the top navigation and hero section for direct side-door exploration.
   - **Multi-Link Verification:** Users can dynamically click the inline **`+`** button beside any link input row to evaluate multiple repositories, issues, or organizations simultaneously (with a clean, silent 50-character limit per entry). All links are evaluated concurrently with unified filters (`isPromising`, `hasNotReadyLabels`, `fitsHardConstraints`).
   - **Semantic Custom Tags & Focus Areas:** Enter custom comma-separated tags or click quick suggestions (e.g. `astronomy`, `game dev`, `security`, `documentation`, `python`) to focus and prioritize issues. When configured, Gemma semantically associates domain terms (e.g., astrophysics/FITS to astronomy; shaders/engines to game dev) with graceful fallback to keyword matching.
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

## 🔬 Ground-Truth Verification & Deterministic Signals

Contributor Compass does not rely on subjective label claims alone; it cross-references candidate issues against GitHub's Core REST API and repository Git trees:

```
Candidate Issue ──► LIVENESS CHECK ──► COMPETITION CHECK ──► JEV ADVISORY CHECK ──► READINESS SCORE
                     • pushed_at        • pulls referencing   • Gemma 4 System-1    • 6 weighted
                     • 90d human PRs      #123 in title/body    scope trap heuristic  dimensions
                     • bot PR exclusion
```

### Is the "Ghost Town Effect" Really Checked?
**Yes, verified directly against GitHub's closed PR history.**
In [`core/github/signals.ts`](core/github/signals.ts):
1. We query `/repos/:owner/:repo/pulls?state=closed&per_page=100`.
2. We filter for `merged_at >= Date.now() - 90 days`.
3. We **strictly exclude bot accounts** (`user.type === "Bot"`, `[bot]` usernames, Dependabot, Renovate).
4. We verify `author_association` to count only genuine community outsiders (excluding core repository owners and members).
5. We calculate the median maintainer turnaround response time in hours.
6. In [`core/score/readiness.ts`](core/score/readiness.ts), the **Liveness score** directly penalizes projects with zero outside merges:
   $$\text{Liveness} = 0.5 \times e^{-\frac{\text{daysSincePushed}}{60}} + 0.5 \times \min\left(1.0, \frac{\text{mergesFromOutsiders90d}}{10}\right)$$

### Is Competition Checked?
**Yes.** In [`core/github/issues.ts`](core/github/issues.ts), we fetch open pull requests across the repository and scan titles and bodies for references matching `#<issueNumber>`, `GH-<issueNumber>`, or `owner/repo#<issueNumber>`. If open competing PRs exist, the competition sub-score drops, and the UI flags the conflict.

---

## 🧪 Automated Unit Test Suite

The test battery in [`core/**/*.test.ts`](package.json) consists of **17 deterministic unit tests** executed via Node's native test runner (`npm test`):

```bash
npm test
```

```
✔ isNotReadyLabel matches triage and blocker variants
✔ isNotReadyLabel does NOT block question, stale, or beginner-friendly labels
✔ isPromising rejects stale, crowded, or assigned issues
✔ fitsHardConstraints enforces time budget, effort, and repo constraints
✔ countPRsReferencing identifies exact issue references and variants
✔ parseGitHubTarget parses issue URLs
✔ parseGitHubTarget parses repository URLs and short identifiers
✔ parseGitHubTarget parses organization and owner targets
✔ parseGitHubTarget returns null for invalid input
✔ isSafeHttpUrl allows http and https URLs
✔ isSafeHttpUrl blocks javascript, data, file, and malformed URLs
✔ daysSince computes positive day difference
✔ tagOverlap handles language and topic matching
✔ scoreCandidate produces balanced total score between 0 and 100
✔ scoreCandidate applies maintainer triage penalty when Jev flags unready issue
✔ GemmaJevHarness sequential cursor separates multiple questions
✔ GemmaJevHarness falls back to greedy argmax when logprobs are absent

ℹ tests 17 | pass 17 | fail 0
```

### What These Tests Actually Prove:
1. **Maintainer Regex Safety:** Proves `isNotReadyLabel` matches 15+ real-world triage variants (`needs: triage`, `status: awaiting triage`, `waiting for maintainer`) without accidentally killing valid `question` or `good first issue` tags.
2. **Quality Gate Integrity:** Proves `isPromising` drops stale issues (>240d), crowded threads (>25 comments), and assigned issues.
3. **PR Reference Extraction:** Proves `countPRsReferencing` captures exact references (`#123`, `GH-123`, `owner/repo#123`) without falsely matching `#1234`.
4. **Logprob Cross-Contamination Guard:** Proves the sequential cursor isolates attribution steps between question 1 and question 2 in `GemmaJevHarness`.
5. **XSS & Injection Defense:** Proves `isSafeHttpUrl` rejects `javascript:`, `data:`, and local file URIs.
6. **Score Penalization:** Proves that when Jev flags `NEEDS_TRIAGE` or a scope trap, the Contribution Readiness Score mathematically drops.

---

## 💻 Terminal Edition (CLI)

Open-source contributors and maintainers live in the terminal:

```bash
# 1. Interactive questionnaire (or type "I am a beginner" / "I am experienced")
npm run cli

# 2. View full CLI reference and options
npm run cli -- --help

# 3. Configure Bring-Your-Own-Key credentials interactively
npm run cli -- --keys

# 4. One-shot natural language search
npm run cli -- "I know TypeScript and React, looking for quick bug fixes"

# 5. Budgeted discovery across an organization
npm run cli -- --org openstreetmap

# 6. Live-verify a single issue directly
npm run cli -- --issue pallets/flask#5555
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

## 🚀 Scalability: Planned 100x Growth Architecture (Proposed)

*The current release is an in-process system with disk caching and in-flight deduplication. Below is the proposed design for scaling to 100,000+ daily developers across millions of GitHub repositories:*

```
[GitHub Event Stream] ──► [Webhook Ingestion Worker] ──► [BullMQ / Redis] ──► [PostgreSQL + pgvector]
 (GH Archive / Firehose)   (Validates PR merges & state)   (Async Job Queue)     (Candidate Issues & Signals)
                                                                                       │
                                                                                       ▼
[User Request (CLI/Web)] ──► [Edge Route Handler] ──► [Distributed Redis] ──► [Shortlist Gemma 4 Eval]
                              (Rate-limited by IP)     (L2 Cache & Locks)      (Batch Inference Queue)
```

1. **Ingestion (Event Stream vs On-Demand Polling):**
   - *Current Implementation:* Live REST queries triggered on-demand when a user initiates discovery.
   - *100x Scale Plan:* Continuous event ingestion using **GH Archive** and repository webhooks. Issues, assignments, and PR closes are streamed into PostgreSQL, completely decoupling user requests from GitHub API rate limits.
2. **Distributed Caching (Multi-Tier vs Local Disk):**
   - *Current Implementation:* Local `.cache/` directory with atomic file writes and in-memory `Map<string, Promise>` deduplication.
   - *100x Scale Plan:* **Redis / Upstash cluster** with distributed locks (Redlock). Hot issues are served from an L1 in-memory LRU with a 99% hit rate.
3. **API Rate Limit Economics:**
   - *Current Implementation:* User-provided personal access tokens (5,000 req/hr) or unauthenticated fallback (60 req/hr).
   - *100x Scale Plan:* Deploy as a certified **GitHub App**, granting 15,000 requests/hour per installed organization, combined with GraphQL batching to fetch 100 issues + linked PRs in a single query.
4. **LLM Inference Optimization:**
   - *Current Implementation:* On-demand Gemma 4 completion with disk-cached responses (24h TTL) restricted to top 3 candidates.
   - *100x Scale Plan:* Tiered evaluation. Deterministic heuristics filter out 90% of issues; Gemma 4 is queued via batch worker only for the top 5 candidates per user. Pre-tokenized embeddings index repository difficulty.

---

## 🔒 Security & Privacy by Design

- **Client-Side Storage & Request-Scoped Processing (BYOK):** Keys entered in the Web UI are stored exclusively in the browser's `localStorage` and sent per-request in HTTP headers. The backend uses `AsyncLocalStorage` to scope credentials strictly to that single active request; they are never written to server disk, databases, or logs. CLI runs optionally read local `.env` files.
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

Licensed under the **Apache License, Version 2.0** (the "License"). You may obtain a copy of the License in the [`LICENSE`](LICENSE) file or at:

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License. Built with ❤️ for open-source newcomers and maintainers everywhere.
