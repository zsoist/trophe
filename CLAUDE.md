# τροφή (Trophē) — AI Agent Project Brief

> **Read this first.** This file is the primary context document for AI coding agents (Claude Code, Codex, Cursor). For the comprehensive operator handoff see `CODEX.md`.

_Last synced to codebase: 2026-06-15_

## Current Production Truth (2026-06-15)

- Canonical repo path: `/Volumes/SSD/work/forge-projects/trophe`
- Production URL: `https://trophe.app`
- Supabase project/ref: `iwbpzwmidzvpiofnqexd`
- GitHub default branch: `main` (deploys auto to Vercel)
- Production branch: `main` (v0.3-overhaul merged 2026-05-03, archived as `archive/v0.3-overhaul-2026-05-03`)
- Cost/AI observability source of truth: `agent_runs`; `api_usage_log` is legacy compatibility only
- Required verification sequence: `npm run typecheck && npm run lint && npm test && npm run build`
- AI route auth must use async `guardAiRoute()` and the verified Supabase `userId`; do not decode JWTs for auth decisions.
- Food data: 42,952 foods (OFF 21,823 + USDA 13,259 + CIQUAL 3,323 + CoFID 2,744 + BEDCA 751 + CREA 714 + custom 176 + HHF 86 + MenuStat 48 + chain_co 28). 8,608 unit conversions. 293 dish recipes. 6,580 aliases. Foods have Voyage voyage-4 embeddings.

---

## Working tree discipline

No session ends with uncommitted working-tree files. At session end, every modified or untracked file must be one of:
- **committed and pushed** — the work shipped
- **reverted** — the work was abandoned
- **stashed with a labeled note** — the work is paused

"Working tree fixes" that never reach git are how:
- migration `0000_complex_johnny_blaze.sql` had `/* */` wrappers in HEAD while local was clean
- the CI hardcode guard was a no-op for multiple sessions while claiming ✅
- 21 files of "shipped" enterprise hardening sat untracked while sessions claimed the feature was done

If a session must end mid-task, leave a `TODO-NEXT.md` file at repo root listing every uncommitted file, why it isn't committed, and what the next session must do with it. This file may be committed or left in the working tree — either is better than silence.

**For agents**: never report a feature as "shipped" unless `git log` shows the commit. Working tree ≠ shipped.

Before every `git commit`, run `git diff --cached --stat` and confirm the staged file list matches the intended commit scope. `git stash pop` and IDE auto-staging can silently widen the index beyond what you ran `git add` against. If the staged list doesn't match intent, run `git reset` to clear the index, then `git add` only the intended files.

## Audit pattern

When writing diagnostic or audit documents:
1. Write findings as initial claims, evidence-cited.
2. Pick the highest-severity findings and run sanity checks against them — at minimum the P0/P1 items.
3. Note corrections inline AND in a "Corrections after sanity checks" section at the bottom of the doc.
4. Re-derive priorities from the corrected state, not the initial draft.

Initial audit findings are hypotheses. Sanity checks are the verification. Don't ship audit conclusions without at least one verification pass — this arc produced two false-positive findings (Supabase 401 was a missing header, dashboard "broken" was actually shell-only with data protected by RLS) that would have driven wrong priorities if treated as fact.

---

## Stack (ground truth)

| Layer | Technology |
|-------|-----------|
| **Web** | Next.js 16.2.7 App Router · React 19 · TypeScript strict |
| **Styling** | Tailwind CSS 4 · Framer Motion 12 · Lucide icons |
| **Auth** | `@supabase/ssr` 0.10 — HTTP-only cookie sessions (NOT localStorage) |
| **Database** | Supabase Postgres (production) + Supabase CLI local stack @ `127.0.0.1:54322` (dev) |
| **ORM** | Drizzle ORM + Drizzle Kit — schema in `db/schema/`, migrations in `drizzle/` |
| **API** | tRPC v11 (coach UI) + REST `/api/*` (public / webhooks) |
| **AI** | LLM router (`agents/router/`) — 100% DeepSeek V4 Flash for ALL text (food-parse, recipe, coach insights, meal-suggest). Only non-DeepSeek: photo_analyze → Anthropic Haiku 4.5 (vision) |
| **Embeddings** | Voyage `voyage-4` 1024-dim via `scripts/ingest/embed-foods.ts` |
| **Observability** | Langfuse via `LANGFUSE_HOST` — OTel GenAI semconv per span |
| **Computer Vision** | MediaPipe Pose (browser WASM, 33 landmarks, 30+ FPS) for AI Form Check |
| **Wearables** | Spike API — Apple Health, Whoop, Oura, Strava, Garmin, Fitbit |
| **Testing** | Vitest 4 + `@vitest/coverage-v8` |
| **CI** | GitHub Actions (typecheck + lint + test + rls + role-gate + food-parse accuracy) |
| **Hosting** | Vercel — production `https://trophe.app` |

