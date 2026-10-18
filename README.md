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
3. It **verifies** each one: still open? unassigned? already contested by an open PR?
   does the repo have setup docs, CI, and a history of merging outsider contributions?
4. It scores each issue with a **Contribution Readiness Score** and explains the evidence.
5. It generates a grounded **getting-started guide** for the issue you pick.

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

Keys are stored in your browser and sent only to this app's server for the duration of
a request. Nothing is written to disk. Server-side `.env` values still work and act as
defaults, so a developer can run entirely from `.env` if they prefer.

To make the demo deterministic (recommended on stage):

```bash
npm run prefetch          # warm the cache for the demo scenarios
# then set COMPASS_OFFLINE=1 in .env and restart
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
| `/verify` | Side door: paste any issue URL | — |
| `/settings` | Bring-your-own-key setup + connection test | — |
| `POST /api/match` | Profile → scouted repos → ranked candidates | yes (scout) |
| `POST /api/guide` | Repo + issue + profile → guide | yes |
| `POST /api/verify` | Issue URL → verified verdict | — |
| `POST /api/scope/questions` | Question bank for a tier | — |
| `GET /api/health` | Env, cache and optional credential probe | — |

**Ranking itself is deliberately LLM-free.** It is deterministic, explainable, and cannot
be taken down by a model timeout. Gemma is used where it adds something a formula cannot:
choosing which repositories to search, and writing the guide.

---

## Architecture

```
Profile → REPO SCOUT → CORE REST ISSUES → VERIFY & SCORE → Rank → Explain → Guide
          (Gemma or          (5,000 req/hr,
           registry)          not 30/min)
```

**Two-stage discovery.** Blind keyword search hits GitHub's Search API limit (30 req/min)
and returns abandoned forks. Instead:

1. **Repo Scout** picks 3–5 reputable repositories from a curated registry, using Gemma
   when a key is present and tag/language overlap as a deterministic fallback.
2. **Core REST** lists those repos' open issues — 160× the throughput of Search.
3. Every candidate is still verified live: unassigned, uncontested, and in a repo with
   setup docs, CI, and a history of merging outsider PRs.

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
- **No jargon** — score cards show plain evidence ("unassigned, no competing PR, CONTRIBUTING.md present")

The experienced tier swaps to a 4-field quick form, 10 ranked results, and full numeric breakdowns.

**Demo beat:** flip the tier toggle → same candidate pool re-ranks. Large-effort issues drop for newcomers, rise for experienced.

---

## Extending it

The rubric rewards adaptability, so the extension points are real:

- **Swap the model** — change the model or base URL in `/settings` (or `LLM_MODEL` /
  `LLM_BASE_URL` in `.env`). AI Studio, OpenRouter and Ollama all speak the same
  OpenAI-compatible protocol. No code changes.
- **Add a repository** — append one entry to `core/registry/repos.ts`. The Scout can then
  choose it, and live verification decides whether it is actually healthy.
- **Replace the Scout** — `core/scout/scout.ts` has one contract: `Profile → ScoutResult`.
  Swap in embeddings, a learned ranker, or a remote service.
- **Add a signal** — add a fetch in `core/github/signals.ts` and expose it on
  `RepoSignals`. Scoring picks it up through the tier weights.
- **Add a tier** — add one entry to `TIERS` in `core/config/tiers.ts`.
- **Change retrieval** — `core/github/issues.ts` is the only place that knows how issues are
  fetched. Swap it for GH Archive or a code index at scale.

---

## Scale story

- Signals are cached with a TTL → index once, serve many.
- The pipeline is stateless → horizontal scale.
- Retrieval sits behind one module → swap the source, add a queue, keep the rest.

See `PLAN.md` for the full design, scoring formulas, schedule and demo script.
