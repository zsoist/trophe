# Architecture

High-level map of how Trophē v0.3 fits together. For per-agent LLM details see `agents/README.md`. For deploy+env setup see `DEPLOYMENT.md`. For threat model see `SECURITY.md`.

_Last updated: 2026-09-03_

---

## Stack

| Layer | Technology |
|-------|------------|
| **Web** | Next.js 16.2 App Router, React 19, TypeScript strict, Tailwind CSS 4, Framer Motion |
| **Auth** | Supabase Auth + `@supabase/ssr` — HTTP-only cookie sessions, server-readable |
| **Database** | Supabase Postgres (cloud, production) + Supabase CLI local stack on OrbStack @ `127.0.0.1:54322` (dev) |
| **ORM** | Drizzle ORM + Drizzle Kit — versioned migrations in `drizzle/`, schema in `db/schema/` |
| **API layer** | tRPC v11 (internal coach UI) + REST `/api/v1/*` (external / webhooks) |
| **LLM router** | `agents/router/` — consumer text GPT-5.6 Luna → Claude Haiku 4.5; health context and vision Haiku 4.5; synthetic factory DeepSeek V4 Flash; Voyage-4 embeddings. |
| **Embeddings** | Voyage v4 (`voyage-4`, 1024-dim) via `scripts/ingest/embed-foods.ts` |
| **Observability** | Langfuse via `LANGFUSE_HOST` — OTel GenAI semconv per span |
| **Computer Vision** | MediaPipe Pose (browser WASM, 33 landmarks, 30+ FPS) for AI Form Check |
| **Wearables** | Spike API — Apple Health, Whoop, Oura, Strava, Garmin, Fitbit via single integration |
| **Testing** | Vitest 4 + `@vitest/coverage-v8` |
| **CI** | GitHub Actions (typecheck + lint + unit + RLS + Playwright + DB verification + food-parse accuracy) |
| **Hosting** | Vercel (production `https://trophe.app`; deploys from `main`) |

---

## Deployment surface

Production governance: `main` is the production branch. Vercel auto-deploys on push. v0.3-overhaul was merged 2026-05-03 and archived.

AI cost governance: `agent_runs` is the trusted table for cost and LLM observability. `api_usage_log` remains legacy compatibility only.

### Web delivery boundary

- Public routes, including `/`, do not mount the authenticated provider graph. Supabase, i18n, appearance, toast, and service-worker providers are mounted only by the `dashboard`, `coach`, `admin`, `super`, and `onboarding` layouts.
- The service worker is registered from authenticated layouts only. Because its scope is `/`, a previously authenticated browser can still be worker-controlled when it later visits a public route.
- `public/sw.js` is a generated production-build artifact and is not source-controlled. The current worker is a one-time migration/self-destruct worker: it purges retired caches and unregisters itself. Trophē is online-only; documents, RSC payloads, APIs, and Supabase traffic are network-delivered, with no application precache or runtime cache.
- The migration worker activates immediately to retire legacy caches, then unregisters itself; no later worker update or reload prompt is expected.

```
┌──────────────┐   HTTPS    ┌──────────────┐   direct    ┌─────────────────────┐
│  iOS / Web  │ ─────────→ │   Vercel    │ ──────────→ │  Supabase (cloud)   │
│  (PWA)      │            │   Next.js   │             │  Postgres + Auth    │
└──────────────┘            │   16        │             │  + Storage + RLS    │
                            └──────┬──────┘             └─────────────────────┘
                                   │
                    ┌──────────────┼──────────────────────────────┐
                    │              │                              │
                    ▼              ▼                              ▼
             ┌───────────┐  ┌───────────┐                ┌──────────────┐
             │  OpenAI   │  │ Anthropic │                │  Spike API   │
             │   Luna    │  │ Haiku 4.5 │                │  (wearables) │
             │(consumer) │  │health/vis.│                └──────────────┘
             └───────────┘  └───────────┘
                    │
                    ▼
             ┌───────────┐
             │ Langfuse  │  (self-hosted endpoint from LANGFUSE_HOST)
             │ (traces)  │
             └───────────┘
```