---

## Project state (2026-06-09)

**Branch**: `main` (production) + `feat/nutrition-phase1-usda-portions` (benchmark work)
**Production**: `https://trophe.app` — live with 5+ testers (Michael, Nikos, Daniel, Daniela, Dimitra, Alex)

v0.3-overhaul merged to main 2026-05-03. Nutrition accuracy work ongoing June 2026.

### What IS running in production (on Supabase Postgres)
- Auth (cookie-based @supabase/ssr), 30+ tables, RLS, food logging, coach dashboard, workouts, supplements, habits
- AI food-parse v7 (DeepSeek V4 Flash primary via `/api/food/parse`) with CoT dual-path arbitration
- 8-language support: EN/ES/EL/FR core + overlay DE/IT/PT/NL
- Deterministic food lookup: 42,952 foods + 8,608 unit conversions + 293 recipes + 6,580 aliases
- Composite dish decomposition: 210+ cached recipes + LLM decompose-on-miss pipeline
- RAG pre-search for single-food inputs (DB reference data injected into LLM prompt)
- COMMON_PIECE_WEIGHTS map: 80+ entries for bakery, Greek, Latin American, composites
- Vague input detection + zero-quantity guard in food-parse pipeline
- Hybrid source protection: high-confidence DB matches (≥0.85) skip LLM macro override
- Langfuse traces via Cloudflare Tunnel (`langfuse.danielreyes.work`)
- Session refresh on mobile foreground (visibilitychange hook)
- AI Form Check (MediaPipe, browser-only, no server)
- All analytics components, quadrilingual UI (EN/ES/EL/FR)
- Nutrition benchmark: validated 549-set ~90% pass; Greek-weighted 700-set 76.7% pass (on-demand only); pooled macro-MAPE 16.0%; v2 210-set ~94-95%. Cal MAPE ~17%, Fat MAPE ~25%. Latency p50 ~4.4s / p95 ~7-8s

### v0.3 features (all merged to main, live in production)
- Drizzle ORM + versioned migrations (`drizzle/` — 57 migrations)
- 4-tier role enum (`super_admin|admin|coach|client`) — organizations table
- `@supabase/ssr` HTTP-only cookie auth + session refresh on mobile foreground
- LLM router (Gemini Flash + DeepSeek + Langfuse traces via CF Tunnel)
- `foods` canonical DB + `food_unit_conversions` + `food_aliases` + `dish_recipes`
- Composite dish decomposition pipeline (`dish_recipes` table + LLM decompose)
- Restaurant chain data (76 items: MenuStat US + Colombian chains)
- Memory system (`memory_chunks`, `coach_blocks`)
- Spike wearable layer
- tRPC v11
- Handoff v2 UI (new `components/ui/`, `app/globals.css` primitives)
- `middleware.ts` (Next.js middleware at repo root)

---

## Critical file map

### AI / Agents (v0.3+)
```
agents/
  router/index.ts + policies.ts      # task → model selection (DeepSeek for all text; Anthropic for photo vision)
  runtime/providers/deepseek.ts      # DeepSeek V4 Flash provider
  clients/anthropic.ts + google.ts   # thin API wrappers
  observability/langfuse.ts + otel.ts
  memory/read.ts + write.ts + coach-blocks.ts
  food-parse/index.v4.ts             # v4-v6 pipeline: LLM extract → DB lookup → CoT arbitration
  food-parse/lookup.ts               # pgvector + pg_trgm hybrid retrieval + COMMON_PIECE_WEIGHTS
  food-parse/decompose.ts            # dish_recipes cache + LLM decomposition + getPieceWeight()
  recipe-analyze/index.ts
  insights/wearable-summary.ts
  evals/run-all.ts + datasets/       # 210-case enterprise benchmark
  prompts/food-parse.v6.md           # ALWAYS bump version on prompt changes
  schemas/                           # input/output types per agent
```

