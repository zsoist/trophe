# τροφή (Trophē)

**Precision Nutrition Coaching Platform** — AI-assisted nutrition coaching for professional nutritionists and their clients. One habit. Two weeks. Transform.

Production: [trophe-mu.vercel.app](https://trophe-mu.vercel.app)

## What it is

A three-tier product:
1. **Coach Tool** (current focus) — SaaS for nutritionists managing 10-50+ clients. Habit-based methodology, AI-powered food tracking, coach analytics.
2. **Self-service tracker** (planned) — Consumer app for individuals without a coach.
3. **B2B platform** (planned) — Multi-tenant for gyms and clinics.

Partnership with Michael Kavdas (Greek nutritionist, PN L1 certified, COO Athletikapp). Testing phase Apr 16-18, 2026 with 5 users.

## Stack

- Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS 4 · Framer Motion
- Supabase (Postgres + Auth + RLS + Storage)
- Anthropic Claude Haiku 4.5 (food-parse, recipe-analyze, photo)
- Google Gemini 2.0 Flash (meal suggestions)
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

Prerequisites: Node 20+, Supabase CLI, a Supabase project.

```bash
git clone git@github.com:zsoist/trophe.git
cd trophe
npm install
cp .env.local.example .env.local
# Fill in the 5 required env vars (see DEPLOYMENT.md)
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
```

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

- Branch from `main`, PR back to `main`. CI must be green (typecheck + lint + test).
- Follow the coding style in `CLAUDE.md`. Mobile-first (390×844).
- No new `bg-stone-9xx` on themed pages — use CSS variables or `.glass` utility classes (ESLint enforces).
- Add a test in `tests/` for any new `lib/` business logic.
- Bump `CHANGELOG.md` for user-visible changes.

## License

Private. All rights reserved.
