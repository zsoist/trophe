# τροφή (Trophē) — Comprehensive Codex Handoff

> **This is the single-source-of-truth document for AI agents, operators, and new contributors.**
> It reflects actual ground-truth state as of **2026-05-01, branch `v0.3-overhaul`**.
> For agent-specific coding rules see `CLAUDE.md`. For the architecture diagram see `ARCHITECTURE.md`.

---

## 1. What Is Trophē

**Precision Nutrition Coaching SaaS.** AI-first platform where professional nutritionists (coaches) manage athlete clients using Precision Nutrition's habit-based methodology. Built in Colombia+Athens, trilingual (EN/ES/EL), mobile-first.

**Core loop**: Coach assigns one habit → Client checks in daily for 14 days → Client logs food/workouts → Coach monitors behavioral intelligence → AI surfaces insights and risks.

**Business model**: SaaS per coach (B2B). Clients are free. AI cost target <$2/month/coach.

**Vision (Michael Kavdas, co-founder)**: Per-client AI agents with persistent memory. Distill nutritionist decisions into a model → eventually "AI IS the nutritionist." East + West medicine synthesis.

---

## 2. Production State

### Live (production `trophe-mu.vercel.app` on Supabase Postgres)

| Feature | Status |
|---------|--------|
| Auth (email/magic-link) | ✅ Live |
| Client dashboard (Home, Log, Progress, Profile, Workout, Supplements, Checkin) | ✅ Live |
| Coach dashboard + 30+ coach tools | ✅ Live |
| Food logging (text NLP, photo, voice, USDA search, paste) | ✅ Live |
| AI food-parse (Haiku 4.5, ~81% accuracy) | ✅ Live |
| AI recipe-analyze | ✅ Live |
| AI photo-analyze | ✅ Live |
| AI meal-suggest (Gemini) | ✅ Live |
| AI Form Check (MediaPipe WASM, browser-only) | ✅ Live |
| Habit engine (14-day cycles) | ✅ Live |
| Workout module (exercises, sets, PRs, pain flags) | ✅ Live |
| Supplement protocols | ✅ Live |
| Analytics (heatmap, adherence, patterns, monthly report) | ✅ Live |
| Trilingual UI (EN/ES/EL) | ✅ Live |
| Testers active | 5–7 (Michael, Nikos, Daniel, Daniela, Dimitra, Alex) |

### v0.3-overhaul branch (NOT yet in production)

| Feature | Status |
|---------|--------|
| Drizzle ORM + versioned migrations | ✅ Built, local only |
| 4-tier role enum + organizations | ✅ Built, local only |
| `@supabase/ssr` HTTP-only cookie auth | ✅ Built, local only |
| LLM router (Gemini Flash + Haiku + Sonnet) | ✅ Built, local only |
| Langfuse OTel traces | ✅ Built, local only |
| `foods` canonical DB + deterministic accuracy fix | ✅ Built, local only |
| Memory system (Mem0/Letta hybrid) | ✅ Built, local only |
| Spike wearable layer | ✅ Built, local only |
| tRPC v11 | ✅ Built, local only |
| Handoff v2 UI (new design system) | ✅ Built, local only |
| Food ingest scripts (USDA, OFF, HHF) | ✅ Scripts ready |
| Phase 9 prod cutover | ⬜ Operator-gated |

---

## 3. Repository & Infrastructure

| Item | Value |
|------|-------|
| **GitHub** | `zsoist/trophe` (private) |
| **Vercel project** | `trophe` → `trophe-mu.vercel.app` |
| **Vercel org** | `zsoist` |
| **Git identity** | `zsoist` / `zsoist@users.noreply.github.com` |
| **Active branch** | `v0.3-overhaul` |
| **Production branch** | `main` (no direct commits during v0.3) |
| **Preview URL** | auto-generated from `v0.3-overhaul` pushes |
| **CI** | GitHub Actions `.github/workflows/ci.yml` — typecheck + lint + vitest + rls + role-gate |
| **Local DB** | `open_brain_postgres` Docker @ `127.0.0.1:5433` (NOT localhost — macOS IPv6 binding) |
| **Supabase project** | `iwbpzwmidzvpiofnqexd` (`https://iwbpzwmidzvpiofnqexd.supabase.co`) |
| **Langfuse** | self-hosted `localhost:3002` (dev only) |

---