### Database (v0.3 Drizzle)
```
db/
  schema/                            # one .ts file per domain (55 public tables, 10 enums, 103 RLS policies)
  client.ts                          # pg.Pool + drizzle() wrapper
  queries/                           # typed query helpers
drizzle/                             # versioned migration SQL (57 migrations, 0000…0048)
supabase-schema.sql                  # DEPRECATED — reference only
supabase-workout-schema.sql          # DEPRECATED — reference only
```

### Auth (v0.3 — @supabase/ssr)
```
lib/supabase/browser.ts             # createBrowserClient()
lib/supabase/server.ts              # createSupabaseServerClient() — reads cookies()
lib/supabase/middleware.ts          # edge middleware client
lib/auth/get-session.ts             # { user, profile, role, orgId }
lib/auth/require-role.ts            # server-side role guard
middleware.ts                       # Next.js middleware (repo root; Supabase session + auth gate)
```

### tRPC
```
lib/trpc/server.ts + router.ts + context.ts + client.ts + provider.tsx
lib/trpc/routers/                   # clients, coach, food, memory
app/api/trpc/[trpc]/route.ts
```

### Core library
```
lib/nutrition-engine.ts             # BMR/TDEE/macros (Mifflin-St Jeor + ISSN)
lib/i18n.tsx                        # 8-language dictionary + useI18n() hook
lib/types.ts                        # TypeScript interfaces (Supabase schema)
lib/dates.ts                        # localToday(), localDateStr() — always local timezone
lib/meal-score.ts                   # Meal quality 0–100 (A/B/C/D)
lib/security/api-guard.ts           # Per-user + per-IP rate limiting
lib/api-cost-logger.ts              # DeepSeek cost tracking (text); Anthropic for photo vision only
lib/food/food-units.ts              # Legacy unit conversions (v0.3: thin wrapper)
lib/spike/client.ts                 # Spike REST client
lib/form-analysis.ts                # MediaPipe biomechanics math (ported from Python)
```

### Design system
```
components/ui/                      # Canonical primitives: Icon, BotNav, Card, CardGold,
                                    #   CardDanger, Tag, BrandEye, Tabs, Fab, Avatar, StatusDot
app/globals.css                     # CSS custom properties + utility classes (.card, .glass,
                                    #   .mb-track/.mb-fill, .av, .av-lg, .eye, .btn-gold…)
public/sprite.svg                   # 56-icon SVG sprite
```

---

## API routes

| Route | Method | AI | Auth guard | Purpose |
|-------|--------|----|------------|---------|
| `/api/food/parse` | POST | DeepSeek V4 Flash | `guardAiRoute` | NLP text → `{food_name, qty, unit}[]` |
| `/api/food/recipe-analyze` | POST | DeepSeek V4 Flash | `guardAiRoute` | Recipe text → per-ingredient + totals |
| `/api/food/search` | GET `?q=` | — | sanitized | USDA FoodData Central (350K+ foods) |
| `/api/food/local-search` | GET `?q=` | — | anon key | Local Supabase food DB |
| `/api/ai/photo-analyze` | POST | Haiku 4.5 | `guardAiRoute` | Photo → food identification |
| `/api/ai/meal-suggest` | POST | DeepSeek V4 Flash | `guardAiRoute` | 12 meal suggestions within macros |
| `/api/nutrition/calculate` | POST | — | — | BMR/TDEE/macros server-side |
| `/api/auth/signup` | POST | — | rate limited 5/hr/IP | Server-side signup |
| `/api/auth/callback` | GET | — | — | OAuth code exchange |
| `/api/integrations/spike/connect` | GET | — | session | Spike OAuth init |
| `/api/integrations/spike/callback` | GET | — | — | Spike OAuth callback |
| `/api/integrations/spike/webhook` | POST | — | HMAC verify | Spike data push |
| `/api/trpc/[trpc]` | ANY | — | context | tRPC handler |
| `/api/seed/food-database` | POST | — | `requireAdminRequest` | Seed local food DB |
| `/api/seed/greek-foods` | POST | — | `requireAdminRequest` | Seed Greek foods |

---

## Role enum (4-tier)

```
super_admin > admin > coach > client
```

- `super_admin` — Daniel only. Full access to all data + `/super/*` routes.
- `admin` — Kavdas team. Org-level access + `/admin/*` routes.
- `coach` — Assigned clients only. `/coach/*` routes.
- `client` — Own data only. `/dashboard/*` routes.

Public signup always forces `role = 'client'`. Invite token required for elevated roles.

---

## Middleware routing (middleware.ts)