---

## Auth flow (v0.3 — cookie-based SSR)

`@supabase/ssr` replaced the v0.2 localStorage approach. Sessions now live in **HTTP-only cookies**, readable by the request proxy and server components.

```
1. User submits login form
   → app/auth/login/page.tsx calls lib/supabase/browser.ts (createBrowserClient)

2. Cookie set in response
   → supabase/ssr automatically refreshes the cookie on each response via the request proxy

3. `proxy.ts` reads the cookie and provides the coarse request gate
   → lib/supabase/middleware.ts creates a server client against request.cookies
   → lib/auth/require-role.ts checks profile.role:
       /coach/*   requires role ∈ {coach, admin, super_admin}
       /admin/*   requires role ∈ {admin, super_admin}
       /super/*   requires role = super_admin
       /api/admin/* and /api/seed/* require privileged auth
   → Unauthenticated → 302 to /login
   → Wrong role     → 302 to /dashboard

4. Server components / Route Handlers
   → lib/supabase/server.ts createSupabaseServerClient() reads cookies()
   → ALWAYS call getUser() not getSession() (re-validates against auth server)

5. RLS at Postgres
   → auth.uid() is set from the JWT in the cookie
   → All client-accessed tables enforce row-level security
```

**Role enum** (4-tier, `profiles.role`):
- `super_admin` — full access, Daniel only
- `admin` — org-level access, Kavdas team
- `coach` — assigned clients only
- `client` — own data only

---

## Data model (v0.3 — 55 public tables as of 2026-06-15)

### Core
| Table | Purpose |
|-------|---------|
| `profiles` | Identity + role + locale (1:1 with `auth.users`) |
| `client_profiles` | Body stats, goals, macro targets, coaching phase |
| `food_log` | Every logged food — includes `food_id FK → foods`, `qty_g`, `parse_confidence` |
| `foods` | Canonical food database (~42,952: OFF 21.8k, USDA 13.3k, CIQUAL 3.3k, CoFID 2.7k, BEDCA 751, CREA 714, custom 176, HHF 86, MenuStat 48, chain_co 28). `kcal_per_100g`, `protein_g`, `carb_g`, `fat_g`, `barcode`, `embedding vector(1024)`, `search_text tsvector` |
| `dish_recipes` | Cached composite dish decompositions (293 recipes). LLM decomposes on miss, caches for next lookup |
| `food_unit_conversions` | Deterministic gram anchors per food+unit. **This is the bug-fix table.** |
| `food_aliases` | Multilingual aliases for hybrid retrieval |
| `habit_checkins` | Daily habit completion (completed bool + mood + note) |
| `measurements` | Weight + body fat tracking |

### Coaching
| Table | Purpose |
|-------|---------|
| `habits` | Habit template library (trilingual: name_en/es/el) |
| `client_habits` | Assigned habits with sequence + streak |
| `coach_notes` | Per-client notes by category |
| `supplements_protocols` + `supplements_items` | Nutritionist-authored stacks |
| `workout_templates` + `workout_sessions` + `workout_sets` | Exercise tracking |
| `coach_blocks` | Letta-style editable memory blocks coaches write about clients |

### Organizations (multi-tenancy)
| Table | Purpose |
|-------|---------|
| `organizations` | Each coach auto-creates an org on signup |
| `organization_members` | user_id + org_id + role in org |
| `audit_log` | Immutable append-only log of sensitive mutations |

### Memory (Mem0/Letta hybrid)
| Table | Purpose |
|-------|---------|
| `memory_chunks` | `scope` (user/session/agent) + `fact_text` + `embedding` + `salience` + Letta supersedence chain |
| `agent_conversation` | Full turn history with token/cost accounting |
| `agent_runs` | Links Langfuse trace IDs to food_log rows for explainability |
| `raw_captures` | Incoming event firehose (OpenBrain pattern) |

