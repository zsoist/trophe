# τροφή (Trophē) — AI Agent Project Brief

> **Read this first.** This file is the primary context document for AI coding agents (Claude Code, Codex, Cursor). For the comprehensive operator handoff see `CODEX.md`.

_Last synced to codebase: 2026-05-01 — v0.3-overhaul branch_

---

## Stack (ground truth)

| Layer | Technology |
|-------|-----------|
| **Web** | Next.js 16.2.2 App Router · React 19.2.4 · TypeScript strict |
| **Styling** | Tailwind CSS 4 · Framer Motion 12 · Lucide icons |
| **Auth** | `@supabase/ssr` 0.10 — HTTP-only cookie sessions (NOT localStorage) |
| **Database** | Supabase Postgres (production) + local `open_brain_postgres` @ `127.0.0.1:5433` (dev) |
| **ORM** | Drizzle ORM + Drizzle Kit — schema in `db/schema/`, migrations in `drizzle/` |
| **API** | tRPC v11 (coach UI) + REST `/api/*` (public / webhooks) |
| **AI** | LLM router (`agents/router/`) — Gemini 2.5 Flash (food-parse) · Haiku 4.5 (recipe) · Sonnet 4.6 (coach insights) |
| **Embeddings** | Voyage v4 `voyage-large-2` 1024-dim via `scripts/ingest/embed-foods.ts` |
| **Observability** | Langfuse self-hosted @ `localhost:3002` — OTel GenAI semconv per span |
| **Computer Vision** | MediaPipe Pose (browser WASM, 33 landmarks, 30+ FPS) for AI Form Check |
| **Wearables** | Spike API — Apple Health, Whoop, Oura, Strava, Garmin, Fitbit |
| **Testing** | Vitest 4 + `@vitest/coverage-v8` |
| **CI** | GitHub Actions (typecheck + lint + test + rls + role-gate + food-parse accuracy) |
| **Hosting** | Vercel — production `trophe-mu.vercel.app` |

---

## Project state (2026-05-01)

**Branch**: `v0.3-overhaul` (all development here; `main` = production, no direct commits)
**Production**: `https://trophe-mu.vercel.app` — live with 5+ testers (Michael, Nikos, Daniel, Daniela, Dimitra, Alex)

Phases 0–8 complete and green locally. Phase 9 (production cutover from Supabase Postgres to local Postgres) is **operator-gated** — not triggered yet.

### What IS running in production (on Supabase Postgres)
- Auth, all 19 original tables, RLS, food logging, coach dashboard, workouts, supplements, habits
- AI food-parse (Haiku 4.5 via `/api/food/parse`), photo-analyze, meal-suggest, recipe-analyze
- AI Form Check (MediaPipe, browser-only, no server)
- All analytics components, trilingual UI (EN/ES/EL)

### What is on v0.3-overhaul branch only (NOT yet in production)
- Drizzle ORM + versioned migrations (`drizzle/`)
- 4-tier role enum (`super_admin|admin|coach|client`) — organizations table
- `@supabase/ssr` HTTP-only cookie auth (Phase 2)
- LLM router (Gemini Flash + Langfuse traces)
- `foods` canonical DB + `food_unit_conversions` (the accuracy fix)
- Memory system (`memory_chunks`, `coach_blocks`)
- Spike wearable layer
- tRPC v11
- Handoff v2 UI (new `components/ui/`, `app/globals.css` primitives)
- `proxy.ts` (middleware renamed)

---

## Critical file map

### AI / Agents (new in v0.3)
```
agents/
  router/index.ts + policies.ts      # task → model selection
  clients/anthropic.ts + google.ts   # thin API wrappers
  observability/langfuse.ts + otel.ts
  memory/read.ts + write.ts + coach-blocks.ts
  food-parse/index.ts                # LLM identifies only (no macro numbers)
  food-parse/lookup.ts               # pgvector + pg_trgm hybrid retrieval
  recipe-analyze/index.ts
  insights/wearable-summary.ts
  evals/run-all.ts + multi-layer/
  prompts/food-parse.v3.md           # ALWAYS bump version on prompt changes
  schemas/                           # input/output types per agent
```

