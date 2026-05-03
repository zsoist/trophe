# Changelog

All notable changes to Trophē are logged here. Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [v0.3.2] — 2026-05-03 — Composite Foods + Restaurant Data + UX Fixes

> **Status**: ✅ LIVE on `trophe.app`
> **Commits**: 33 commits across 3 sprints (accuracy, data, UX)

### Composite dish decomposition pipeline
- New `dish_recipes` table + `lookupDishRecipe()` — caches LLM-decomposed composite dishes
- 44 cached recipe mappings in decomposition prompt (souvlaki, arepa, bandeja paisa, etc.)
- 38 traditional Colombian + Greek dish recipes seeded as pre-cached decompositions
- Pipeline: LLM decomposes → ingredients lookup → aggregate macros → cache for next time
- Cache-only recipe check in hot path (no LLM call if dish already decomposed)

### Restaurant chain data (76 items)
- **MenuStat US** (48 items): McDonald's, Starbucks, Subway, Chick-fil-A, Taco Bell, Wendy's, Burger King, Chipotle, Domino's, Pizza Hut, Dunkin, Popeyes, Panda Express
- **Colombian chains** (28 items): Crepes & Waffles, El Corral, Frisby, Juan Valdez, Sandwich Qbano
- All items with `piece` + `serving` unit conversions (correct gram weights)
- Big Mac: 215g/piece → 553 kcal ✅ (was 220 kcal with 80g fallback)

### Food accuracy improvements
- Fried egg canonical key + aliases + piece=50g conversion (gr-12 fix)
- Phase 3 portion-size corrections for traditional dishes
- Oatmeal/salmon name corrections + 50-case eval
- LLM taught to preserve composite dish names
- CI lint parity enforced across CI, Vercel, and local (`--no-cache` + `vercel.json buildCommand`)