## 4. Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Prod + local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod + local | Client-side Supabase key (RLS-bound, safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod only | Server-only full-DB access. **NEVER `NEXT_PUBLIC_`** |
| `DATABASE_URL` | Local dev only | `postgresql://brain_user:...@127.0.0.1:5433/trophe_dev` |
| `ANTHROPIC_API_KEY` | Prod + local | Haiku 4.5 (recipe-analyze, photo) + Sonnet 4.6 (coach insights) |
| `GEMINI_API_KEY` | Prod + local | Gemini 2.5 Flash (food-parse, meal-suggest) |
| `VOYAGE_API_KEY` | Prod + local | Voyage v4 `voyage-large-2` embeddings |
| `LANGFUSE_PUBLIC_KEY` | Local | Langfuse tracing public key |
| `LANGFUSE_SECRET_KEY` | Local | Langfuse tracing secret key |
| `LANGFUSE_HOST` | Local | `http://127.0.0.1:3002` |
| `USDA_API_KEY` | Optional | Falls back to DEMO_KEY (30 req/hr). Register before beta. |
| `SPIKE_API_KEY` | Phase 6 | Spike wearable integration |
| `SPIKE_WEBHOOK_SECRET` | Phase 6 | HMAC verification for Spike webhooks |
| `TROPHE_ADMIN_EMAILS` | Legacy | Replaced by role enum in Phase 1. Keep for backward compat. |

**Security**: `.env.local` is in `.gitignore`. Pre-deploy grep: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|pa-)'` must be empty.

---

## 5. Architecture

### Request lifecycle (v0.3)

```
Browser → Vercel Edge
  → proxy.ts (Next.js middleware)
    → lib/supabase/middleware.ts → getUser() → role check
    → Unauthenticated: 302 /login
    → Wrong role: 302 /dashboard
  → Next.js App Router
    → Server Component: lib/supabase/server.ts → reads cookies()
    → Route Handler: lib/auth/require-role.ts (second layer)
    → Client Component: lib/supabase/browser.ts
  → Supabase Postgres (RLS: auth.uid() = user_id)
```

### LLM pipeline (food-parse, v0.3 deterministic)

```
User types "200g feta, 1 banana"
  → /api/food/parse → agents/food-parse/index.ts
    → agents/router/index.ts picks Gemini 2.5 Flash
    → LLM returns {food_name:"feta cheese", qty:200, unit:"g"} (NO macros)
    → agents/food-parse/lookup.ts:
        1. tsvector keyword filter (pg_trgm)
        2. cosine kNN on embedding (pgvector, 1024-dim)
        3. metadata rerank
        → returns food_id + grams_per_unit from foods table
    → macros computed: grams × kcal_per_100g / 100 (deterministic)
    → Langfuse generation span created
    → food_log.food_id FK set, food_log.qty_g set
```

### Memory reads (agents)

```
agent.run(input)
  → agents/memory/read.ts
    → kNN over memory_chunks WHERE scope = 'user' AND user_id = auth.uid()
    → top-k facts packed into system prompt (token budget enforced)
  → LLM call with memory context
  → agents/memory/write.ts
    → Sonnet 4.6 extracts new facts from this turn
    → upserts into memory_chunks with Letta supersedence chain
```

---

## 6. Database — All Tables

### Core nutrition
| Table | Key columns | Purpose |
|-------|------------|---------|
| `profiles` | `id, user_id FK auth.users, role (enum), locale, org_id` | Identity + role for every user |
| `client_profiles` | `user_id, coach_id, height, weight, goal, activity_level, tdee, macro targets` | Body stats + coaching relationship |
| `food_log` | `user_id, logged_date, food_id FK foods, qty_g, calories, protein_g, carbs_g, fat_g, sugar_g, source, meal_slot, parse_confidence, llm_recognized` | Every logged food entry |
| `foods` | `id, source (usda/off/helth/hhf/custom), source_id, name_en/es/el, brand, kcal_per_100g, protein_g, carb_g, fat_g, fiber_g, embedding vector(1024), search_text tsvector` | Canonical food database (50k+ rows) |
| `food_unit_conversions` | `food_id, unit, qualifier, grams_per_unit, source, reviewed_by` | **The accuracy fix** — deterministic gram anchors |
| `food_aliases` | `food_id, lang, alias` | Multilingual aliases for retrieval |
| `water_log` | `user_id, logged_date, amount_ml` | Daily water tracking |
| `measurements` | `user_id, date, weight_kg, body_fat_pct, notes` | Weight + body comp |

