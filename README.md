# τροφή (Trophē)

**Precision Nutrition Coaching Platform** — AI-assisted nutrition coaching for professional nutritionists and their clients. One habit. Two weeks. Transform.

Production: [trophe.app](https://trophe.app)

Canonical repo path: `/Volumes/SSD/work/forge-projects/trophe`

Production readiness as of 2026-05-03:
- Supabase project/ref: `iwbpzwmidzvpiofnqexd`
- Branch policy: `main` is the production branch. CI runs on `main`, and Vercel auto-deploys production from `main`.
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
- Supabase (Postgres + Auth + RLS + Storage)
- Anthropic Claude Haiku 4.5 (food-parse, recipe-analyze, photo)
- Anthropic Claude Haiku 4.5 (meal suggestions), Sonnet 4.5 (coach insights/memory), Gemini 2.5 Flash (food parse)
- MediaPipe Pose (browser AI Form Check)
- Vitest + GitHub Actions CI
- Trilingual UI: EN / ES / EL

## Key features (current)

- **Food logging**: text, photo, voice, paste, manual — AI parses into structured entries with macros
- **Recipe analyzer** (new): paste a recipe → AI extracts ingredients + totals + per-serving → log N servings
- **Habit engine**: 14-day cycles, one habit at a time, coach-assigned + auto-progression
- **Workout module**: 113 exercises, custom exercise modal, PR detection, AI Form Check
- **Coach dashboard**: 52 components across 5 waves (pulse cards, risk heatmap, client detail, smart coaching, workflow)
- **Nutrition engine**: evidence-based (Mifflin-St Jeor BMR, ISSN macros, 35ml/kg water)
- **Light + dark theme**: full CSS variable system, no-flash inline script
- **Security headers**: explicit-domain CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy

## Getting started

Prerequisites: Node 20+, OrbStack or another Docker-compatible runtime, and a Supabase project for hosted env vars.

```bash
git clone git@github.com:zsoist/trophe.git
cd trophe
npm install
cp .env.local.example .env.local
# Fill in the 5 required env vars (see DEPLOYMENT.md)
npm run db:bootstrap
npm run dev
# http://localhost:3000
```

## Scripts

```bash
npm run dev           # dev server
npm run build         # production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest run (unit tests)
npm run test:watch    # vitest watch mode
npm run test:coverage # vitest + coverage report
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
- [`docs/monday-prep/`](./docs/monday-prep/) — April 20, 2026 partnership meeting prep (retro, agenda, positioning, partnership options, cut decision)

## Contributing

- Branch from `main`; CI and the production canary must be green before production changes.
- Follow the coding style in `CLAUDE.md`. Mobile-first (390×844).
- No new `bg-stone-9xx` on themed pages — use CSS variables or `.glass` utility classes (ESLint enforces).
- Add a test in `tests/` for any new `lib/` business logic.
- Bump `CHANGELOG.md` for user-visible changes.

## License

Private. All rights reserved.