### Database (v0.3 Drizzle)
```
db/
  schema/                            # one .ts file per domain (30+ tables)
  client.ts                          # pg.Pool + drizzle() wrapper
  queries/                           # typed query helpers
drizzle/                             # versioned migration SQL (0000…0006)
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
proxy.ts                            # Next.js middleware (renamed from middleware.ts)
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
lib/i18n.tsx                        # Trilingual dictionary + useI18n() hook (600+ lines)
lib/types.ts                        # TypeScript interfaces (Supabase schema)
lib/dates.ts                        # localToday(), localDateStr() — always local timezone
lib/meal-score.ts                   # Meal quality 0–100 (A/B/C/D)
lib/api-guard.ts                    # Per-user + per-IP rate limiting
lib/api-cost-logger.ts              # Anthropic + Gemini cost tracking
lib/food-units.ts                   # Legacy unit conversions (v0.3: thin wrapper)
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
| `/api/food/parse` | POST | Gemini Flash | `guardAiRoute` | NLP text → `{food_name, qty, unit}[]` |
| `/api/food/recipe-analyze` | POST | Haiku 4.5 | `guardAiRoute` | Recipe text → per-ingredient + totals |
| `/api/food/search` | GET `?q=` | — | sanitized | USDA FoodData Central (350K+ foods) |
| `/api/food/local-search` | GET `?q=` | — | anon key | Local Supabase food DB |
| `/api/ai/photo-analyze` | POST | Haiku 4.5 | `guardAiRoute` | Photo → food identification |
| `/api/ai/meal-suggest` | POST | Gemini | `guardAiRoute` | 12 meal suggestions within macros |
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

## Middleware routing (proxy.ts)

`proxy.ts` (Next.js middleware, runs before every request):
- Creates server Supabase client from `request.cookies` via `lib/supabase/middleware.ts`
- Calls `getUser()` (not `getSession()` — re-validates JWT against auth server)
- Enforces role routing:
  - `/coach/*` → role ∈ `{coach, both, admin, super_admin}` required
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

- Languages: `en | es | el` (English · Spanish · Greek)
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
- `api_usage_log` table tracks token + cost per AI call (Anthropic + Gemini)

---

## LLM / AI rules

1. **LLM router** (`agents/router/index.ts`) selects model per task — do NOT hardcode models in agents.
2. **LLM never emits macro numbers** in food-parse (v0.3) — it identifies `{food_name, qty, unit}` only; `lookup.ts` fetches macros from `foods` table.
3. **Prompt versioning**: prompts live in `agents/prompts/<agent>.v<N>.md`. NEVER edit in place — copy to `vN+1.md`, update import in agent `index.ts`, ship. Keeps rollback to a one-line revert.
4. **Prompt caching**: `cacheSystem: true` in `anthropic.ts` wraps system block with `cache_control: ephemeral`. Prefix must be ≥2048 tokens. ~70% cost reduction on burst calls.
5. **Every `run()` returns `telemetry`** — routes must pass it to `logAPIUsage`.
6. **Input caps**: food-parse 500 chars · recipe-analyze 4000 chars. Strip `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]` from all AI inputs.
7. **`agents/evals/` CI gate**: food-parse accuracy ≥95% on Nikos golden set (was 81%, now deterministic via `lookup.ts`).

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

Local DB: `postgresql://brain_user:CHANGEME@127.0.0.1:5433/trophe_dev`
Note: **use `127.0.0.1` not `localhost`** — macOS resolves `localhost` to `::1` first; Docker container only binds IPv4.

---

## Deploy

```bash
# Local dev (unlimited, fast)
npm run dev              # http://localhost:3000

# Before every production deploy
npm run typecheck && npm run lint && npm test && npm run build

# Production deploy (from v0.3-overhaul)
git push origin v0.3-overhaul
vercel --yes --prod
```

- Production: `https://trophe-mu.vercel.app`
- GitHub: `zsoist/trophe`
- **ALWAYS `--prod`**: env vars are scoped to Production only in Vercel; preview builds fail without them.
- **Max 3 production deploys per session** — local preview catches most issues.
- Rollback: Vercel dashboard → Deployments → older deploy → "Promote to Production" (~30s).

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

| Name | Email | Password | Role |
|------|-------|----------|------|
| Michael Kavdas | michael@kavdas.com | trophe2026! | coach |
| George Kavdas | george@kavdas.com | trophe2026! | coach |
| Dimitra Kavdas | dimitra@kavdas.com | trophe2026! | client (Greek) |
| Daniel Reyes | daniel@reyes.com | trophe2026! | both |
| Nikos | nikos@biorita.com | trophe2026! | both |
| Daniela | daniela@trophe.app | trophe2026! | both |
| Alex Katsanas | alex@katsanas.com | trophe2026! | client |

---

## Pitfalls (hard-won)

### Auth
- `@supabase/ssr` IS installed and in use. Sessions in HTTP-only cookies, NOT localStorage. Don't revert to localStorage pattern.
- Always call `getUser()` not `getSession()` — `getSession()` doesn't re-validate against auth server.
- middleware lives in `proxy.ts` (not `middleware.ts`) — Next.js 16 convention.
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
- Vercel env vars are Production-only → preview deploys fail without explicit Preview scope.
- CSP: use explicit `https://iwbpzwmidzvpiofnqexd.supabase.co`, NOT `*.supabase.co` (wildcard breaks mobile).
- Pre-deploy: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|pa-)'` must be empty.
- Git identity for Vercel: `zsoist` / `zsoist@users.noreply.github.com`.

### Drag-and-drop
- HTML5 drag API works on desktop + iPad, NOT mobile touch. Use `onTouchStart/Move/End` for touch.
- `e.preventDefault()` on `onDragOver` is required or `onDrop` never fires.

### Canvas / Globe
- Retina canvas: `canvas.width = N * devicePixelRatio; ctx.scale(dpr, dpr)`.
- `grid-template-columns: 1fr 1fr` should be `minmax(0, 1fr)` to let max-width work with large child content.