### Habit engine
| Table | Key columns | Purpose |
|-------|------------|---------|
| `habits` | `id, name_en/es/el, description, category, difficulty` | Habit template library |
| `client_habits` | `client_id, habit_id, coach_id, phase, sequence, start_date, current_streak, mastered` | Assigned habits with state |
| `habit_checkins` | `client_id, habit_id, date, completed, mood (1–5), note` | Daily check-in record |

### Coaching
| Table | Key columns | Purpose |
|-------|------------|---------|
| `coach_notes` | `coach_id, client_id, category, content, pinned` | Per-client coach notes |
| `supplements_protocols` | `coach_id, client_id, name, description, evidence_level` | Nutritionist supplement stacks |
| `supplements_items` | `protocol_id, name, dose, timing, notes` | Individual supplement items |
| `workout_templates` | `coach_id, name, exercises jsonb` | Reusable workout templates |
| `workout_sessions` | `user_id, date, template_id, notes, duration_min` | Logged workout sessions |
| `workout_sets` | `session_id, exercise_name, set_num, reps, weight_kg, rpe, is_pr, pain_flag` | Per-set exercise data |
| `custom_foods` | `user_id, name, kcal, protein_g, carbs_g, fat_g, serving_size_g` | User-created food entries |
| `coach_blocks` | `client_id, coach_id, block_label, content, version, edited_by, updated_at` | Letta-style editable memory blocks |

### Multi-tenancy
| Table | Key columns | Purpose |
|-------|------------|---------|
| `organizations` | `id, name, owner_id, created_at` | Each coach auto-creates on signup |
| `organization_members` | `org_id, user_id, role_in_org` | Org membership |
| `audit_log` | `id, actor_id, action, target_table, target_id, diff jsonb, created_at` | Immutable append-only sensitive mutation log |

### Memory (Mem0/Letta hybrid)
| Table | Key columns | Purpose |
|-------|------------|---------|
| `memory_chunks` | `id, user_id, scope (user/session/agent), agent_name, fact_text, fact_type, embedding vector(1024), confidence, salience, superseded_by, expires_at, retrieval_count` | Agent-accessible user memory |
| `agent_conversation` | `user_id, agent_name, session_id, role, content, tool_calls, tokens_in, tokens_out, cost_usd` | Full turn history |
| `agent_runs` | `id, langfuse_trace_id, food_log_id, user_id, model, task, latency_ms` | Links traces to data for explainability |
| `raw_captures` | `id, user_id, source, content jsonb, created_at` | Incoming event firehose |

### Wearables (Spike)
| Table | Key columns | Purpose |
|-------|------------|---------|
| `wearable_connections` | `user_id, provider (enum), spike_user_id, access_token_encrypted bytea, scopes, status, last_sync_at` | Provider OAuth tokens (pgcrypto encrypted) |
| `wearable_data` | `user_id, provider, data_type (steps/heart_rate/sleep/workout/hrv/weight/body_fat), value_numeric, value_jsonb, recorded_at` | Health metrics — indexed `(user_id, data_type, recorded_at desc)` |

### Operational
| Table | Purpose |
|-------|---------|
| `api_usage_log` | Anthropic + Gemini API calls — tokens, cost, latency, endpoint. 90-day retention. |
| `form_analyses` | AI Form Check results — exercise, per-rep scores, summary |

**RLS invariant**: Every client-accessible table enforces `auth.uid() = user_id`. Coach tables enforce roster check. Zero SQL runs without RLS active.

---

## 7. LLM & AI Capabilities

### Agent inventory

| Agent | File | Model (via router) | Cache | Purpose |
|-------|------|-------------------|-------|---------|
| `food-parse` | `agents/food-parse/index.ts` | Gemini 2.5 Flash | — | Text → `{name, qty, unit}[]`. LLM never sees macro numbers. |
| `recipe-analyze` | `agents/recipe-analyze/index.ts` | Haiku 4.5 | ephemeral (system) | Recipe text → ingredients + per-serving macros |
| `photo-analyze` | `app/api/ai/photo-analyze/route.ts` | Haiku 4.5 | — | Image → food identification |
| `meal-suggest` | `app/api/ai/meal-suggest/route.ts` | Gemini 2.5 Flash | — | 12 meal suggestions within remaining macros |
| `coach-insight` | `agents/insights/wearable-summary.ts` | Sonnet 4.6 | — | HRV/sleep/training-load → coach text insight |
| `memory-write` | `agents/memory/write.ts` | Sonnet 4.6 | — | Post-turn fact extraction → memory_chunks |

### LLM router (`agents/router/`)

