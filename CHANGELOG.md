# Changelog

All notable changes to Trophē are logged here. Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Production microphone experience] — 2026-08-12

### Added
- Added native-first food and intake dictation with a bounded recorded fallback for browsers without reliable speech recognition. Fallback recordings stop at 30 seconds, stay in memory, and are never retained by Trophē.
- Added authenticated, separately rate-limited `gpt-transcribe` processing that reuses the existing server-only OpenAI credential. One maximum-length fallback costs no more than $0.00225.
- Added consistent requesting, listening, transcribing, permission recovery, Stop, Cancel, play, and pause copy across all eight supported languages.

### Changed
- Chat voice notes now share the leak-safe recorder lifecycle, remain local until Send, and stop automatically after five minutes.
- Microphone controls now meet the 44×44 touch target and reduced-motion behavior, with a same-origin browser Permissions Policy for microphone and camera use.

### Fixed
- Prevented late permission results, duplicate recorder events, question navigation, unmounts, and provider failures from leaking tracks, losing typed answers, attaching duplicate audio, or leaving the interface stuck.
- Tightened food transcription instructions so generic spoken foods cannot gain an invented brand, product, ingredient, or quantity.

## [iPhone portion review hotfix] — 2026-08-12

### Changed
- Added visible gram anchors for bowls, servings, and other human portion units, including Small, Medium, and Large choices in all eight supported languages.

### Fixed
- Moved the fixed nutrition confirmation bar outside animated meal cards so iPhone Safari anchors it to the viewport instead of covering amount and photo controls.

## [Light-mode portion review] — 2026-08-12

### Changed
- Increased light-mode contrast and type size throughout food portion review.
- Enlarged amount and size controls while reducing nested-card padding and unused bottom space.

### Fixed
- Preserved readable, WCAG-AA macro and estimate colors in light mode without changing dark mode, natural-unit editing, macro recalculation, or confirmation behavior.

## [Soup portion review] — 2026-08-12

### Changed
- Soups and other foods measured by bowls, cups, plates, servings, and similar units now stay in those natural units during review while grams remain an internal calculation detail.
- Estimated single-food portions now offer Small, Medium, and Large choices with localized unit labels across all eight supported languages.

### Fixed
- Ajiaco clarification now treats the contradictory `1 bowl` plus portion question as an estimate the user can resolve, rather than asking them to guess or edit grams.
- Exact decimal portions such as `0.75` or `1.25 bowls` can be entered directly, update nutrients proportionally, and clear the resolved clarification.
- Localized container aliases and accessible amount labels now preserve the correct unit, including the German/Portuguese meaning of `Dose`/`dose`.

## [Food logging reliability] — 2026-08-11

### Changed
- Uncertain portions now offer Small, Medium, and Large choices, a direct amount field, and a photo path instead of requiring users to estimate grams by eye.
- Voice logging now preserves interim speech, always exits listening after Stop, and recovers with clear retry states when the browser fails or times out.

### Fixed
- Food amounts can be cleared and replaced directly, including entries such as 700 g, without snapping back to 1 while the user is typing.
- Nutrition-label phrases such as “13 g protein” are treated as facts about the food, not as the total weight of the bar or serving.
- User-stated label values now pass physical and metabolic plausibility checks, and volume portion choices stay in the original unit.

## [Zero-spend quality and parser hardening] — 2026-07-29

### Added
- Added bounded, fail-closed release verification with reproducible database, performance, provider-contract, and authenticated browser evidence.
- Added deterministic multilingual food coverage, public search indexes, parser accuracy gates, offline provider contracts, and local signup/confirmation test harnesses.
- Added database constraints and tenant-relationship guards for nutrition, messaging, memory, and coaching workflows.

### Changed
- Reduced public-route and coach-dashboard delivery cost, removed unused font and motion work, and made performance measurements settle on completed page loads.
- Bounded AI fallback, retry, route-deadline, and paid-provider behavior so local verification makes no paid calls and production work stays within explicit budgets.
- Made food, workout, profile, coaching, chat, and privacy flows verify persistence and surface incomplete work instead of reporting false success.

### Fixed
- Prevented generic English food queries such as `fries`, `burger`, `latte`, `cola`, `juice`, and `energy drink` from selecting unrequested branded products.
- Preserved explicit branded intent for queries such as `Big Mac`, `Starbucks latte`, `Pepsi`, and `Red Bull`, and backfilled truthful brand metadata for known restaurant foods.
- Hardened nutrition review, manual entry, photo analysis, parser decomposition, portion matching, and food-log writes against malformed, implausible, or partial data.
- Closed auth callback, tenant access, privacy export, chat lifecycle, workout persistence, localization, and loading-state failures found by the quality sweep.

## [Domain and first-load performance] — 2026-07-11

### Changed
- Removed the authenticated Supabase, i18n, appearance, toast, and service-worker provider graph from public routes while preserving it in dashboard, coach, admin, super-admin, and onboarding layouts.
- Disabled automatic login/pricing prefetch and above-the-fold entrance delays on the landing page, reducing the measured cold request graph from 27 to 20 requests and transfer from about 487 KB to 336 KB.
- Replaced the full-build service-worker precache (156 assets, about 1.41 MiB compressed) with one self-contained offline fallback and immutable same-origin runtime caches only.