### Wearables (Spike)
| Table | Purpose |
|-------|---------|
| `wearable_connections` | Provider OAuth tokens (pgcrypto encrypted) |
| `wearable_data` | Steps/HRV/sleep/workout/weight — indexed `(user_id, data_type, recorded_at desc)` |

**RLS invariant**: every client-accessed table enforces `auth.uid() = user_id` or coach roster check. Zero SQL runs without RLS.

## Local and CI truth table

| Concern | Ground truth |
|---|---|
| Schema installer | Drizzle migrations in `drizzle/` |
| Local runtime | Supabase CLI stack from `supabase/config.toml` |
| Local DB host rule | `127.0.0.1`, never `localhost` |
| RLS test role | `authenticated` via `SET LOCAL ROLE authenticated` |
| CI DB | pgvector Postgres service using the same bootstrap compatibility path |

---

## LLM surface (`/agents/` pattern)

### Router (`agents/router/`)
Declarative `taskPolicies` map selects provider+model per task:

| Task | Provider | Model | Rationale |
|------|----------|-------|-----------|
| `food_parse` / `recipe_analyze` / `meal_suggest` / `shopping_extract` | OpenAI | gpt-5.6-luna | Consumer structured text; Haiku 4.5 fallback |
| `coach_insight` / `memory_extract` | Anthropic | Haiku 4.5 | Health-context compliance lane |
| `photo_analyze` | Anthropic | Haiku 4.5 | Vision lane |
| `factory_generate` | DeepSeek | deepseek-v4-flash | Synthetic-only, governed telemetry |
| `embed` | Voyage | voyage-4 | 1024-dim, MTEB 67 |

### Food parse pipeline (v0.3 deterministic)
**Old (v0.2)**: LLM emitted invented macro numbers → ~81% accuracy.
**Current (v9 prompt on v4 pipeline architecture)**: LLM identifies foods, quantities, and units and provides secondary per-100g estimates. `agents/food-parse/lookup.ts` retrieves canonical records; explicit conversions and high-confidence DB macros remain authoritative. Explicitly stated nutrition-label facts override only the named nutrient after the food's portion is resolved and after physical/metabolic plausibility checks. Current validated benchmark (2026-06-15): 549-set ~90% pass; harder Greek-weighted 700-set 76.7% pass; pooled macro-MAPE 16.0% (post 2026-06-14 deterministic reduction, was 22.4%); v2 210-set ~94-95%. Cal MAPE ~17%, Fat MAPE ~25% (hardest macro). The ≥95% Nikos-golden-set target remains aspirational — not met on the harder sets; sub-10% MAPE requires fine-tuning + Michael-validated Greek ranges, not prompt/retrieval tweaks. The 700-case benchmark is on-demand only (no nightly cron, as of WP3).