### UX performance fixes (Daniela's bug report)
- **Loading skeleton** on food log page — no more blank screen while auth resolves
- **Promise.all parallelization** of 4 sequential Supabase queries (~800ms → ~200ms)
- **15s timeout** on food parse API + 20s on photo analysis with clear error messages
- **Session refresh on mobile foreground** — `visibilitychange` listener calls `getUser()` after >2min background
- Improved food_log insert error handling (detect session expiry vs constraint violations)
- Network error handling (don't false-redirect to login on connection issues)

### Observability
- Langfuse production traces via Cloudflare Tunnel (`langfuse.danielreyes.work`)
- Beverage unit normalization (Wave 3.5)
- Volume unit display fix (ml/L shown instead of grams for beverages)

### Branded foods (Wave 3)
- 23 branded fast food + beverage items with correct portions
- 98 unit conversions (can=355ml, grande=473ml, Big Mac=215g, etc.)
- Aliases for common queries: "coke", "latte", "cerveza", "red bull"

---

## [v0.3.1] — 2026-05-02 — Production Cutover

> **Status**: ✅ LIVE on `trophe.app`
> **Deployment**: `dpl_FTUnpfMJsJsfc1knBSUXYMWem2dZ`

### Production cutover executed
- Supabase database password reset and credentials secured (`chmod 600`)
- Extensions enabled: `pgvector 0.8.0`, `pg_trgm 1.6`, `pgcrypto 1.3`
- Drizzle journal seeded (skip migration 0000 — tables pre-exist)
- Migration 0001 applied: `user_role` enum, 4 `both`→`coach` coercions, organizations + audit_log tables
- Production-safe 0002 applied: Daniel → `super_admin`, 3 RLS helper functions (`is_super_admin`, `is_admin_of`, `is_coach_of`)
- Migrations 0003–0006 applied via Drizzle migrator (foods, memory, wearables, agent_runs schemas)
- Foods table seeded: 7,918 rows (7,888 USDA + 30 HHF), all with Voyage embeddings, 89 aliases, 72 unit conversions
- 12 Vercel env vars configured (DATABASE_URL, DIRECT_URL, API keys)
- Custom domain `trophe.app` live (Cloudflare DNS, SSL verified)
- Zero data loss: 224 food logs, 121 water logs, 16 workout sessions preserved
- Auth gate server-side: all `/dashboard`, `/coach`, `/admin` routes → 307 to login
- IPv6 note: Supabase direct connection IPv6-only; both URLs use Transaction pooler

### Pre-cutover fixes
- Corrected super_admin email from `d.reyesusma@gmail.com` to `daniel@reyes.com` across 4 files

---

## [Unreleased]

_Nothing unreleased — all v0.3 features shipped to production._

## [v0.3.0] — 2026-05-01 — EXTREME Local-First Overhaul (`v0.3-overhaul` branch)

> **Status**: all 8 local phases green. Production cutover (Phase 9) is operator-gated.
> **Branch**: `v0.3-overhaul` | **Preview**: `trophe-r8jgvjyi9-2p6y54z6w9-4465s-projects.vercel.app`

### Phase 0 — Drizzle baseline + local Postgres

- Wired `open_brain_postgres` Docker (`localhost:5433`) as local dev database
- `drizzle.config.ts` + `db/client.ts` (pg.Pool + drizzle wrapper)
- `drizzle-kit introspect:pg` produced `db/schema/_introspected.ts` from existing 25-table schema
- `scripts/db/bootstrap-local.sh` — one-command local DB setup

### Phase 1 — Schema discipline + 4-tier roles + organizations

- **Drizzle migrations** replace hand-curated `supabase-schema.sql`. Schema now in `db/schema/` (one file per domain), versioned SQL in `drizzle/`
- **4-tier role enum** in `profiles.role`: `super_admin > admin > coach > client`. Replaces `TROPHE_ADMIN_EMAILS` string allowlist (closes Apr 25 HIGH #2)
- `organizations` + `organization_members` tables for multi-tenancy. Coaches auto-create an org on signup; clients inherit coach's `org_id`
- `audit_log` — append-only table for sensitive mutations (role changes, client_profile updates, habit reassignment)
- RLS recreated as discrete `db/policies/*.sql` files with new helpers `is_super_admin()`, `is_admin_of(org_id)`, `is_coach_of(client_id)`
- `tests/db/rls.test.ts` — Vitest with `SET LOCAL "request.jwt.claims"` for each role tier; CI gate 100%

### Phase 2 — `@supabase/ssr` + middleware role gate

- **`@supabase/ssr`** replaces localStorage sessions with HTTP-only cookie sessions (closes Apr 25 HIGH #1 — middleware was a no-op before this)
- `lib/supabase/{browser,server,middleware}.ts` — split client
- `lib/auth/{get-session,require-role}.ts` — server-side `{ user, profile, role, orgId }` guard
- `proxy.ts` (renamed from `middleware.ts`) now enforces role routing: `/coach/*` ≥ coach, `/admin/*` ≥ admin, `/super/*` = super_admin
- `app/api/auth/callback/route.ts` — OAuth code exchange; magic-link + Apple/Google flows wired (OAuth client provisioning operator-gated)
- `tests/auth/role-gate.test.ts` — supertest hits each protected route as each role; CI gate 100%
- CSP: `unsafe-eval` dropped from `script-src` (closes Apr 25 HIGH #3)

### Phase 3+4 — Frontier LLM stack + food data layer

- **LLM router** (`agents/router/`) — task-based model selection: parse→Gemini 2.5 Flash, recipe→Haiku 4.5, coach→Sonnet 4.6. Replaces hardcoded `FOOD_PARSE_MODEL = 'claude-haiku-4-5-20251001'`
- **Langfuse OTEL traces** — every `agent.run()` wrapped in a generation span. Local Langfuse @ `localhost:3002`. `gen_ai.*` semconv attributes per span.
- **Multi-layer evals** — `agents/evals/multi-layer/{schema-validation,llm-judge,regression}.ts`; aggregate runner `run-all.ts`; CI gate ≥95%
- **`foods` table** — canonical food database. Sources: USDA FDC FoundationFoods + SR Legacy (~7,800 rows), OpenFoodFacts GR/ES/US slice (~50k rows), Hellenic Food Thesaurus, 48 HHF traditional Greek dishes (PubMed 28731641). HNSW index on `embedding vector(1024)`, GIN on `search_text tsvector`
- **`food_unit_conversions`** — deterministic gram anchors. **This closes the ~19% accuracy bug.** LLM now emits `{food_name, qty, unit}` only; macros computed as `grams × kcal_per_100g / 100`. LLM never sees a number.
- **`agents/food-parse/lookup.ts`** — pgvector + pg_trgm hybrid retrieval replacing `enrich.ts` substring matching
- **Voyage v4 embeddings** — `scripts/ingest/embed-foods.ts`, batched + idempotent + resumable
- `food_log` extended: `food_id FK → foods`, `qty_g`, `qty_input`, `qty_input_unit`, `parse_confidence`, `llm_recognized`
- Hard CI gate added: food-parse accuracy ≥95% on Nikos goldens (was 81%)

### Phase 5 — User memory (Mem0/Letta hybrid)

- `memory_chunks` — scoped facts (`user/session/agent`) with Voyage embeddings, HNSW index, Letta supersedence chain, `salience`, `expires_at`, `retrieval_count`
- `coach_blocks` — Letta-style human-editable coach notes (versioned, `edited_by`)
- `agent_conversation` + `raw_captures` — full turn history with token/cost accounting
- `agents/memory/{read,write,coach-blocks}.ts` — kNN scope-filtered retrieval, post-turn memory extraction (Sonnet 4.6 with zod schema), Letta block rendering
- `app/coach/[clientId]/memory/page.tsx` — coach UI to view/edit memory blocks
- `MEMORY_V1` feature flag — fallback to skip hooks if disabled
- `tests/agents/memory.test.ts` — round-trip + scope isolation + RLS enforcement

### Phase 6 — Spike wearable layer

- `wearable_connections` — OAuth tokens encrypted via `pgcrypto pgp_sym_encrypt`
- `wearable_data` — steps/HRV/sleep/workout/weight, indexed `(user_id, data_type, recorded_at desc)`
- `lib/spike/client.ts` — Spike REST client
- `/api/integrations/spike/{connect,callback,webhook}/route.ts` — OAuth flow + HMAC-verified webhooks
- `agents/insights/wearable-summary.ts` — Sonnet 4.6 reads last 7 days HRV/sleep/training-load → coach insight text
- `tests/spike/webhook.test.ts` — HMAC verification + idempotency

### Phase 7 — tRPC v11

- `lib/trpc/{server,router,context,client}.ts`; `app/api/trpc/[trpc]/route.ts`
- 4 routers: `clients`, `coach`, `food`, `memory`
- React Query v5 provider wraps the app
- Public REST at `/api/v1/*` preserved for external partners + Spike webhooks

### Phase 8 — UI overhaul (Handoff v2 design system)

- `app/globals.css` — +146 lines of Handoff v2 primitives: `.card`, `.card-g`, `.card-r`, `.av`, `.av-lg`, `.mb-track/.mb-fill`, `.eye/.eye-d`, `.hs-dots`, `.row-b/.row-i`, `.ds-sub`, `.tag`
- `public/sprite.svg` — 56-icon SVG sprite; `components/ui/Icon.tsx` + `components/ui/BotNav.tsx`
- **`/dashboard`** — full rewrite: CompactRing (72px SVG spring-animated), MacroLine bars, habit streak card, water tracker, quick-actions grid
- **`/dashboard/log`** — surgical: chevron date nav + 7-day week strip + macro card
- **`/dashboard/checkin`** — NEW: daily habit check-in (mood selector, YES/SKIP, streak update, redirect)
- **`/dashboard/progress`, `/dashboard/profile`** — BotNav + bg token
- **`/dashboard/supplements`, `/dashboard/workout`** — BotNav + bg token
- **`/coach`** — BotNav + bg token
- **`/coach/client/:id`** — Screen 05 header redesign (av-lg, card-g macro targets, Edit Plan link)
- **`/coach/client/:id/plan`** — NEW: macro steppers, habit add/remove, coaching phase selector
- **`/coach/inbox`** — NEW: urgency-sorted client activity, status dots, gold border for ≥3d off-plan
- **`/coach/foods`, `/coach/habits`, `/coach/protocols`, `/coach/templates`** — BotNav + bg token
- `proxy.ts` renamed from `middleware.ts` (Next.js 16 convention)

---

## [v0.2] — April 2026

### Added
- `/agents/` folder (food-parse 258→51 LOC; recipe-analyze agent)
- Prompt caching (`cache_control: ephemeral`) on Haiku 4.5 — ~70% projected spend reduction
- Vitest 4 + 25 unit tests on `lib/nutrition-engine.ts`
- GitHub Actions CI (typecheck + lint + test)
- ESLint rule banning raw `bg-stone-9xx` on themed surfaces
- Pre-paint inline theme script (no flash of wrong theme)
- Coach Export button (Markdown report)
- Full doc suite: CHANGELOG, ARCHITECTURE, DEPLOYMENT, SECURITY, RUNBOOK

### Changed
- Theme toggle works in client mode; 9 dashboard backgrounds swept to CSS vars
- MealPatternView food-first redesign (Michael #1)
- MealSlotConfig duplicate inserts at source index + 1 (Michael #7)

### Fixed
- `fceeeaa` — server-side admin guard for `/admin/*` routes
- `90a83c6` — 22 serving-size defaults + 21 DB entries rewritten (protein was over-estimated 20–30%)
- `196fe80` — local timezone for all date calculations (was UTC; day-boundary bugs)

---

## [Apr 8–13, 2026] — Foundation sprint

- AI Form Check (MediaPipe Pose, 33 landmarks, no server)
- Michael Kavdas demo page (EN/EL)
- `.single()` → `.maybeSingle()` sweep
- Langfuse OTEL traces live (4 extraction traces confirmed)
- 60-feature mega upgrade: calendar, charts, analytics, engagement, cost tracking

---

## [Apr 5–7, 2026] — Bootstrap

Project start April 5, 2026. Day 1: Next.js 16 + Supabase + Tailwind 4 + auth + onboarding + nutrition engine + i18n (EN/EL/ES). Full day-by-day in `ROADMAP.md`.
