# Architecture

High-level map of how Trophē v0.3 fits together. For per-agent LLM details see `agents/README.md`. For deploy+env setup see `DEPLOYMENT.md`. For threat model see `SECURITY.md`.

_Last updated: 2026-05-03_

---

## Stack

| Layer | Technology |
|-------|------------|
| **Web** | Next.js 16.2 App Router, React 19, TypeScript strict, Tailwind CSS 4, Framer Motion |
| **Auth** | Supabase Auth + `@supabase/ssr` — HTTP-only cookie sessions, server-readable |
| **Database** | Supabase Postgres (cloud, production) + Supabase CLI local stack on OrbStack @ `127.0.0.1:54322` (dev) |
| **ORM** | Drizzle ORM + Drizzle Kit — versioned migrations in `drizzle/`, schema in `db/schema/` |
| **API layer** | tRPC v11 (internal coach UI) + REST `/api/v1/*` (external / webhooks) |
| **LLM router** | `agents/router/` — task-based model selection: parse→Gemini Flash, recipe→Haiku 4.5, coach→Sonnet 4.6 |
| **Embeddings** | Voyage v4 (`voyage-3-large`, 1024-dim) via `scripts/ingest/embed-foods.ts` |
| **Observability** | Langfuse self-hosted @ `localhost:3002` — OTel GenAI semconv per span |
| **Computer Vision** | MediaPipe Pose (browser WASM, 33 landmarks, 30+ FPS) for AI Form Check |
| **Wearables** | Spike API — Apple Health, Whoop, Oura, Strava, Garmin, Fitbit via single integration |
| **Testing** | Vitest 4 + `@vitest/coverage-v8` |
| **CI** | GitHub Actions (typecheck + lint + unit + RLS + Playwright + DB verification + food-parse accuracy) |
| **Hosting** | Vercel (production `https://trophe.app`; deploys from `main`) |

---

## Deployment surface

Production governance: `main` is the production branch. Vercel auto-deploys on push. v0.3-overhaul was merged 2026-05-03 and archived.

AI cost governance: `agent_runs` is the trusted table for cost and LLM observability. `api_usage_log` remains legacy compatibility only.

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
             │ Anthropic │  │  Gemini   │                │  Spike API   │
             │ (Sonnet/  │  │  2.5 Flash│                │  (wearables) │
             │  Haiku)   │  └───────────┘                └──────────────┘
             └───────────┘
                    │
                    ▼
             ┌───────────┐
             │ Langfuse  │  (self-hosted, localhost:3002 in dev)
             │ (traces)  │
             └───────────┘
```

---

## Auth flow (v0.3 — cookie-based SSR)

`@supabase/ssr` replaced the v0.2 localStorage approach. Sessions now live in **HTTP-only cookies**, readable by middleware and server components.

```
1. User submits login form
   → app/auth/login/page.tsx calls lib/supabase/browser.ts (createBrowserClient)

2. Cookie set in response
   → supabase/ssr automatically refreshes the cookie on each response via middleware

3. Middleware (proxy.ts) reads the cookie
   → lib/supabase/middleware.ts creates a server client against request.cookies
   → lib/auth/require-role.ts checks profile.role:
       /coach/*   requires role ∈ {coach, both, admin, super_admin}
       /admin/*   requires role ∈ {admin, super_admin}
       /super/*   requires role = super_admin
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

## Data model (v0.3 — 30+ tables)

### Core
| Table | Purpose |
|-------|---------|
| `profiles` | Identity + role + locale (1:1 with `auth.users`) |
| `client_profiles` | Body stats, goals, macro targets, coaching phase |
| `food_log` | Every logged food — includes `food_id FK → foods`, `qty_g`, `parse_confidence` |
| `foods` | Canonical food database (7,918 USDA + 30 HHF + 76 restaurant chains). `kcal_per_100g`, `protein_g`, `carb_g`, `fat_g`, `embedding vector(1024)`, `search_text tsvector` |
| `dish_recipes` | Cached composite dish decompositions (38 recipes). LLM decomposes on miss, caches for next lookup |
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
| `food_parse` | Google | Gemini 2.5 Flash | Cheapest structured output; ~$0.05/active-day vs $0.40 |
| `recipe_analyze` | Anthropic | Haiku 4.5 | Prompt-cached system prompt; fast |
| `coach_insight` | Anthropic | Sonnet 4.6 | Needs reasoning over week of data |
| `embed` | Voyage | voyage-large-2 | 1024-dim, MTEB 67, consistent with OpenBrain |

### Food parse pipeline (v0.3 deterministic)
**Old (v0.2)**: LLM emitted invented macro numbers → ~81% accuracy.
**New (v0.3)**: LLM identifies `{food_name, qty, unit}` only. `agents/food-parse/lookup.ts` does pgvector + pg_trgm hybrid retrieval → `foods` table supplies macros. Macros computed as `grams * food.kcal_per_100g / 100`. **LLM never sees a number.** Target: ≥95% accuracy on Nikos golden set.

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

Routers: `clients`, `coach`, `food`, `memory`. React Query v5 provider wraps the app. Coach pages fetch via tRPC hooks; REST routes remain as thin adapters.

---

## Theme + design system (Handoff v2)

- `app/globals.css` — CSS custom properties on `:root` (dark default). Key tokens: `--bg`, `--t1..t5`, `--gold-300`, `--line`, `--surface`, `--font-mono`
- Utility classes: `.card`, `.card-g`, `.card-r`, `.av`, `.av-lg`, `.eye`, `.eye-d`, `.mb-track`, `.mb-fill`, `.row-b`, `.row-i`, `.ds-sub`, `.hs-dot-on/warn/off`
- Icon sprite: `public/sprite.svg` — 56 SVG icons, consumed via `<Icon name="i-*" size={N} />`
- Bottom nav: `components/ui/BotNav.tsx` — 4 tabs, client nav vs coach nav, active highlight via `usePathname`

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
  proxy.ts            # Next.js middleware (renamed from middleware.ts in v0.3)
  .env.local.example
```

---

## Key invariants

1. **No `.single()` on Supabase queries** — always `.maybeSingle()`.
2. **All dates use local timezone** via `lib/dates.ts` (`localToday`, `localDateStr`). UTC caused day-boundary bugs.
3. **All AI routes cap input** at 500 chars (food-parse) / 4000 chars (recipe-analyze) + strip control chars.
4. **Routes return errors via `NextResponse.json({error}, {status})`** — never leak stack traces.
5. **Supabase service role key is server-only** (no `NEXT_PUBLIC_` prefix).
6. **LLM never emits macro numbers** (v0.3 food pipeline) — all nutrition values come from `foods` table.
7. **Mobile-first**: design + verify at 390×844 (iPhone 14 Pro) before desktop.
8. **Never push to `main` during v0.3 development** — all work on `v0.3-overhaul` branch until Phase 9 cutover.