```ts
// agents/router/policies.ts
{
  food_parse:    { provider: 'google',    model: 'gemini-2.5-flash' },
  recipe:        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', cacheSystem: true },
  coach_insight: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  embed:         { provider: 'voyage',    model: 'voyage-large-2' },
}
```

### Prompt versioning
All prompts in `agents/prompts/<agent>.v<N>.md`. Never edit in place — copy to `vN+1.md`, update import. Current versions: `food-parse.v3.md`, `food-parse.v4.md`, `recipe-analyze.v1.md`.

### Observability
Every `agent.run()` is wrapped in:
- Langfuse generation span (`agents/observability/langfuse.ts`)
- OTel attributes: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.response.finish_reasons`
- `agent_runs` table row with `langfuse_trace_id` FK

### Evals (CI gate)
```
agents/evals/
  run-all.ts                       # aggregate runner
  multi-layer/
    schema-validation.ts           # layer 1: output schema must pass zod
    llm-judge.ts                   # layer 2: Sonnet judges output quality
    regression.ts                  # layer 3: golden set comparison
```
**Hard CI gate**: food-parse accuracy ≥95% on Nikos golden set. Current accuracy with lookup.ts: deterministic (≥95%). Previous LLM-guessed approach: ~81%.

### Prompt caching strategy
System prompt `cache_control: ephemeral` on Haiku 4.5 agents. Prefix must be ≥2048 tokens. Stable prefix = rules + USDA reference data + FOOD_DATABASE constants. Cache TTL 5 min. Cache hit = ~10% of normal input cost. Projected: ~70% Anthropic spend reduction at steady state.

### Form Check (browser-only)
- MediaPipe Pose (`@mediapipe/tasks-vision`) — 33 landmarks, 30+ FPS in browser WASM
- Bulgarian Split Squat reference dataset (202 data points from gym-analysis)
- `lib/form-analysis.ts` — biomechanics math ported from Python
- **No video stored** — all processing in-browser, form_analyses table stores scored results only
- `components/FormCheck.tsx` + `components/FormScore.tsx` + `components/ui/PoseOverlay.tsx`

---

## 8. UX & Design System

### Design principles
- **Mobile-first**: design + verify at 390×844 (iPhone 14 Pro). Desktop via breakpoints.
- **Dark by default**: `bg-stone-950` base. Light mode supported via `.light` CSS class.
- **Gold accent**: `#D4A853` / `var(--color-gold)` / `var(--gold-300)`. Used for primary actions, streaks, PRs.
- **Glass morphism**: `.glass` (16px blur, white/8% bg, 1px border), `.glass-elevated` (more prominent).
- **No emoji as icons**: Lucide icons only. Emoji permitted for meal decorations, streak fires.
- **No hardcoded dark Tailwind on themed surfaces**: use CSS variables.
- **All analytics panels closed by default** (`expanded = useState(false)`).

### CSS tokens (app/globals.css)

| Token | Dark | Light | Purpose |
|-------|------|-------|---------|
| `--bg-primary` | `#0c0a09` | `#fafaf9` | Page background |
| `--t1` | `#e7e5e4` | `#1c1917` | Primary text |
| `--t2` | `#d6d3d1` | `#292524` | Secondary text |
| `--t3` | `#a8a29e` | `#44403c` | Tertiary text |
| `--t4` | `#78716c` | `#78716c` | Quaternary text |
| `--t5` | `#57534e` | `#a8a29e` | Quinary / hints |
| `--color-gold` | `#D4A853` | `#B8892E` | Gold accent |
| `--line` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.08)` | Dividers |
| `--surface` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.04)` | Card backgrounds |
| `--font-mono` | `'JetBrains Mono'` | same | Monospace (numbers) |

### Utility classes (app/globals.css)

| Class | Purpose |
|-------|---------|
| `.glass` | Standard glass card surface |
| `.glass-elevated` | Elevated glass (popovers, modals) |
| `.card` | Neutral surface card (12px radius) |
| `.card-g` | Gold-bordered emphasis card |
| `.card-r` | Danger-bordered warning card |
| `.av` | Gold-gradient initials avatar (32px) |
| `.av-lg` | Large avatar (48px) |
| `.mb-track` | MacroBar background track |
| `.mb-fill` | MacroBar fill (gold by default) |
| `.eye` / `.eye-d` | Brand eyebrow text |
| `.hs-dot-on/warn/off` | Health status dots (6px colored circles) |
| `.row-b` | Row with space-between layout |
| `.row-i` | Row with items-center |
| `.ds-sub` | Dashboard subsection label |
| `.tag` | Status pill |
| `.btn-gold` | Primary gold gradient button |
| `.btn-ghost` | Secondary outlined button |
| `.input-dark` | Dark themed input field |