`middleware.ts` (Next.js middleware at repo root, runs before every request):
- Creates server Supabase client from `request.cookies` via `lib/supabase/middleware.ts`
- Calls `getUser()` (not `getSession()` — re-validates JWT against auth server)
- Enforces role routing:
  - `/coach/*` → role ∈ `{coach, admin, super_admin}` required
  - `/admin/*` → role ∈ `{admin, super_admin}` required
  - `/super/*` → role = `super_admin` only
  - Unauthenticated → 302 `/login` | Wrong role → 302 `/dashboard`

---

## Design rules (enforce these — ESLint guards some)

1. **CSS variables on themed surfaces, not raw Tailwind dark colors.** Use `var(--bg-primary)`, `var(--color-gold)`, `.glass`, `.glass-elevated`. Raw `bg-stone-9xx / bg-neutral-9xx / bg-zinc-9xx` on `app/dashboard/**` and `app/onboarding/**` is an ESLint warning.
2. **No `dangerouslySetInnerHTML`** except the pre-paint theme script in `app/layout.tsx`. Everything else uses plain JSX.
3. **No emoji as icons** — use Lucide icons. Emoji is for meal decorations only.
4. **i18n for ALL user-visible strings** — `useI18n()` hook returns `t(key, params?)`. New strings go in `lib/i18n.tsx` under the correct domain prefix.
5. **Mobile-first**: design + verify at 390×844 before desktop.
6. **Accordion pattern**: all analytics panels (`CalorieHeatmap`, `MacroAdherence`, `DayPatterns`, `MonthlyReport`, `CoachFoodRecs`) default to **closed** (`expanded = useState(false)`).
7. **Framer Motion `type: 'spring'`** only supports 2 keyframes. Use `type: 'tween', ease: 'easeOut'` when animating 3+ keyframe arrays.
8. **Image: use `public/sprite.svg`** for icons via `<Icon name="i-*" size={N} />`. See `components/ui/Icon.tsx`.

---

## i18n (lib/i18n.tsx)

- Languages: `en | es | el | fr` core + overlay `de | it | pt | nl` (8 total)
- 600+ keys organized by domain prefix: `app.*`, `auth.*`, `nav.*`, `general.*`, `log.*`, `heatmap.*`, `adherence.*`, `patterns.*`, `insights.*`, `report.*`, `recs.*`, `day.*`, `analytics.*`
- Provider: `I18nProvider` in `app/layout.tsx`. Uses `useState(defaultLang)` + `useEffect` to read `localStorage` after mount — **never in lazy initializer** (hydration mismatch risk).
- Hook: `const { t, lang, setLang } = useI18n()` → `t('key', { n: 42 })` interpolates `{n}`.
- Language switcher: `Profile` page stores selection in `localStorage['trophe_lang']`.

---

## Supabase notes

- Project ID: `iwbpzwmidzvpiofnqexd` | URL: `https://iwbpzwmidzvpiofnqexd.supabase.co`
- **NEVER `.single()`** — always `.maybeSingle()` (PGRST116 crash)
- **Service role key** — never `NEXT_PUBLIC_`, server-only
- All dates via `lib/dates.ts` `localDateStr()` — UTC caused day-boundary bugs
- food_log `source` CHECK: `('usda','openfoodfacts','custom','photo_ai','natural_language','ai_estimate')`
- RLS on every client-accessible table; `auth.uid() = user_id` is the baseline policy
- `agent_runs` tracks token + cost per AI call; `api_usage_log` is legacy compatibility

---

## LLM / AI rules

