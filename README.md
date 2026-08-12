# τροφή (Trophē)

**Precision Nutrition Coaching Platform** — AI-assisted nutrition coaching for professional nutritionists and their clients. One habit. Two weeks. Transform.

Production: [trophe.app](https://trophe.app)

Canonical repo path: `/Volumes/SSD/work/forge-projects/trophe`

Production readiness as of 2026-06-15:
- Supabase project/ref: `iwbpzwmidzvpiofnqexd`
- Branch policy: `main` is the production branch. CI runs on `main`. Vercel git-integration auto-deploys `main` to production (https://trophe.app).
- AI auth: async `guardAiRoute()` verifies bearer tokens with Supabase and returns the verified `userId`.
- Cost/observability: `agent_runs` is canonical; `api_usage_log` is legacy compatibility only.
- Verification sequence: `npm run typecheck && npm run lint && npm test && npm run readiness && npm run evals && npm run build && npm run test:e2e && npm run canary:prod`.

## What it is

A three-tier product:
1. **Coach Tool** (current focus) — SaaS for nutritionists managing 10-50+ clients. Habit-based methodology, AI-powered food tracking, coach analytics.
2. **Self-service tracker** (planned) — Consumer app for individuals without a coach.
3. **B2B platform** (pilot-ready core) — Multi-tenant gyms and clinics with org admin, role gates, and billing metadata. External paid controls remain launch-gating.

Partnership with Michael Kavdas (Greek nutritionist, PN L1 certified, COO Athletikapp). Testing phase Apr 16-18, 2026 with 5 users.

## Stack

- Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 · Framer Motion
- Supabase (Postgres + Auth + RLS + Realtime + Storage)
- Three-lane AI routing: **GPT-5.6 Luna → Claude Haiku 4.5** for consumer text,
  **Haiku 4.5** for health context and vision, and **DeepSeek V4 Flash** for
  synthetic factory generation only. Voyage-4 provides embeddings (1024-dim).
- Food DB: **~42,950 foods** across USDA/FNDDS (US), CIQUAL (FR), CoFID (UK/EU),
  BEDCA (ES), CREA (IT), OpenFoodFacts (GR/DE/NL barcoded products) + curated
  Greek/Colombian dishes. Benchmark (verified 2026-06-14, median-of-3 vs prod):
  official v2 (210 cases) **94.3% pass**; backup v3 (700 cases, Greek-weighted)
  **76.7% pass / 16.0% pooled macro-MAPE** (fat is the hardest macro at ~25%),
  after the 2026-06-14 deterministic MAPE reduction. The validated 549-case subset
  still holds ~90%. Note: ~16% is the **deterministic floor** — sub-10% MAPE is not
  reachable by prompt/retrieval tweaks (needs Michael-Kavdas-validated Greek ranges +
  fine-tuning). See `docs/benchmark/methodology.md`.
- MediaPipe Pose (browser AI Form Check)
- Vitest + Playwright + GitHub Actions CI (eval gates ≥95%)
- UI languages: **EN / ES / EL / FR / DE / IT / PT / NL** (8 languages — EN/ES/EL
  inline dictionaries, rest overlay locales in `lib/locales/` with EN fallback)

## Key features (current)

- **Food logging**: text, photo, voice, paste, manual — with practical portion choices, editable amounts, and nutrition-label-aware parsing
- **Recipe analyzer** (new): paste a recipe → AI extracts ingredients + totals + per-serving → log N servings
- **Habit engine**: 14-day cycles, one habit at a time, coach-assigned + auto-progression
- **Coach module (June 2026)**: weekly meal-plan grid (desktop week view + mobile day tabs),
  realtime coach↔client messaging with unread inbox, intake questionnaire (12-question
  interview set), daily lifestyle check-ins, assessment + custom goals, derived calorie
  targets, color-coded coach notes pinned on the client dashboard
- **Workout module**: 113 exercises, custom exercise modal, PR detection, AI Form Check
- **Coach dashboard**: 52 components across 5 waves (pulse cards, risk heatmap, client detail, smart coaching, workflow)
- **Nutrition engine**: evidence-based (Mifflin-St Jeor BMR, ISSN macros, 35ml/kg water)
- **Light + dark theme**: full CSS variable system, no-flash inline script
- **Security headers**: explicit-domain CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy

## Getting started

Prerequisites: Node 20+ and OrbStack or another Docker-compatible runtime.

```bash
git clone git@github.com:zsoist/trophe.git
cd trophe
npm install
npm run dev:local
# http://localhost:3000
```

`dev:local` starts/bootstrap-checks the local Supabase stack, derives its URL and
Auth keys in memory, launches the app, and disables every paid AI provider. Local
signup confirmation emails appear in Mailpit at
[http://127.0.0.1:54324](http://127.0.0.1:54324). Use
`TROPHE_LOCAL_PORT=3300 npm run dev:local` if port 3000 is occupied.
With the app running, `npm run test:e2e:local-signup` verifies signup, Mailpit
delivery, confirmation, login, replay safety, and cleanup in one command.

For hosted development or deployment, copy `.env.local.example` to `.env.local`
and configure the environment-specific values described in `DEPLOYMENT.md`.

## Scripts

```bash
npm run dev           # dev server
npm run dev:local     # zero-cost local stack + app; no manual Supabase keys
npm run build         # production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest run (unit tests)
npm run test:watch    # vitest watch mode
npm run test:coverage # vitest + coverage report
npm run test:e2e:local-signup # local signup → email → confirmation → login
npm run db:doctor     # OrbStack/Docker/Supabase readiness
npm run db:local:start
npm run db:bootstrap  # canonical local DB bootstrap (Supabase local + Drizzle)
npm run db:verify     # schema / RLS inventory checks
npm run db:explain    # capture explain plans to artifacts/db/
npm run canary:prod   # read-only production canary for trophe.app
```

## Truth table

| Concern | Canonical source |
|---|---|
| Schema source of truth | `drizzle/*.sql` migrations |
| Local DB source of truth | Supabase CLI local stack on `127.0.0.1:54322` |
| Auth/RLS local test model | Supabase-style `auth.uid()` + `authenticated` role |
| CI DB model | pgvector Postgres service + same compatibility bootstrap |
| Legacy bridge | `open_brain_postgres` is temporary only and not the documented target path |

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system map, data model, LLM pattern, invariants
- [`SPEC.md`](./SPEC.md) — product spec, user flows, Kavdas vision, success criteria
- [`ROADMAP.md`](./ROADMAP.md) — day-by-day progress, current phase, deferred items
- [`BUSINESS.md`](./BUSINESS.md) — business model, pricing, three-tier strategy
- [`CHANGELOG.md`](./CHANGELOG.md) — per-commit log of shipped work
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — env vars, Vercel + Supabase setup, rollback
- [`SECURITY.md`](./SECURITY.md) — threat model, controls, RLS policies
- [`RUNBOOK.md`](./RUNBOOK.md) — on-call playbooks (auth broken, LLM 429, data loss, etc.)
- [`CLAUDE.md`](./CLAUDE.md) — project rules + pitfalls (for humans and AI agents)
- [`agents/README.md`](./agents/README.md) — `/agents/` folder pattern and conventions
- [`docs/archive/monday-prep/`](./docs/archive/monday-prep/) — April 20, 2026 partnership meeting prep (retro, agenda, positioning, partnership options, cut decision)

## Contributing

- Branch from `main`; CI and the production canary must be green before production changes.
- Follow the coding style in `CLAUDE.md`. Mobile-first (390×844).
- No new `bg-stone-9xx` on themed pages — use CSS variables or `.glass` utility classes (ESLint enforces).
- Add a test in `tests/` for any new `lib/` business logic.
- Bump `CHANGELOG.md` for user-visible changes.

## License

Private. All rights reserved.