### Component primitives (components/ui/)

| Component | Usage |
|-----------|-------|
| `<Icon name="i-*" size={N} />` | SVG sprite icon from `public/sprite.svg` (56 icons) |
| `<BotNav />` | Bottom tab bar (4 tabs) — client nav vs coach nav |
| `<Card>`, `<CardGold>`, `<CardDanger>` | Surface primitives |
| `<Tag variant="gold|danger|warning|success">` | Status pill |
| `<Tabs>` / `<Tab>` | Pill-tab group |
| `<Fab>` | Floating action button (gold gradient) |
| `<Avatar>` | Gold-gradient initials avatar |
| `<StatusDot status="on|warn|off">` | Health status indicator |
| `<BrandEye>` | Gold mono eyebrow text |

### Component inventory

**Base components (components/)** — 60+ files:
ActivityTimeline, AnimatedNumber, Avatar, BodyCompCalculator, BottomNav, CalendarView, CalorieGauge, CalorieHeatmap, CarbCyclingSelector, CoachFoodRecs, CoachingSummary, CompactMealView, ComplianceTrend, DailyInsights, DataExport, DateNavigator, DayComparison, DayPatterns, EatingWindowTracker, EndOfDaySummary, ErrorBoundary, ExerciseComparison, FastingTimer, FoodFrequency, FoodSearchModal, FormCheck, FormScore, HabitDetailModal, HabitRadar, MacroAdherence, MacroDonut, MacroFoodIdeas, MacroRadar, MacroTrendChart, MealBadges, MealPhotoGallery, MealSlotCard, MealSlotConfig, MealTemplates, MealTimeline, MicPermissionHelp, MonthlyReport, NutrientDensity, PoseOverlay, ProteinDistribution, RecipeSuggestions, StreakFreeze, ThemeMode, WeekStrip, WeeklySummary + more

**Coach components (components/coach/)** — 30+ files:
AutoMacroOptimizer, BatchHabitAssign, BatchNote, BehavioralSignals, CalorieCyclingPlanner, ClientChecklist, ClientComparison, ClientFoodHeatmap, ClientHealthScore, ClientRiskHeatmap, CoachAchievements, CoachActivityFeed, CoachCalendar, CoachLoadingSkeletons, CoachMacroTargets, CoachOnboardingWizard, CoachingRoadmap, CoachingStreak, ComplianceConfetti, ConsistencyScore, DashboardGreeting, ExportClientReport, GoalProgressTracker, GoldGlowCard, InsightChips, MacroAdherenceGauge, MacroDonut, MacroSparklines, MealPatternView, MealQualityTimeline, MessageTemplates, PlateauDetector, ProgressChart, PulseCards, RiskHeatmap, Sparklines, TransformationCard + more

### Font stack
- `Inter` (sans-serif) — body text, UI
- `Playfair Display` (serif) — headings, brand moments
- `JetBrains Mono` — numbers, macros, data

---

## 9. Page & Route Inventory

### Client pages (app/dashboard/)
| Page | Route | Key component(s) |
|------|-------|-----------------|
| Home | `/dashboard` | CalorieRing, MacroBar×4, HabitStreak, WaterTracker, QuickActions |
| Food log | `/dashboard/log` | DateNavigator, MealSlotCard, QuickFoodInput, MacroAdherence, analytics accordion |
| Habit check-in | `/dashboard/checkin` | NEW in v0.3 — mood selector, YES/SKIP, streak update |
| Progress | `/dashboard/progress` | CalorieHeatmap, MacroTrendChart, measurements |
| Profile | `/dashboard/profile` | Language switcher, theme toggle, macro targets, export |
| Supplements | `/dashboard/supplements` | Protocol view, daily checklist |
| Workout | `/dashboard/workout` | Session logger, exercise picker, PR detection |
| Habit detail | `/dashboard/habit` | Habit modal |
| Nutrition | `/dashboard/nutrition` | Macro calculations |