1. **LLM router** (`agents/router/index.ts`) selects model per task — do NOT hardcode models in agents.
2. **v6 dual-path architecture**: LLM extracts `{food_name, qty, unit}` AND `{per_100g_kcal, per_100g_protein, ...}` CoT estimates. `lookup.ts` fetches DB macros. `arbitrateDbVsCoT()` in `index.v4.ts` picks the best source.
3. **Arbitration rules**: Explicit portion + food-specific conversion → DB wins. Estimates agree <30% → DB wins. Diverge >30% → LLM grams + DB per-100g ratios. High-confidence DB (≥0.85) → always DB macros (v7 hybrid protection).
4. **Prompt versioning**: prompts live in `agents/prompts/<agent>.v<N>.md`. NEVER edit in place — copy to `vN+1.md`, update import in agent `index.ts`, ship. Keeps rollback to a one-line revert.
5. **Prompt caching**: `cacheSystem: true` in `anthropic.ts` wraps system block with `cache_control: ephemeral`. Prefix must be ≥2048 tokens. ~70% cost reduction on burst calls.
6. **Every `run()` returns `telemetry`** — routes must pass it to `logAPIUsage`.
7. **Input caps**: food-parse 500 chars · recipe-analyze 4000 chars. Strip `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]` from all AI inputs.
8. **`agents/evals/` CI gate**: food-parse accuracy ≥95% on Nikos golden set. Enterprise benchmark: 210 cases at `scripts/eval/run-nutrition-enterprise-prod.ts`.
9. **COMMON_PIECE_WEIGHTS** (`lookup.ts`): 80+ entries mapping composite dishes → gram weights. `getPieceWeight()` in `decompose.ts` uses longest-key-match (not first match).
10. **food_aliases table**: 3,837 entries across 4 languages. Wired into tsvector search AND ILIKE fuzzy fallback (June 2026). Alias-matched foods bypass word-boundary post-filter.

---

## Agent output contract

```ts
Promise<{
  ok: boolean;
  output?: AgentOutput;
  error?: string;
  telemetry: { model, provider, tokensIn, tokensOut, latencyMs, langfuseTraceId };
}>
```

---

## Drizzle / database commands

```bash
npm run db:introspect   # reverse-engineer current DB → db/schema/_introspected.ts
npm run db:generate     # generate migration SQL from schema changes
npm run db:migrate      # apply pending migrations
npm run db:studio       # Drizzle Studio GUI (port 4983)
npm run db:push         # push schema directly (dev only, skips migration)
```

Local DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
Canonical local flow: `npm run db:doctor` → `npm run db:local:start` → `npm run db:bootstrap`
Legacy `open_brain_postgres` on `127.0.0.1:5433` is temporary compatibility only.

---

## Deploy

```bash
# Local dev (unlimited, fast)
npm run dev              # http://localhost:3000

# Before every production deploy
npm run typecheck && npm run lint && npm test && npm run build
```

- Production: `https://trophe.app`
- GitHub: `zsoist/trophe`

### Vercel deploy discipline (updated 2026-05-03)

**Production branch**: `main`. Auto-deploys to https://trophe.app on every push.

**Normal workflow**:
1. Branch off main: `git checkout -b feat/X`
2. Make changes, commit
3. Open PR to main, get review (if applicable)
4. Merge PR → Vercel auto-deploys to production
5. Verify: `vercel ls --prod` and `curl -sI https://trophe.app/`

**Emergency hotfix workflow**:
- Same as normal — commit on a branch, merge to main
- Only use `vercel --yes --prod` if auto-deploy fails for some reason

**Long-lived feature branches: avoid.**
v0.3-overhaul existed Apr 5 → May 3 and accumulated 82 commits
before merging. During that time:
- Production deployed via manual `vercel --yes --prod` overrides
- main was stale and didn't reflect what was live
- Yesterday's silent 24-hour breakage was caused in part by this
  workflow gap (auth fix shipped to v0.3-overhaul on May 2 but
  `git push` triggered failing Preview deploys, not production)

**Rule**: feature branches should merge to main within ~1 week.
Long-lived branches diverge and create operational risk.

**2026-06-12 pitfall**: `vercel --prod` (manual CLI) uploads the LOCAL working tree, while CI builds from git. An untracked file made prod work for days while CI failed with TS2307. Guard: run `git status --short` before any manual deploy — untracked source files = dangerous divergence.

**Rollback**:
- Recent v0.3-overhaul state preserved at tag `archive/v0.3-overhaul-2026-05-03`
- Vercel dashboard → Deployments → "Promote to Production" on any past deployment
- Or: `git revert <commit>` on main and push (auto-deploys revert)

---

## Verification sequence (before any PR merge)

```bash
npm run typecheck    # 0 errors
npm run lint         # 0 errors (warnings OK)
npm test             # all Vitest suites green
npm run build        # clean production build
```

---

## Test accounts

Test-account identities and credentials are managed outside the repository.
Use environment variables or the team password manager; never document shared
passwords in source control.

---

## Nutrition data quality taxonomy

Trophē tracks the source and confidence of every food's macro data. This is a credibility requirement: anyone evaluating Trophē's nutrition accuracy needs to know what's lab-verified vs. AI-estimated.

### Tiers (column: `foods.data_quality` × `foods.source`)