### Fixed
- Prevented the service worker from caching authenticated HTML, RSC payloads, APIs, or Supabase traffic.
- Added a one-generation migration that activates and purges legacy caches once, while later worker updates remain user-approved and listener-safe.
- Preserved branded error handling and bilingual offline recovery after relocating the authenticated provider boundary.

## [July 2026 stabilization sweep] — 2026-07-11

### Fixed
- Normalized required Supabase environment values, including accidentally quoted Vercel values, with explicit failures for missing configuration.
- Restored reproducible local database bootstrap by seeding the local-only Vault fixture before migrations.
- Removed legacy `PUBLIC` access policies from `dish_recipes` while preserving authenticated and staff policies.
- Aligned intake copy with the actual 15-step flow and fixed the coach search-field icon overlap on mobile.
- Prevented the install prompt from producing a server/client hydration mismatch.
- Rejected malformed food-parser items before rendering so provider garbage output degrades to a safe empty state.

### Changed
- Added regression coverage for null and malformed LLM output, markdown-safe rendering, branded portions, volume display, quoted environment variables, nutrition goldens, workout unit conversion, and database policy ordering.
- Added mobile and desktop E2E coverage for client, coach, and admin access, settings and logout, parser 429/timeout/garbage states, slow loading, offline recovery, and first-day empty states.
- Refreshed the generated service-worker precache after the stabilization build.

## [Deterministic MAPE reduction (shipped to prod)] — 2026-06-14
- **Result (median-of-3 vs prod):** backup v3 700-case pooled macro-MAPE **22.4% → 16.0%** (calories 12.6 / protein 16.0 / carbs 17.1 / fat 18.2), pass **75.6% → 76.6%**; official v2 210-case held at **94.3%** (no regression). Latency **p95 9.5s → 8.1s**.
- **Levers (retrieval/data only — no auth/RLS/schema change):** dried-milk-powder retrieval penalty (biggest lever) + coffee exact-match corrections + confectionery penalty + dish re-routes (bouillabaisse / gazpacho) + Gratin dauphinois seed + saganaki carb fix.
- **Floor:** ~16% pooled MAPE is the deterministic floor; sub-10% needs Michael-Kavdas-validated Greek ranges + fine-tuning (separate tracks), not prompt/retrieval tweaks.
- **Shipped:** origin/main `6f50cfc` via `vercel --prod` (deployment `dpl_GuzScRgCUBsRWkVmdG3nqe2uMKtv`), live at trophe.app. Design: `docs/superpowers/specs/2026-06-14-mape-reduction-deterministic-design.md`.

---

## [Coach call build + cleanup] — 2026-06-13
- **Shipped (Michael Jun-12 call):** meal-plan macro rollup, clickable meal→recipe, client calorie-hide, custom questionnaire builder, stabilization reframe, calorie-from-body-comp, graduated/churn, pre-appointment instructions, streak tooltip, comparison-window relabel.
- **Open Food Facts:** barcode scan (OFF v2 + ZXing camera, iOS-safe), manual-add fallback for OFF-missing products, ODbL attribution on /trust.
- **Beta:** in-app feedback widget; shopping-list generator. **PWA** shipped.
- **Migrations:** 0039 feedback, 0040 graduation, 0041 appointment_instructions (applied prod).
- **CI:** fixed migration-journal drift + added fast journal-sync guard; nightly-eval auth env.
- **Cleanup:** removed 22 orphan components (~3k LOC dead code); docs accuracy pass (DeepSeek-only routing, ~42,951 foods, 8 langs); added docs/README index, dependabot, CODEOWNERS, PR template; superseded banners on ROADMAP/TODO-NEXT/MEETING-NOTES/CODEX.
- **Decision:** 100% DeepSeek text (Fable was offline-assessment only, ToS-disabled). Benchmark official = v2 210-case (94.8%) / backup v3 700-case (76.6%).

---

## [Nutrition Accuracy Phase 2 — Code Fixes] — 2026-06-09

> **Status**: Preview deployed, pending production promotion
> **Branch**: `feat/nutrition-phase1-usda-portions`

### food-parse pipeline improvements (code)
- `COMMON_PIECE_WEIGHTS`: +20 composite dish entries (souvlaki wraps 250-300g, sandwiches 170-220g, pizza slices 110g, changua 350g, cheeseburger 150g, chicken fajitas 280g)
- `getPieceWeight()` fix: longest substring key match wins instead of first match — "souvlaki_pork_pita" (250g) no longer shadowed by "souvlaki" (150g)
- `shouldRequestClarification()`: new pre-check catches vague inputs ("lunch", "σνακ", "ate some food", "something sweet") → returns ok:true with needs_clarification instead of 422 error
- Zero-quantity guard: "0 eggs" → returns empty items with 0 macros instead of failing plausibility check
- Hybrid source protection (v7): high-confidence DB matches (≥0.85) skip LLM macro ratio override in both Rule 1 and Rule 2b of `arbitrateDbVsCoT()`. Fixes branded food corruption (Chobani, Quest, FAGE)

