# Contributor Compass

**The category exists. Nobody verifies.**

Discovery tools hand you a static list of "good first issues." Contributor Compass
turns a developer's skills and goals into a **verified, ready-to-work path into open
source** — and shows its evidence.

Built for Hacktoberfest Hack Day (BMSCE IEEE Computer Society).

- Theme 1 — Use AI to Build Developer Tools
- Theme 2 — AI for Open Innovation

---

## What it does

1. You say who you are — or just "I'm a complete beginner" / "I want merges".
2. It retrieves candidate issues from GitHub.
3. It checks issue state and assignment, checks for linked open PRs where available,
   and collects repository setup, CI, and contribution-history signals.
4. It scores each issue with a **Contribution Readiness Score** and explains the evidence.
5. It generates a getting-started guide using the issue and repository file tree. File paths
   are checked against that tree; file contents and line-level citations are not currently read.

The novelty is step 3. Most tools stop at step 2.

---

## Quick start

```bash
npm install
npm run dev               # http://localhost:3000
```

Open **`/settings`** and paste:

- a **Gemma API key** from [Google AI Studio](https://aistudio.google.com/apikey)
- a **GitHub token** (public read access is enough) — *optional; without it you get 60 req/hr instead of 5,000*

Keys are stored in your browser and sent to this app's server for the duration of
a request. The model endpoint is controlled by server configuration (`LLM_BASE_URL`);
the browser cannot redirect requests to an arbitrary host. Server `.env` values remain
available as defaults.

To make the demo deterministic (recommended on stage):

```bash
npm run prefetch          # warm the cache for the demo scenarios
# then set COMPASS_OFFLINE=1 in .env and restart; network and model calls are disabled
```

### How credentials flow

```
browser localStorage ──headers──► route handler ──► AsyncLocalStorage ──► core/
       x-compass-llm-key                              request-scoped        env.llmApiKey()
       x-compass-github-token                                               env.githubToken()
```

`core/config/env.ts` checks the request-scoped values first, then `.env`. That is why
`core/` needed no signature changes to support bring-your-own-key.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` over `core/` and `app/` |
| `npm run prefetch` | Warm the cache for demo scenarios |

### Routes

| Route | Purpose | Uses Gemma |
|---|---|---|
| `/` | Scope form, tier toggle | — |
| `/results` | Ranked, verified candidates | — |
| `/guide` | Getting-started path for a chosen issue | yes |
| `/verify` | Side door: paste any issue URL | yes (semantic check, when configured) |
| `/settings` | Bring-your-own-key setup + connection test | — |
| `POST /api/match` | Profile → curated + live-search repos → ranked candidates | yes (scout + shortlist check) |
| `POST /api/guide` | Repo + issue + profile → guide | yes |
| `POST /api/verify` | Issue URL → verified verdict | — |
| `POST /api/scope/questions` | Question bank for a tier | — |
| `GET /api/health` | Env, cache and optional credential probe | — |

Ranking is deterministic and explainable. When configured, Gemma's Jev check is run on a
bounded shortlist and contributes an advisory issue-quality signal; failures fall back to
the structural score. Gemma also chooses within the curated catalogue and writes the guide.

---

## Architecture

```
Profile → REPO SCOUT → CORE REST ISSUES → VERIFY & SCORE → Rank → Explain → Guide
          (Gemma/registry       (Core API plus
           plus search)         at most 2 search queries)
```

**Hybrid discovery.** GitHub Search can find issues outside the curated list, but its
stricter quota means discovery stays bounded and supplemental:

1. **Repo Scout** picks up to five repositories from a curated registry, using Gemma
   when a key is present and tag/language overlap as a deterministic fallback.
2. Two cached profile queries can add up to three new repositories from live issue results.
   If Search is rate-limited or unavailable, the registry path still runs.
3. **Core REST** fetches a bounded sample for curated repositories; Search results already
   include the issue record and need repository enrichment.
4. Candidates are checked for open/unassigned state and repository signals. Linked PR
   checks are best-effort: if unavailable, the result explicitly reports unknown status.

This is broader than the registry but not exhaustive GitHub coverage. Search is capped at
two queries and 30 issues per query, and the app has no continuously refreshed global
inventory. Dependable broad coverage needs scheduled ingestion and a shared index.

One pipeline, two front doors. Tier 1 (newcomer) and Tier 2 (experienced) differ
only in how much profile is collected and how much guidance is generated. The
retrieval, verification, scoring and ranking stages are shared.

```
core/                 framework-agnostic; reusable by a future CLI
├─ config/            env access, request-scoped BYOK, tier configuration
├─ profile/           profile schema (zod)
├─ questions/         the scope question bank
├─ registry/          curated repository catalogue (a prior, never trusted as truth)
├─ scout/             Repo Scout: Gemma selection + deterministic fallback
├─ github/            client, Core REST issues, signals
├─ cache/             file-based cache with TTL
├─ score/             readiness scoring
├─ rank/              tier-weighted ranking
├─ verify/            evidence verification
├─ llm/               provider-agnostic adapter
├─ explain/           "why this fits you"
├─ guide/             getting-started guide
└─ pipeline.ts        the orchestrator

app/                  Next.js App Router UI + API routes
scripts/prefetch.ts   warms the demo cache
```

---

## The Contribution Readiness Score

Six sub-scores, each normalised to `[0,1]`, combined by tier weights into 0–100:

| Sub-score | Question it answers |
|---|---|
| **fit** | Does this match my stack and interests? |
| **accessibility** | Can I actually run this project? |
| **liveness** | Will anyone merge my PR? |
| **issueQuality** | Is this issue genuinely doable? |
| **competition** | Am I already too late? |
| **setupCost** | How heavy is the setup? |

Every sub-score carries **evidence with provenance**. If a claim can't be traced
back to something we fetched, it doesn't get shown.

---

## Newcomer-first UX

The newcomer tier is designed for someone who has never opened a PR:

- **Interests optional** — pick from the list or choose "Not sure — open to anything"
- **"What's the scariest part?"** — an extra question that lets us avoid your blockers (setup, codebase, review, not sure)
- **3 results + "Start here"** — one explicit pick with a plain-language verdict badge
- **No jargon** — score cards show plain evidence and identify checks whose status is unknown

The experienced tier swaps to a 4-field quick form, 10 ranked results, and full numeric breakdowns.

**Demo beat:** flip the tier toggle → same candidate pool re-ranks. Large-effort issues drop for newcomers, rise for experienced.

---

## Extending it

The rubric rewards adaptability, so the extension points are real:

- **Configure the model** — set the server-side `LLM_MODEL` and `LLM_BASE_URL` values.
  The endpoint is intentionally not user-controlled from the browser.
- **Add a repository** — append one entry to `core/registry/repos.ts`. The Scout can then
  choose it, and live verification decides whether it is actually healthy.
- **Replace the Scout** — `core/scout/scout.ts` has one contract: `Profile → ScoutResult`.
  A future implementation can query a maintained inventory or a remote discovery service.
- **Add a signal** — add a fetch in `core/github/signals.ts` and expose it on
  `RepoSignals`. Scoring picks it up through the tier weights.
- **Add a tier** — add one entry to `TIERS` in `core/config/tiers.ts`.
- **Change retrieval** — `core/github/issues.ts` is the only place that knows how issues are
  fetched. Swap it for GH Archive or a code index at scale.

---

## Scale story

- The current file cache is suitable for a single instance and a demo.
- Production scale requires a shared database/cache and queued, scheduled discovery;
  the current pipeline does not search all GitHub.

See `PLAN.md` for the full design, scoring formulas, schedule and demo script.