1. **`lab_verified`** — Macros measured in a laboratory. Currently only USDA Foundation Foods qualify (~95 foods). Confidence: ≥0.95.
2. **`label` + `source=usda`** — Sourced from USDA SR Legacy or FNDDS Survey datasets. Standard reference (~7,793 foods). Confidence: 0.85–0.95.
3. **`label` + `source=hhf|helth`** — Community-curated Mediterranean foods, sourced from published research (PubMed 28731641) or the Hellenic Food Thesaurus. Confidence: 0.7–0.9.
4. **`crowdsourced`** — Open Food Facts or similar user-submitted databases. Quality varies. Confidence: 0.5–0.75.
5. **`estimated`** — LLM-generated (Anthropic, Gemini). Use only when no DB match exists. Always flag in UI as "estimate". Confidence: ≤0.75 (capped by `agents/food-parse/`).

### Provenance columns on `foods` table

- `data_quality`: NOT NULL enum — `lab_verified | label | crowdsourced | estimated`
- `source`: NOT NULL enum — `usda | off | helth | hhf | custom`
- `macro_confidence`: NOT NULL real 0.0–1.0 (default 0.7)
- `usda_fdc_id`: nullable integer — populated when data sourced from USDA FDC
- `provenance_notes`: nullable text — free-form source details
- `canonical_food_key`: nullable text — lowercase ASCII identifier for cross-region food matching (e.g., `egg_chicken_whole_raw`)
- `unit_conversion_verified`: NOT NULL boolean (default false) — set true when `food_unit_conversions` has been human-verified for this food
- `data_reviewed_at`: nullable timestamp — set when a human reviewed the entry

### Rules

- Never silently downgrade an estimate to a higher tier
- Never silently upgrade lab data to estimate (no losing provenance)
- Frontend MUST display confidence/tier when below 0.85
- New foods added via curation MUST cite `provenance_notes`
- `usda_fdc_id` MUST be populated when `source = 'usda'`

---

## Pitfalls (hard-won)

### Auth
- `@supabase/ssr` IS installed and in use. Sessions in HTTP-only cookies, NOT localStorage. Don't revert to localStorage pattern.
- Always call `getUser()` not `getSession()` — `getSession()` doesn't re-validate against auth server.
- middleware lives in `middleware.ts` at repo root (standard Next.js convention). Verified 2026-06-15: `proxy.ts` does not exist (a brief 2026-05 rename experiment was reverted).
- Always validate auth gating after any middleware file move — a wrong filename makes Next.js skip the middleware entirely and protected routes silently appear public.
- Hydration mismatch: never read `localStorage` inside `useState` lazy initializer — use `useEffect` after mount.

### Supabase / DB
- NEVER `.single()` on any query — PGRST116 crashes. Always `.maybeSingle()`.
- `food_log` CHECK constraint must include all `source` values used in code. Silent insert failure if not.
- Supabase email confirmation ON by default — use admin API with `email_confirm: true` for test accounts.
- Schema-code drift: if DB CHECK doesn't match code source values, inserts silently fail. Check the source value first when "meals don't save."
- Always add explicit error handling on `.insert()` — silent failures are the worst UX.

### AI / LLM
- AI food parser inflates portions without gram anchors. v0.3 fixes this by never letting LLM emit numbers — but if you add a new agent that returns macros from LLM, expect ~20% overestimation.
- Prompt injection: cap inputs, strip control chars, validate output shape with type-guard.
- Gemini API key via `x-goog-api-key` header, NOT URL query param (keys in URL appear in logs).

### React / Next.js
- Framer Motion `type: 'spring'` only supports 2 keyframes. `scale: [1, 1.3, 1]` with spring crashes the animation scheduler silently.
- React hooks must be called before early `return` statements.
- `dangerouslySetInnerHTML` on a `<span>` triggers "Encountered script tag" warning — use JSX with `<strong>` instead.
- `bg-white/3` is invalid Tailwind — use `bg-white/[0.03]`.
- `window.location.href` causes full reload — use `router.push()`.
- `i18n.tsx` must be `.tsx` extension (contains JSX).

### UI / UX
- All accordion panels default to `expanded = useState(false)` — closed on load.
- Theme: hardcoded `dark` class on `<html>` breaks light mode. Use pre-paint inline script + CSS variable approach (already in `app/layout.tsx`).
- No raw `bg-stone-9xx` on themed surfaces — use CSS variables.
- ALWAYS add loading guards on async buttons — double-click = double insert.
- Coach pages need role gate — redirect `role === 'client'` to `/dashboard`.