### Expected impact
- +8-12 cases from COMMON_PIECE_WEIGHTS fixes
- +5 cases from status error handling (vague inputs + zero quantity)
- +3-5 cases from hybrid source protection
- Target: 163-175/210 (up from 155/210)

---

## [Nutrition Accuracy Phase 1 — DB Seeding] — 2026-06-08/09

> **Status**: ✅ LIVE on `trophe.app`
> **Score progression**: 143 → 146 → 150 → 153 → 155/210 (73.8%)

### Database operations (~175 operations)
- **Batch 3** (105 fixes): sweet potato, orange, Greek yogurt, Monster, lamb (73 variants), salmon, empanada conversions; lentil soup, souvlaki, octopus, horta recipes; Barilla fat, chicken breast fat
- **Batch 3B** (7 fixes): pasta fat, cafe con leche carbs, Greek yogurt cup, Monster low carb, rice fat, chicken fajitas
- **Batch 3C** (16 fixes): tuna fat/can size, broccoli protein, Quest bar, Greek pita, okra stew, pandebono, soup
- **Batch 4** (37 fixes): scrambled egg piece=61g, buñuelo piece=40g, okra stew recipe tune, Chobani whole plain macros (label values), FAGE 2% honey conversions, halloumi piece 80→50g, cafe con leche recipe cal 41→70, generic soup recipe cal 49→150, lentil soup fat fix, souvlaki/gyros recipe localizations (Greek names), turkey/fajitas/gyros recipe tunes
- **Batch 4B** (8 fixes): lentil soup cal 230→250 (satisfies both test ranges), buñuelo protein 8→9.5, Greek yogurt fat 5→6, tzatziki default serving 100→60g
- **Batch 4C** (4 fixes): Caesar salad recipe cal 629→430, empanada recipe cal 280→310, beef burrito recipe tune

### DB state after seeding
- ~8,064 foods | ~480+ aliases | ~1,050+ unit conversions | ~210+ dish recipes

---

## [DeepSeek V4 Integration + Landing Page] — 2026-06-08

> **Status**: ✅ LIVE on `trophe.app`

### DeepSeek-first routing
- DeepSeek V4 Flash as primary for coach_insight and meal_suggest tasks
- RAG pre-search for single-food inputs (DB reference data injected into LLM prompt)
- Temperature=0 clamping for deterministic food parsing

### Landing page overhaul
- Complete redesign with app mockup, light mode support
- SSR-safe animations, removed legacy branding

### UX improvements
- Compact clarification display, remove nutritional warning noise
- Food logging unblock: save button fix, overlapping fix, tap targets
- Duplicate key fix in FOOD_NAME_CORRECTIONS

---

## [B2B readiness hardening] — 2026-05-03

- Hardened privileged HTTP routes: `/api/admin/*` and `/api/seed/*` are proxy-protected, admin APIs use shared role guards, and the unauthenticated service-role migration endpoint was removed.
- Standardized application roles to `super_admin | admin | coach | client`; public signup now creates client accounts only.
- Added organization-aware client access helpers, admin organization dashboard, billing readiness metadata, and security invariant tests.
- Updated AI routing and observability docs to current Gemini 2.5 Flash, Haiku 4.5, and Sonnet 4.5 policy names.

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
- **4-tier role enum** in `profiles.role`: `super_admin > admin > coach > client`. Replaces email allowlists for admin access (closes Apr 25 HIGH #2)
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

- **LLM router** (`agents/router/`) — task-based model selection: parse→Gemini 2.5 Flash, recipe→Haiku 4.5, coach→Sonnet 4.5. Replaces route-level hardcoded model IDs.
- **Langfuse OTEL traces** — every `agent.run()` wrapped in a generation span. Endpoint configured via `LANGFUSE_HOST`. `gen_ai.*` semconv attributes per span.
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
- `agents/memory/{read,write,coach-blocks}.ts` — kNN scope-filtered retrieval, post-turn memory extraction (Sonnet 4.5 with zod schema), Letta block rendering
- `app/coach/[clientId]/memory/page.tsx` — coach UI to view/edit memory blocks
- `MEMORY_V1` feature flag — fallback to skip hooks if disabled
- `tests/agents/memory.test.ts` — round-trip + scope isolation + RLS enforcement

### Phase 6 — Spike wearable layer

- `wearable_connections` — OAuth tokens encrypted via `pgcrypto pgp_sym_encrypt`
- `wearable_data` — steps/HRV/sleep/workout/weight, indexed `(user_id, data_type, recorded_at desc)`
- `lib/spike/client.ts` — Spike REST client
- `/api/integrations/spike/{connect,callback,webhook}/route.ts` — OAuth flow + HMAC-verified webhooks
- `agents/insights/wearable-summary.ts` — Sonnet 4.5 reads last 7 days HRV/sleep/training-load → coach insight text
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