### Observability
Every `agent.run()` is wrapped in a Langfuse generation span (via `agents/observability/langfuse.ts`) and emits OTel GenAI semconv attributes: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.response.finish_reasons`.

### Memory reads
At agent-call time, `agents/memory/read.ts` does kNN over scope-filtered `memory_chunks` and packs top-k facts into the system prompt within a token budget.

### Agent contract
```ts
Promise<{
  ok: boolean;
  output?: AgentOutput;
  error?: string;
  telemetry: { model, provider, tokensIn, tokensOut, latencyMs, langfuseTraceId };
}>
```

---

## tRPC layer (`lib/trpc/`)

Type-safe internal API for coach UI. Public REST stays at `/api/v1/*` for external partners + Spike webhooks.

Routers: `clients`, `coach`, `food`, `memory`. React Query v5 `TRPCProvider` is mounted in the authenticated `dashboard` and `coach` route layouts, not the root app. Coach pages fetch via tRPC hooks; REST routes remain as thin adapters.

---

## Theme + design system (Handoff v2)

- `app/globals.css` — CSS custom properties on `:root` (dark default). Key tokens: `--bg`, `--t1..t5`, `--gold-300`, `--line`, `--surface`, `--font-mono`
- Utility classes: `.card`, `.card-g`, `.card-r`, `.av`, `.av-lg`, `.eye`, `.eye-d`, `.mb-track`, `.mb-fill`, `.row-b`, `.row-i`, `.ds-sub`, `.hs-dot-on/warn/off`
- Icon sprite: `public/sprite.svg` — 56 SVG icons, consumed via `<Icon name="i-*" size={N} />`
- Bottom nav: `components/ui/BotNav.tsx` — route-aware equal-width destinations (five for the client), client nav vs coach nav, active highlight via `usePathname`
- Workout workspace: routed Home, Discovery, Detail, Build, Review, Live, History, Analytics, and Form Check surfaces share durable draft/live state without crossing the session boundary until the client explicitly starts a workout.
- Workout media: typed exercise-media and anatomical registries enforce exact exercise/equipment identity, controllable motion, reduced-motion posters, and honest fallbacks for uncovered exercises.

---

## Folder layout (v0.3)

```
trophe/
  agents/
    router/           # task→model policy routing
    clients/          # anthropic.ts, google.ts, openai.ts
    observability/    # langfuse.ts, otel.ts
    memory/           # read.ts, write.ts, coach-blocks.ts
    food-parse/       # index.ts (LLM-identify only), lookup.ts (deterministic)
    recipe-analyze/
    insights/         # wearable-summary.ts
    evals/            # run-all.ts, multi-layer/
    prompts/          # versioned .md prompt templates
    schemas/          # input/output types
  app/
    api/
      trpc/[trpc]/    # tRPC handler
      food/{parse,recipe-analyze,photo,search}/
      integrations/spike/{connect,callback,webhook}/
      auth/{callback,magic-link,oauth}/
    dashboard/        # client pages (Home, Log, Progress, Profile, Checkin, Workout, Supplements)
    coach/            # coach pages (Today, Clients, Client/:id, Client/:id/plan, Inbox, Profile)
    admin/            # admin-only (server-guarded)
    auth/             # login, magic-link pages
  components/
    ui/               # Icon, BotNav, + base primitives
    [feature]/        # coach/, dashboard/ etc.
  db/
    schema/           # one file per domain (profiles, food_log, foods, memory_chunks, …)
    client.ts         # Drizzle + pg.Pool
    queries/          # typed query helpers
  drizzle/            # versioned migration SQL (0001_organizations_and_roles.sql …)
  lib/
    supabase/         # browser.ts, server.ts, middleware.ts
    auth/             # get-session.ts, require-role.ts
    trpc/             # server.ts, router.ts, context.ts, client.ts
    spike/            # client.ts (REST wrapper)
    nutrition-engine.ts
    dates.ts
  scripts/
    ingest/           # usda.ts, openfoodfacts.ts, helth.ts, hhf-dishes.ts, embed-foods.ts
    db/               # bootstrap-local.sh
  tests/
    db/rls.test.ts
    auth/role-gate.test.ts
    agents/router.test.ts, food-parse.accuracy.test.ts, memory.test.ts
    spike/webhook.test.ts
  public/
    sprite.svg        # 56-icon SVG sprite
  drizzle.config.ts
  proxy.ts             # Next.js 16 request proxy (root; Supabase session + coarse auth gate)
  .env.local.example
```

---

## Key invariants

1. **No `.single()` on Supabase queries** — always `.maybeSingle()`.
2. **All dates use local timezone** via `lib/dates.ts` (`localToday`, `localDateStr`). UTC caused day-boundary bugs.
3. **All AI routes cap input** at 500 chars (food-parse) / 4000 chars (recipe-analyze) + strip control chars.
4. **Routes return errors via `NextResponse.json({error}, {status})`** — never leak stack traces.
5. **Supabase service role key is server-only** (no `NEXT_PUBLIC_` prefix).
6. **DB-grounded nutrition stays authoritative** — LLM estimates are secondary, while explicit user label facts may override only named nutrients after item-scoped plausibility checks.
7. **Mobile-first**: design + verify at 390×844 (iPhone 14 Pro) before desktop.
8. **Privileged route invariant** — `/api/admin/*`, `/api/seed/*`, and future privileged HTTP routes must be covered by proxy auth and route-level role guards.