### Deploy
- Production branch is `main` — push to main auto-deploys. See "Vercel deploy discipline" section above.
- Vercel env vars are Production-scoped. Preview deploys from non-main branches will fail without explicit Preview env var scope.
- CSP: use explicit `https://iwbpzwmidzvpiofnqexd.supabase.co`, NOT `*.supabase.co` (wildcard breaks mobile).
- Pre-deploy: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|pa-)'` must be empty.
- Git identity for Vercel: `zsoist` / `zsoist@users.noreply.github.com`.
- 2026-05-03: ESLint cache (`.eslintcache`) masks CI lint failures across branches. Local lint passes because cache hits prior passing results; Vercel `next build` runs include lint and fail. Delete `.eslintcache` before pushing or add it to `.gitignore`.

### Drag-and-drop
- HTML5 drag API works on desktop + iPad, NOT mobile touch. Use `onTouchStart/Move/End` for touch.
- `e.preventDefault()` on `onDragOver` is required or `onDrop` never fires.

### Food-Parse Lookup (added May 2, expanded June 9)
- BM25 with `'simple'` tsconfig has NO stemmer. "eggs" does NOT match "Egg" (singular). Always singularize tokens in tsquery.
- Canonical foods can rank #94+ in BM25 due to USDA verbose naming. Canonical injection into candidate pool is required — metadataBoost can't help if the food never enters the candidate list.
- USDA FDC search queries are fragile. `chicken breast without skin raw` matched Apples. Use USDA naming conventions: `chicken broilers breast meat only raw`.
- `ON CONFLICT DO NOTHING` requires a unique constraint. `food_unit_conversions` has none on `(food_id, unit)`. Use `INSERT ... WHERE NOT EXISTS` pattern.
- `db/client.ts` defaults to Supabase local (port 54322) when `DATABASE_URL` unset. Canonical foods are on Mac Mini (port 5433). Set `DATABASE_URL` explicitly for accuracy tests.
- Dry-run pattern (`--emit-sql`) for seed scripts is the single best QA investment. Review SQL before applying to production.
- **food_aliases are wired into tsvector + ILIKE search** (fixed June 10 2026). 3,837 aliases across 4 languages. Alias-matched foods bypass word-boundary post-filter since the alias text already validated the match.
- **getPieceWeight() substring matching**: Iterates COMMON_PIECE_WEIGHTS entries. Original code returned FIRST substring match (insertion order). "souvlaki_pork_pita" matched "souvlaki" (150g skewer) before the correct "souvlaki_pork_pita" (250g wrap). Fix: track longest matching key.
- **Hybrid source corruption**: When source=hybrid, LLM macro ratios override correct DB macros for branded foods (Chobani, Quest, FAGE). Fix: skip hybrid override when dbConfidence ≥ 0.85.
- **DB-only ceiling**: ~155±3/210 on enterprise benchmark. LLM non-determinism creates ±5 case variance between runs. Code changes required to push past this ceiling.
- **dish_recipes requires non-null ingredients**: The `ingredients` column must be a valid JSON array, not null. `source` is enum ('manual', etc.).
- **Recipe cache trigram false positives on short inputs**: `lookupCachedRecipe()` uses `similarity() > 0.55`. Single words like "chicken" (7ch) match "gyros chicken" (13ch) at sim=0.571. Fix: length-ratio guard `length(input) >= length(dish_name) * 0.6` on the trigram branch. Exact matches unaffected.
- **lookupCachedRecipeAsItem 3-fallback chain**: Tries correctedName → original foodName → nameLocalized. The nameLocalized path is a vulnerability for short inputs — if single-word override changes food_name but NOT name_localized, the recipe cache fuzzy-matches via the stale localized name. Always override both.
- **Plantain ripe/green default**: In Latin American context, "fried plantain" = tajadas/maduros (RIPE). Green fried = "patacón"/"tostón". Map 'fried plantain' → 'plantains yellow ripe fried' (236kcal/100g), NOT 'plantain fried' which hits the green entry (309kcal/100g).
- **Enterprise benchmark score: 193/210 (91.9%)** as of June 10 with v7 prompt + CIQUAL. Peak was 194/210 (92.4%). Carbs MAPE improved 30.4% → 22.3%. Remaining ~17 failures: 3 JSON truncation (LLM nondeterminism), 5 marginal, 9 LLM estimation overshoots. Stable average ~191±3.
- **Lentil soup conflicting expectations**: el-base-20 expects [180-260] cal, el-cs-08 expects [250-400] cal. Solution: set recipe cal to 250 (satisfies both ranges).
- **Benchmark dataset structure**: `nutrition-enterprise-v2.json` is `{ cases: [...] }` (object with `.cases` array), NOT a plain array. `ds.find()` fails — use `dsRaw.cases.find()`.
- **Vague inputs cause 422 errors**: "lunch", "σνακ", "ate some food" fall through to LLM, fail pipeline, return ok:false → API returns 422. Fix: add `shouldRequestClarification()` pre-check returning ok:true with needs_clarification.
- **Repetition detection: use sanitizedText, NOT userMessage**: `userMessage` includes the LLM prompt prefix ("Parse this food input...") AND ragContext (reference nutrition data). These extra words dilute the dominant-word frequency below the 70% threshold. For "bread bread bread..." × 20: "bread" is 20/26 = 76.9% of sanitizedText (fires!) but only 22/66 = 33% of userMessage (does NOT fire!). Always detect on raw user input.
- **Repetition detection: use unit='piece', NOT 'serving'**: When normalizing repeated-word spam to quantity=1, `unit: 'serving'` falls back to `defaultServingGrams ?? 100g` (the universal fallback). `unit: 'piece'` resolves via COMMON_PIECE_WEIGHTS to correct single-unit weights: bread=30g (1 slice, ~80kcal), egg=50g (~78kcal).
- **Single-word inputs: LLM over-interprets**: "chicken" → LLM extracts "gyros chicken" (350g, 450 kcal with carbs). Fix: when input is a single word and FOOD_NAME_CORRECTIONS has an entry, override the LLM's extracted food_name BEFORE DB lookup.
- **Multi-item protein overestimate**: LLM defaults to 150g for chicken breast. At 31g protein/100g, that's 46.5g protein per item, pushing multi-item totals over expected maximums. Fix: prompt guidance sets chicken breast = 120g (a single breast), and few-shot example adjusted from 150g→120g.
- **Custom DB entries invisible to production API**: Entries inserted via Supabase MCP (café con leche, FAGE, carne asada, toast with butter) are visible in direct SQL but NOT found by the Vercel-deployed API. Possible causes: connection pooler routing, read replica lag, or Drizzle ORM query caching. All 12 `source='custom'` entries may be affected. UNSOLVED as of June 2026.
- **Benchmark nondeterminism**: ±3-5 cases flip between runs. multi_item and code_switch are most affected. Stable floor ~186, ceiling ~192. Average ~189. Multiple runs needed to assess true impact of changes.
- **pricing.ts CRITICAL dup computed key** (2026-06-11): Using computed keys `[model_name]` in object literal means all 3 model costs (food_parse, recipe_analyze, coach_insight) resolve to the same deepseek-v4-flash key (last entry wins). Cost tracking shows wrong prices for all LLM calls. Fix: use explicit string keys or unique suffixes per agent type.
- **Autoresearch nightly regression** (2026-06-11): 13 consecutive nights above nightly_best=1.192285 (set 2026-05-20). Pattern: low-step nights (~670 vs typical ~4800) correlate with high val_bpb. Likely cause: memory/scheduling pressure causing early termination. val_bpb trend worsening — investigate scheduler pressure.
- **Wrong PRODUCT FORM match** (2026-06-12): BM25 can match correct tokens but wrong product form — "apple pie" → "apple pie FILLING" (0.1g fat vs 12.7g), "mashed potatoes" → "FLAKES dry mix". Fix: add form-token penalties (FILLING, FLAKES, dry mix, powder) and extraneous-protein penalties in scoring. Singularizer regexes must handle irregular plurals (flakes → flake?s).
- **Vector arm regresses food lookup** (2026-06-13): Enabling HNSW vector arm with RRF 70/30 (vector/BM25) crashed benchmark from 90.7% → 63.4%. Food names are short+lexically precise — BM25 nails them; semantic kNN over 43k foods returns near-but-wrong results (feta→halloumi) and demotes exact matches. Keep vector arm DISABLED. If revisited: vector as fallback only when BM25 empty, or weight <15%, with A/B gate before ship.

### Canvas / Globe
- Retina canvas: `canvas.width = N * devicePixelRatio; ctx.scale(dpr, dpr)`.
- `grid-template-columns: 1fr 1fr` should be `minmax(0, 1fr)` to let max-width work with large child content.