### Coach pages (app/coach/)
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/coach` | All clients grid — green/yellow/red behavioral signals |
| Client detail | `/coach/client/:id` | Deep-dive: food log, workout, notes, trends |
| Plan editor | `/coach/client/:id/plan` | Macro steppers, habit assignment, phase selector |
| Memory | `/coach/client/:id/memory` | View/edit Letta memory blocks |
| Inbox | `/coach/inbox` | Urgency-sorted activity feed |
| Foods | `/coach/foods` | Custom food database |
| Habits | `/coach/habits` | Habit library |
| Protocols | `/coach/protocols` | Supplement protocol builder |
| Templates | `/coach/templates` | Workout template builder |

### Auth + other
| Page | Route |
|------|-------|
| Login | `/login` |
| Magic link | `/auth/login/magic-link` |
| Onboarding | `/onboarding` (5-screen wizard) |
| Demo | `/demo` (EN/EL Michael Kavdas demo) |
| Admin | `/admin` (super_admin only) |

---

## 10. Auth Deep-Dive

### Session model (v0.3)
`@supabase/ssr` stores tokens in **HTTP-only cookies** (not localStorage). This means:
- Middleware (`proxy.ts`) can read the session
- Server Components can read the session via `cookies()`
- JavaScript cannot access the token (XSS protection)

### Role hierarchy
```
super_admin (Daniel) → admin (Kavdas team) → coach → client
```

### Profile record
```ts
interface Profile {
  id: uuid;
  user_id: uuid;           // FK → auth.users
  role: 'super_admin' | 'admin' | 'coach' | 'client';
  full_name: string;
  locale: 'en' | 'es' | 'el';
  org_id: uuid;            // FK → organizations
  avatar_url: string | null;
  created_at: string;
}
```

### Signup flow
1. `POST /api/auth/signup` — rate-limited 5/hr/IP. Forces `role = 'client'` regardless of body params.
2. Server creates user with `email_confirm: true` (bypasses Supabase email confirmation).
3. Profile row auto-created in trigger.
4. Coach signup requires invite token for elevated role.

---

## 11. CI / Testing

### Test suites (tests/)
| Suite | File | CI gate |
|-------|------|---------|
| Nutrition engine | `nutrition-engine.test.ts` | 25 golden cases — DANIELA + MICHAEL profiles |
| RLS | `db/rls.test.ts` | 100% — impersonates each role tier with JWT claims |
| Role gate | `auth/role-gate.test.ts` | 100% — supertest hits each protected route |
| LLM router | `agents/router.test.ts` | Verifies task→model mapping |
| Food-parse accuracy | `agents/food-parse.accuracy.test.ts` | ≥95% on Nikos golden set (HARD GATE) |
| Memory | `agents/memory.test.ts` | Round-trip + scope isolation + RLS |
| Spike webhook | `spike/webhook.test.ts` | HMAC verification + idempotency |

### Run commands
```bash
npm test                 # all suites
npm run test:coverage    # coverage report
npm run typecheck        # tsc --noEmit (0 errors required)
npm run lint             # eslint (0 errors required)
npm run build            # full production build
```

---

## 12. Performance Notes

### API costs
- Target: <$2/month/coach at steady state
- Gemini 2.5 Flash (food-parse): ~$0.05/active-day vs Haiku ~$0.40 (8× cheaper)
- Haiku 4.5 + prompt cache: ~70% cost reduction on cached tokens within 5-min TTL
- `api_usage_log` table tracks every LLM call with tokens + cost in cents
- `/admin/costs` dashboard (super_admin only) shows spend breakdown

### Database indexes
- `food_log`: indexed on `(user_id, logged_date DESC)` — primary query pattern
- `foods`: HNSW index on `embedding vector(1024)` (pgvector), GIN on `search_text tsvector`
- `wearable_data`: composite `(user_id, data_type, recorded_at DESC)`
- `memory_chunks`: HNSW on `embedding`, partial on `(user_id, scope)` for scoped kNN
- 8 FK indexes added April 14 audit — was missing on all foreign keys

### Next.js / rendering
- All analytics components are `'use client'` (client-side data fetch, no SSR for personalized data)
- `React.memo` on `CalorieGauge`, `MacroRadar`, `ProteinDistribution` (heavy SVG components)
- Server-side: only layout, onboarding, auth pages (no user data)
- Images: lazy loading + explicit dimensions on all `<img>` elements

### Supabase query patterns
- Never `.single()` — always `.maybeSingle()` (PGRST116 crash on no row)
- Batch food_log selects: `.gte/.lte` on `logged_date` (date range), not `.in()` on array
- RLS is enforced at DB level — no client-side row filtering needed

---

## 13. Food Data Layer (v0.3)

### Why it matters
Original approach: LLM emitted invented macro numbers → ~81% accuracy (per tester feedback "values are off").
v0.3 fix: LLM identifies `{food_name, qty, unit}` ONLY. All macros computed deterministically from database.

### Database sources
| Source | Rows | Coverage |
|--------|------|---------|
| USDA FoodData Central (FoundationFoods + SR Legacy) | ~7,800 | Comprehensive US foods with lab-verified macros |
| OpenFoodFacts (GR/ES/US filtered slice) | ~50k | Packaged goods, Mediterranean region |
| Hellenic Food Thesaurus (HelTH) | TBD | Greek academic food database |
| HHF 48 traditional Greek dishes | 48 | PubMed 28731641 + lib/greek-foods-seed.ts |
| Custom (user-created) | variable | Per-user custom entries |

### Retrieval pipeline (agents/food-parse/lookup.ts)
```
1. tsvector keyword match on search_text (full-text index, GIN)
2. cosine kNN on embedding (pgvector HNSW, 1024-dim Voyage v4)
3. metadata rerank (source quality, region match, name similarity)
→ returns food_id + grams_per_unit (from food_unit_conversions)
→ macros: grams × food.kcal_per_100g / 100
```

### Ingest scripts (scripts/ingest/)
```bash
npx tsx scripts/ingest/usda.ts           # ~7,800 rows USDA
npx tsx scripts/ingest/openfoodfacts.ts  # ~50k rows GR/ES/US
npx tsx scripts/ingest/helth.ts          # Hellenic Food Thesaurus
npx tsx scripts/ingest/hhf-dishes.ts     # 48 Greek dishes
npx tsx scripts/ingest/embed-foods.ts    # Voyage v4 embeddings (batched, resumable)
```

---

## 14. Wearable Layer (Spike)

Spike API integration unlocks Apple Health, Whoop, Oura, Strava, Garmin, Fitbit at $0.10/user/mo.

### Flow
```
User → /app/integrations → Spike OAuth init
  → /api/integrations/spike/connect → redirect to Spike consent
  → /api/integrations/spike/callback → exchange + encrypt tokens
  → Spike sends webhook → /api/integrations/spike/webhook
    → HMAC-verify + parse → upsert wearable_data
  → agents/insights/wearable-summary.ts
    → Sonnet 4.6 reads 7-day HRV/sleep/training-load
    → returns coach insight text
