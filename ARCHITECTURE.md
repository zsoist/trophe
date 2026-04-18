# Architecture

High-level map of how Trophē's pieces fit together. For per-agent LLM details, see `agents/README.md`. For deploy+env setup, see `DEPLOYMENT.md`. For threat model, see `SECURITY.md`.

## Stack

- **Web**: Next.js 16.2 App Router, React 19, TypeScript strict, Tailwind CSS 4, Framer Motion
- **Auth + DB**: Supabase (Postgres + Auth + Storage + RLS); `@supabase/supabase-js` v2 (localStorage sessions)
- **LLM**: Anthropic Claude Haiku 4.5 (food parsing, recipe analysis, photo analysis) via Messages API with prompt caching
- **LLM (alt)**: Google Gemini 2.0 Flash (meal suggestions — cheaper for creative text)
- **Computer Vision**: MediaPipe Pose (browser WASM, 33 landmarks at 30+ FPS) for AI Form Check
- **Testing**: Vitest 4 + `@vitest/coverage-v8`
- **CI**: GitHub Actions (typecheck + lint + unit)
- **Hosting**: Vercel (production) — `trophe-mu.vercel.app`
- **Observability**: Langfuse self-hosted (OTEL traces); scheduled v0.2

## Deployment surface

```
┌──────────────┐   HTTPS    ┌──────────────┐   direct    ┌─────────────┐
│  iOS / Web  │ ─────────→ │   Vercel    │ ──────────→ │  Supabase   │
│  (PWA)      │            │   Next.js   │             │  Postgres   │
└──────────────┘            │   16        │             │  + Auth     │
                            └──────┬──────┘             │  + Storage  │
                                   │                    └─────────────┘
                                   │  /api/food/parse
                                   │  /api/food/recipe-analyze
                                   │  /api/food/photo
                                   │  /api/meals/suggest
                                   ▼
                            ┌─────────────┐
                            │  Anthropic  │
                            │  Gemini     │  (external LLM providers)
                            └─────────────┘
```

## Auth flow

Supabase JS v2 stores sessions in **localStorage, not cookies** (critical pitfall — see CLAUDE.md). This means:

1. Signup/login — client-side `supabase.auth.signUp/signInWithPassword` writes session to `localStorage`
2. All DB reads/writes — client-side `supabase.from(...)` sends the session token in `Authorization` header
3. RLS policies on Postgres tables enforce per-user + per-role access
4. **Middleware cannot authenticate** — it only sees cookies. Auth is verified via client-side role guards on each protected page + RLS at the DB

After signup, `role` column on `profiles` determines routing:
- `client` → `/dashboard`
- `coach` → `/coach`
- `both` → `/coach` (with client-view toggle)

Admin access is a server-side guard in `app/admin/layout.tsx` that verifies the Supabase JWT against `TROPHE_ADMIN_EMAILS` using the service role key.

## Data model (19 tables)

**Core**:
- `profiles` — user identity + role + locale (1:1 with `auth.users`)
- `client_profiles` — body stats, goals, macro targets (1:1 with profile where role=client)
- `food_log` — every logged food entry (user_id, date, meal_type, food_name, macros, source)
- `habit_checkins` — daily habit completion log
- `measurements` — weight + body fat tracking

**Coaching**:
- `habits` — habit template library (trilingual: name_en/es/el)
- `client_habits` — assigned habits with sequence + streak
- `coach_notes` — per-client notes by category (check_in, message, concern, progression)
- `supplements_protocols` + `supplements_items` — nutritionist-authored stacks
- `workout_templates` + `workout_sessions` + `workout_sets`

**AI**:
- `form_analyses` — MediaPipe Form Check results (per-exercise scoring)
- `api_usage_log` — per-endpoint LLM cost + token + latency tracking

RLS: Every client-accessed table enforces `auth.uid() = user_id` or `auth.uid() IN (SELECT coach_id FROM client_profiles WHERE user_id = row.user_id)` for coach access. Zero SQL runs without RLS.

## LLM surface (`/agents/` pattern — April 18)

All LLM-backed features are organized as agents with a consistent contract:

```
agents/
  prompts/<agent>.<version>.md     # versioned prompt templates (git-diffable)
  clients/
    anthropic.ts                   # Messages API wrapper with cache_control
  schemas/<agent>.ts               # input/output types + validators
  <agent>/
    index.ts                       # run() — the only export routes call
    extract.ts                     # LLM-output parsing
    enrich.ts                      # local-DB canonicalization
```

**Contract** (every agent's `run(input)`):
```ts
Promise<{
  ok: boolean;
  output?: AgentOutput;
  error?: string;
  telemetry: {
    model, version,
    tokensIn, tokensOut,
    cacheCreationTokens, cacheReadTokens,
    latencyMs, rawStatus
  };
}>
```

Routes become thin adapters:
```
1. validate input
2. result = await agent.run(input)
3. logAPIUsage(result.telemetry)
4. return result.output
```

Food-parse route shrank 258 LOC → 51 LOC through this refactor.

### Prompt caching

All agents pass `cacheSystem: true` to `callAnthropicMessages()`. This wraps the system prompt in Anthropic's `cache_control: { type: 'ephemeral' }` block. The stable prefix (rules, USDA values, FOOD_DATABASE reference ~3-5K tokens) is cached server-side for ~5 minutes. Subsequent calls within that window bill cached tokens at ~10% of normal input cost.

Telemetry captures `cache_creation_input_tokens` (first-call miss) and `cache_read_input_tokens` (subsequent hits) so we can observe cache hit rate per endpoint once Langfuse is wired in Wave C.

## Theme system

- `app/globals.css` defines CSS custom properties on `:root` (dark default) and `.light` overrides
- `components/ThemeMode.tsx` applies `.light` or `.dark` class to `<html>` + persists to `localStorage.trophe_theme_mode`
- `app/layout.tsx` has an inline pre-paint script that reads localStorage and applies the class BEFORE React hydrates — prevents flash of wrong theme
- **Invariant**: themed surfaces (page shells, cards, text) must use CSS variables OR `.glass`/`.glass-elevated` utility classes, NEVER raw `bg-stone-9xx` or `text-white`. ESLint rule enforces this on `app/dashboard/**` + `app/onboarding/**`

## Folder layout

```
trophe/
  agents/           # LLM surface (see above)
  app/              # Next.js App Router pages + API routes
    api/
      food/{parse, recipe-analyze, photo, search}/route.ts
      meals/suggest/route.ts
    dashboard/      # client-facing pages
    coach/          # coach-facing pages
    admin/          # admin-only (guarded server-side)
  components/       # 117 React components (65 base + 52 coach)
  lib/              # pure business logic (nutrition, food units, meal scoring, i18n, etc.)
  tests/            # Vitest unit tests
  supabase/         # SQL migrations (scheduled Sunday)
  scripts/          # one-off Node scripts (seed, maintenance)
  .github/workflows/ci.yml
  public/           # static assets, PWA manifest
```

## Key invariants

1. **No `.single()` on Supabase queries** — always `.maybeSingle()`. Avoids crashes on legitimate empty results.
2. **All dates use local timezone** via `lib/dates.ts` (`localToday`, `localDateStr`). UTC caused day-boundary bugs.
3. **All AI routes cap input at 500 chars (food-parse) / 4000 chars (recipe-analyze)** and strip control chars to prevent prompt injection.
4. **Routes return server errors via `NextResponse.json({error}, {status})` — never leak stack traces.**
5. **Supabase service role key is server-only** (never shipped to client). Used for admin guard + server-side signup only.
6. **Mobile-first**: design + verify at 390×844 (iPhone 14 Pro) before desktop.