```

### Token security
`pgcrypto pgp_sym_encrypt(token, SUPABASE_SERVICE_ROLE_KEY)` — symmetric encryption at rest. Tokens never serialized to client. Webhook HMAC verified before any processing.

---

## 15. Memory System (Mem0/Letta hybrid)

### Memory scopes
| Scope | TTL | Contents |
|-------|-----|---------|
| `user` | 365 days | Preferences, allergies, goals, long-term observations |
| `session` | 30 days | Session-specific context |
| `agent` | Indefinite | Agent-specific state (until manually cleared) |

### Letta coach blocks
Coaches write human-readable blocks about clients (e.g., "Client is lactose intolerant, prefers Mediterranean diet, competes in basketball"). These are rendered into agent system prompts at call time via `agents/memory/coach-blocks.ts`.

### Memory write pipeline
After each agent turn, `agents/memory/write.ts` uses Sonnet 4.6 to extract structured facts → zod-validated → upserted into `memory_chunks` with Letta supersedence chain (new fact references old fact's `id` in `superseded_by`).

---

## 16. tRPC Layer

Type-safe internal API for coach UI. Public REST at `/api/*` preserved for external partners + Spike webhooks.

```
lib/trpc/server.ts     # tRPC server instance
lib/trpc/router.ts     # root router (merges sub-routers)
lib/trpc/context.ts    # request context (session, db)
lib/trpc/client.ts     # client-side caller
lib/trpc/provider.tsx  # React Query v5 provider
lib/trpc/routers/      # clients.ts, coach.ts, food.ts, memory.ts
app/api/trpc/[trpc]/route.ts   # handler
```

Coach pages use tRPC hooks. REST routes remain as thin adapters for mobile clients + Spike webhooks.

---

## 17. What Is Missing / Next Steps

### Functional gaps (v0.3 complete, pre-Phase 9)
1. **Phase 9 production cutover** — Supabase Postgres → Vultr HF VPS with pgvector. Operator-gated. Triggers when: >500 active users OR >5GB data OR need 99.9% SLA.
2. **USDA API key** — currently `DEMO_KEY` (30 req/hr). Register free key at api.nal.usda.gov before public launch.
3. **Supabase Pro** — no automated DB backups on free tier. Pro ($25/mo) gives 7-day PITR.
4. **Spike sandbox key** — operator must create Spike developer account to test wearable flow.
5. **Apple/Google OAuth** — wired but OAuth client provisioning operator-gated (requires Apple Developer account + Google Cloud project).
6. **Playwright E2E** — unit tests are green but no browser-level E2E suite yet.
7. **Admin ops dashboard** — LLM spend, error rate, active users (`/admin/ops`).
8. **Large file refactor** — `app/coach/page.tsx` 1347 LOC, `app/dashboard/log/page.tsx` 951 LOC. Should be broken into sub-components.
9. **Nonce-based CSP** — `unsafe-inline` retained for Framer Motion inline styles. Nonce-based CSP deferred to v1.0.
10. **Persistent rate limiting** — in-memory rate limit map resets on Vercel cold start. Upstash-based rate limiting deferred to v1.0.

### Content gaps
- Coach-assigned habit notifications (bi-directional)
- Nutritional plan generator (AI builds, coach adjusts)
- Supermarket list with local products
- Recipe suggestions by culture/region
- Client profile portability / export

---

## 18. Known Critical Invariants

These must never be broken:

1. **`getUser()` not `getSession()`** — `getSession()` doesn't re-validate against auth server. Always use `getUser()` in middleware and server components.
2. **Never `.single()`** — always `.maybeSingle()` on all Supabase queries.
3. **LLM never emits macro numbers** in food-parse (v0.3). If you add a new food agent that lets LLM guess macros, expect ~20% overestimation.
4. **All dates use `lib/dates.ts`** — `localToday()`, `localDateStr()`. UTC caused day-boundary bugs.
5. **Service role key is server-only** — never `NEXT_PUBLIC_`, never in client components.
6. **Mobile-first** — design and verify at 390×844 before desktop. Always.
7. **Never push to `main` during v0.3** — all work on `v0.3-overhaul` until Phase 9 cutover is explicitly approved by Daniel.
8. **No `dangerouslySetInnerHTML`** except the pre-paint theme script in `app/layout.tsx`. Everything else uses JSX.
9. **Prompt version bump on any prompt rule change** — `v3.md` → `v4.md`, update import in agent index.ts.
10. **RLS on every new table** — `auth.uid() = user_id` is the baseline. Add test in `tests/db/rls.test.ts`.

---

## 19. Contacts & Business

| Person | Role | Email | Notes |
|--------|------|-------|-------|
| Daniel Reyes | Technical co-founder / operator | d.reyesusma@gmail.com | Bogotá, GMT-5. Single final decision-maker. |
| Michael Kavdas | Business co-founder / lead coach | michael@kavdas.com | Athens. Greek nutritionist, PN L1, COO Athletikapp. |
| George Tsatsaronis | Partner (potential) | george@kavdas.com | 21+ years deal-making. Met April 20. |

**Partnership context**: April 20 meeting with Michael + George defined strategic direction. Not yet a formal legal entity. Daniel's position: Technical Co-Founder treating this as paid apprenticeship, 4–8hrs/week ceiling.

**Three-tier product vision**:
1. Coach Tool (current) — SaaS for nutritionists per-coach subscription
2. Self-Service Tracker — consumer freemium app
3. B2B Platform — multi-tenant for gyms/clinics (Stripe Connect)

---

## 20. Quickstart for a Fresh Agent

```bash
# 1. Orient
cat CLAUDE.md              # coding rules + pitfalls (AI agent brief)
cat CODEX.md               # this file (full context)
cat ARCHITECTURE.md        # system diagram + data model overview
cat CHANGELOG.md           # what shipped in v0.3

# 2. Understand the current branch state
git log --oneline -10
git branch -a

# 3. Check local env
cat .env.local.example     # all required variables
# copy to .env.local and fill in with keys from ~/.local/secrets/

# 4. Start dev
npm run dev                # http://localhost:3000
npm run db:studio          # Drizzle Studio GUI

# 5. Verify
npm run typecheck && npm run lint && npm test && npm run build

# 6. For AI feature work: read agents/README.md + ARCHITECTURE.md §LLM surface
# 7. For DB work: read db/schema/ files + drizzle/ migrations
# 8. For UI work: read components/ui/README.md + app/globals.css
```

---

_Auto-synced to ground truth: 2026-05-01. Update this file when any architectural invariant changes._
