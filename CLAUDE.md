# τροφή (Trophē) — Precision Nutrition Coaching Platform

## Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (strict mode)
- **Backend**: Supabase (auth + Postgres + RLS)
- **AI**: Gemini (meal suggestions), Anthropic Haiku 4.5 (food parse + photo analysis)
- **Food API**: USDA FoodData Central (free, DEMO_KEY)
- **Styling**: Tailwind CSS 4 + Framer Motion + Lucide icons
- **i18n**: Trilingual (EN/ES/EL) via lib/i18n.tsx

## Stats (2026-04-16 evening)
- **37,000+ lines** | **117 components** (65 base + 52 coach) | **9 API routes** | **21 pages** | **72+ commits**
- **19 database tables** (incl api_usage_log, form_analyses) | **43 RLS policies** | **23 indexes** (8 FK indexes added Apr 14)
- **113 exercises** (30 base + 83 gym expansion) | **126 foods** | **20 Greek foods** | **10 habits**
- **90+ features** shipped across 11 iterations + 28-fix security audit + 50 coach components + dashboard overhaul
- **0 TypeScript errors** (strict mode ON) | **0 console errors** | **Codex score: 5.6/10** (Apr 17 morning, up from 4.6 — food accuracy fixes, 0 CRITICAL, 3 HIGH deferred, 7 MEDIUM open)

## Architecture
- Two roles: `client` and `coach` (and `both`)
- Habit engine: 14-day cycles, one habit at a time (Precision Nutrition methodology)
- Workout module: exercises, sessions, sets, PRs, pain flags, coach templates
- Coach assigns habits → client checks in daily → coach sees behavioral intelligence
- Meal tracking: text NLP (Haiku) + photo analysis (Haiku) + USDA search + paste support
- Lock system: per-meal and bulk lock via localStorage (prevents accidental edits)

## Key Files
- `lib/nutrition-engine.ts` — BMR/TDEE/macro calculations (Mifflin-St Jeor + ISSN)
- `lib/i18n.tsx` — Trilingual dictionary + useI18n() hook (200+ strings)
- `lib/types.ts` — All TypeScript interfaces matching Supabase schema
- `lib/supabase.ts` — Supabase client singleton
- `lib/food-units.ts` — Food unit conversions + 126-food database for AI parsing
- `lib/meal-score.ts` — Meal quality scoring (0-100, A/B/C/D)
- `lib/api-cost-logger.ts` — API usage/cost tracking for Anthropic + Gemini
- `supabase-schema.sql` — Nutrition schema (14 tables, incl api_usage_log)
- `supabase-workout-schema.sql` — Workout schema (4 tables)

## New Components (2026-04-08 mega upgrade)
### Calendar & Navigation
- `DateNavigator` — left/right arrows, swipe, today button
- `CalendarView` — monthly grid, color-coded completion, streak fire emojis
- `WeekStrip` — horizontal 7-day bar strip

### Charts & Visualizations
- `MacroTrendChart` — 30-day multi-line SVG, toggleable macros
- `CalorieHeatmap` — GitHub-style contribution grid (8 weeks)
- `CalorieGauge` — speedometer with zones and needle
- `MacroRadar` — 5-axis spider chart (P/C/F/Fiber/Water)
- `ProteinDistribution` — per-meal protein bars
- `AnimatedNumber` — counting animation for macro values

### Analytics
- `EatingWindowTracker` — first/last meal, window duration
- `FoodFrequency` — top 8 most-logged foods ranked
- `MacroAdherence` — weekly adherence scoring (0-100%)
- `DayPatterns` — avg calories by day of week
- `MonthlyReport` — monthly grade card (A-F)
- `NutrientDensity` — nutrients-per-calorie ranking
- `DailyInsights` — AI-like contextual nutrition insights (client-side)
- `MacroFoodIdeas` — context-aware food suggestions by macro category (Protein, Fiber, Healthy Fats, Carbs), collapsible, shows when daily targets have gaps (React.memo)

### Engagement
- `MealBadges` — 6 achievement badges with animated unlock
- `StreakFreeze` — protect streak once per week
- `DayComparison` — side-by-side two-day macro comparison
- `CompactMealView` — emoji + calories compact mode

### Customization
- `ThemePicker` — 6 accent color themes
- `MealSlotConfig` — add/remove/rename/reorder meal slots
- `MealTemplates` — save/load full meal templates
- `FoodSearchModal` — full search with category filters
- `DataExport` — CSV export with date range

### Coaching & Intelligence
- `FastingTimer` — eating window bar with duration
- `MealPhotoGallery` — timeline of food photos
- `EndOfDaySummary` — shareable summary card
- `WeeklySummary` — 7-day bar chart with trends

### Theme & Views
- `ThemeMode.tsx` — ThemeProvider + useTheme hook + Sun/Moon animated toggle, CSS custom properties, localStorage persistence, .light class
- `coach/MealPatternView.tsx` — grouped meal analysis by meal type (frequency, avg macros, common foods), toggle between Pattern/Daily view

### Dashboard (April 16 overhaul)
- Hero welcome card with time-aware greeting + avatar + daily motivation
- 160px CalorieRing (consumed/target/remaining)
- 4 horizontal MacroBar progress bars (Protein/Carbs/Fat/Fiber) with labels + numbers
- Meal dots showing X of 5 meals logged
- Quick Actions 2x2 grid (Log Food, Workout, Water, Progress)
- Compact water tracker (single line, horizontal segments)
- Removed: MacroRing, MacroDonut, CarbCyclingSelector, MealTimingIndicator

### Coach Tools
- `CoachMacroTargets` — set/override client macro targets (cal/protein/carbs/fat/fiber/water) with Auto-calc (Mifflin-St Jeor + ISSN)

### Coach Components (52 files at `components/coach/`, added 2026-04-16)
#### Wave 1: Dashboard Intelligence (10)
- `CoachGreeting`, `PulseCards`, `RiskHeatmap`, and 7 more dashboard intelligence components

#### Wave 2: Client Detail (12)
- `MacroGauge`, `Sparklines`, `MoodTrend`, and 9 more client detail components

#### Wave 3: Smart Coaching (10)
- `AutoMacroOptimizer`, `PlateauDetector`, and 8 more smart coaching components

#### Wave 4: Visual WOAH (10)
- `TransformationCard`, `Achievements`, `Confetti`, and 7 more visual engagement components

#### Wave 5: Workflow (8)
- `MessageTemplates`, `Checklist`, `Calendar`, and 5 more workflow components

### Accessibility & Permissions
- `MicPermissionHelp` — step-by-step OS-level mic permission instructions (iPhone/Android/desktop)

### Admin
- `/admin/costs` — API cost tracking dashboard (Daniel only)

## API Routes (9 total)
| Route | Method | AI | Guard | Purpose |
|-------|--------|-----|-------|---------|
| `/api/food/parse` | POST | Haiku | ✅ guardAiRoute + input sanitized (500 char cap) | NLP text → structured food items |
| `/api/ai/photo-analyze` | POST | Haiku | ✅ guardAiRoute + 7MB base64 cap | Photo → food identification + macros |
| `/api/ai/meal-suggest` | POST | Gemini | ✅ guardAiRoute + input sanitized (500 char cap) | 12+ meal suggestions within remaining macros |
| `/api/food/search` | GET `?q=` | — | ✅ sanitized ilike | USDA FoodData Central (350K+ foods) |
| `/api/food/local-search` | GET `?q=` | — | ✅ limit capped at 50, uses anon key | Local Supabase food DB (126+ foods) |
| `/api/nutrition/calculate` | POST | — | — | BMR/TDEE/macros (Mifflin-St Jeor) |
| `/api/auth/signup` | POST | — | ✅ rate limited (5/hour/IP) | Server-side signup (bypasses email confirm) |
| `/api/seed/food-database` | POST | — | ✅ requireAdminRequest | Seed 126-food database |
| `/api/seed/greek-foods` | POST | — | ✅ requireAdminRequest | Seed 20 Greek foods |

**lib/api-guard.ts**: Per-user rate limit (60 req/15min authenticated, 10/15min anonymous).
**lib/server-admin.ts**: Admin bearer-token + email-whitelist guard for seed routes.
**middleware.ts**: Server-side auth middleware — JWT verification via `@supabase/ssr` + role-based routing (clients blocked from /coach/*, coaches redirected from /dashboard/*).

## Supabase
- Project: Trophe (iwbpzwmidzvpiofnqexd)
- 19 tables (incl api_usage_log, form_analyses), 43 RLS policies, 23 indexes (8 FK indexes added Apr 14)
- RLS enabled on api_usage_log (Apr 14)
- 5 ON DELETE cascades/SET NULL added (Apr 14)
- Service role key in .env.local (never expose)
- food_log source CHECK: `('usda', 'openfoodfacts', 'custom', 'photo_ai', 'natural_language', 'ai_estimate')`
- api_usage_log: tracks Anthropic + Gemini API calls (tokens, cost, latency)
- Migration ran: 2026-04-08 (.forge/migrate-api-usage-log.sql)
- **Migration ran**: 2026-04-14 (.forge/migrate-2026-04-14-audit.sql) — RLS on api_usage_log, 8 FK indexes, 5 cascades, carb_cycling_enabled column. Deployed to production same day.

## Business Context (post-meeting April 9)
- **Partner**: Michael Kavdas (Greek nutritionist, PN L1, COO Athletikapp)
- **Status**: Testing phase (April 10-18). 4 subjects: Nikos, Daniel, Daniela, Dimitra. All assigned to Michael as coach.
- **Model**: SaaS per coach. Clients free. AI cost <$2/month/coach
- **Vision**: AI assistant for nutritionists → eventually AI IS the nutritionist
- **Docs**: MEETING-NOTES.md, BUSINESS.md, .forge/kavdas-meeting-2026-04-09.pdf
- **Next meeting**: April 16-18 with testing results

## Deploy
```bash
cd /Volumes/SSD/work/forge-projects/trophe
vercel --yes --prod   # Must use --prod (env vars are Production-only)
```
Production: https://trophe-mu.vercel.app
GitHub: zsoist/trophe

**IMPORTANT**: `vercel --yes` (preview) FAILS because env vars are set for Production only. Always use `--prod`.

## Vercel Deploy Identity
```bash
git config user.name "zsoist"
git config user.email "zsoist@users.noreply.github.com"
```

## Design System
- Dark theme (bg-stone-950), Gold accent: #D4A853
- Glass morphism: `.glass`, `.glass-elevated`
- Buttons: `.btn-gold`, `.btn-ghost` | Inputs: `.input-dark`
- Inter (sans) + Playfair Display (serif headings)

## Test Accounts (Phase 2, April 10-18)
| Account | Email | Password | Role |
|---------|-------|----------|------|
| Michael Kavdas | michael@kavdas.com | trophe2026! | coach |
| Dimitra Kavdas | dimitra@kavdas.com | trophe2026! | client (Greek, added Apr 13) |
| Daniel | daniel@reyes.com | trophe2026! | both |
| Nikos | nikos@biorita.com | trophe2026! | both |
| Daniela | daniela@trophe.app | trophe2026! | both |
| George Kavdas | george@kavdas.com | trophe2026! | coach (Michael's partner, for Monday meeting) |

## Meal Tracking — How It Works
1. User types text or pastes/uploads a photo in QuickFoodInput
2. Text → `/api/food/parse` (Haiku NLP) → returns ParsedFoodItem[]
3. Photo → `/api/ai/photo-analyze` (Haiku vision) → returns food analysis
4. User reviews in ParsedFoodList, adjusts grams → confirms
5. Entries inserted into `food_log` with source `'custom'` (text) or `'photo_ai'` (photo)
6. MealSlotCard shows totals, can expand/edit/delete entries
7. Lock per-meal or "Lock All" → localStorage prevents accidental edits

## Pitfalls (learned the hard way)
### Security (CRITICAL — Codex audit 2026-04-07)
- `middleware.ts` checked cookie PRESENCE only, not JWT validity — any non-empty `sb-access-token` cookie bypassed auth. Always use `@supabase/ssr createServerClient` + `supabase.auth.getUser()` for real verification
- `/api/seed/*` routes had NO auth check but used service-role key — anonymous callers could trigger mass data operations. Seed routes must require admin auth or be removed from production builds

### Supabase
- NEVER use `.single()` on ANY query — use `.maybeSingle()` (PGRST116 crash)
- Supabase email confirmation ON by default — use admin API with `email_confirm: true`
- food_log CHECK constraint must include ALL source values used in code
- RLS policies silently reject inserts with invalid CHECK values — no error bubbles up clearly
- Always add explicit error handling on `.insert()` calls — silent failures are the worst UX

### TypeScript / Next.js
- NEVER use `ignoreBuildErrors: true` — it masks real runtime crashes
- Framer Motion `ease` arrays need `as const` for TypeScript
- React hooks MUST be called before any early `return` statement
- i18n file must be .tsx (contains JSX)
- `ringColor` is not a valid CSS property — use `borderColor` instead

### UI / UX
- ALWAYS add loading guards on async buttons (double-click = double insert)
- `bg-white/3` is invalid Tailwind — use `bg-white/[0.03]`
- `window.location.href` causes full reload — use `router.push()` from next/navigation
- `.replace('_', ' ')` only replaces first occurrence — use `.replaceAll()`
- `capture="environment"` on file inputs forces camera-only on mobile — remove it to allow gallery
- Coach pages need role gate — redirect `role === 'client'` to `/dashboard`

### Auth / Middleware (April 14 — CRITICAL LESSON)
- Supabase JS v2 stores auth sessions in `localStorage`, NOT cookies
- Server-side Next.js middleware CANNOT see the auth token — it lives in the browser only
- Attempting cookie-based auth in middleware causes infinite redirect loops for ALL users
- `@supabase/ssr` is required to bridge localStorage ↔ cookies (NOT installed in this project)
- Current pattern: middleware handles security headers ONLY, auth is 100% client-side
- Each page checks `supabase.auth.getUser()` in useEffect, role guards check `profile.role`
- middleware.ts sets: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy

### Deploy
- Vercel Hobby rejects commits from unrecognized GitHub committers
- Vercel env vars set as "Production" only → preview deploys fail without them
- Always deploy with `vercel --yes --prod`, never just `vercel --yes`

### Food API / USDA (Codex audit 2026-04-09)
- USDA `DEMO_KEY` has a ~1000 req/day limit — falls back silently with degraded results, no user-visible error. Upgrade to a registered API key before beta launch
- Never pass API keys as URL query params (e.g. `?api_key=...`) — they appear in server logs, Vercel function logs, and browser history. Use server-side env vars only

### Auth / Routing (April 15)
- Login page had hardcoded `router.push('/dashboard')` — coaches must route to `/coach` based on `profile.role`. Fixed in commit 079a308.
- `coach_id` on `client_profiles` must match the actual coach user — test accounts were pointed at wrong coach. Always verify data assignments after account creation.

### Signup Security (April 16)
- Signup role bypass: public `/api/auth/signup` accepted `role` param from request body — attackers could self-assign `coach` role. Fix-agent auto-patched: forced `role='client'` for all public signups. Codex evaluator-optimizer loop caught this.

### UI Visibility
- Customize meals button was invisible (14px stone-600 icon only). Always use visible labels + borders for action buttons on dark backgrounds
- Macro rings need labels (Cal/P/C/F) — users can't tell which ring is which without them

### AI Food Parser (April 16)
- AI protein calibration needs exact USDA values in system prompt — CRITICAL ACCURACY RULES (eggs 6g, chicken breast 31g/100g, rice 2.7g/100g, etc.)
- Math validation required: cal = P*4 + C*4 + F*9 (parser must self-check)
- sugar_g field added to ParsedFoodItem — WHO 36g daily limit for men
- `2026-04-17`: Serving sizes 20-30% too large, protein overestimated — AI parser inflates portion sizes without explicit gram anchors. Always anchor common foods to USDA gram weights in system prompt; vague "1 portion" drifts large.
- `2026-04-17` (DEEP FIX): AI food parser was overestimating protein 20-30% due to oversized default serving sizes. Fix: use realistic portions (yogurt 150g not 170g, chicken 120g palm not 175g, feta 30g not 100g, rice 150g not 185g). 22 DB defaults patched + AI parser system prompt updated with SERVING SIZE RULES (13 explicit gram defaults). 21 existing DB rows rewritten (13 eggs 12.4→6.3g/egg, 5 yogurts 17→15g, 1 pork 35.6→32.4g, 2 feta 14.2→4.2g). Commit 90a83c6. Codex score 4.6→5.6.

### CSP / Security Headers (April 16)
- CSP must use explicit Supabase domain (iwbpzwmidzvpiofnqexd.supabase.co), not wildcard *.supabase.co
- CSP was re-added after middleware refactor removed it
- Admin costs page (/admin/costs) now requires admin-email-only access

### Debugging
- Schema-code drift: if DB CHECK constraint doesn't match code's source values, inserts silently fail
- When meals "don't log", first check the source value being sent vs what the CHECK allows
- Paste support requires explicit `onPaste` handler — browsers don't auto-handle clipboard images

### Drag-and-Drop (April 13)
- HTML5 drag API (`draggable`, `onDragStart/Over/Drop`) works on desktop + iPad but NOT on mobile touch
- For mobile touch drag: use `onTouchStart/Move/End` on the drag handle + compute step from `slotHeight`
- `e.preventDefault()` on `onDragOver` is REQUIRED — without it `onDrop` never fires
- Dragged item visual: `opacity-40 scale-[0.98]`. Drop target: `ring-2 ring-gold -translate-y-0.5`

### Microphone / Speech (April 13)
- `recognition.start()` cold-fires browser permission prompt with NO context visible — feels unexpected
- Fix: call `navigator.mediaDevices.getUserMedia({ audio: true })` first → immediately release stream → THEN start recognition. Browser prompt shows app name prominently.
- Always check `navigator.permissions.query({ name: 'microphone' })` state before starting
- `recognition.onerror` event has `event.error` string — distinguish `'not-allowed'` vs other errors

### Git / Session hygiene (April 13)
- After any sprint: commit + push immediately. 29 commits unpushed + 55 dirty files is a debt that takes a session to clean up
- Vercel preview builds fail if module-scope `createClient()` uses `!` assertions — use `?? 'placeholder.supabase.co'`

### Security Hardening (April 14, 6-agent audit — 28 fixes)
- **middleware.ts auth**: Must use `@supabase/ssr createServerClient` + `supabase.auth.getUser()` + verify JWT — never just check cookie presence. Role routing: clients blocked from /coach/*, coaches redirected from /dashboard/*
- **SQL injection via ilike**: Supabase `.ilike()` passes raw input to Postgres — always sanitize (strip `%`, `_`, `\`) before passing to food search routes
- **Prompt injection defense**: Cap AI input at 500 chars, strip control characters (`\x00-\x1F` except `\n`), reject prompts with system/instruction keywords
- **Gemini API key**: Never pass as URL query param — use `x-goog-api-key` header (keys in URL appear in logs)
- **Base64 payload cap**: photo-analyze must reject base64 payloads > 7MB server-side (client-side 5MB limit is not enough)
- **Security headers**: Always set CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, X-XSS-Protection, Referrer-Policy strict-origin-when-cross-origin
- **Signup rate limiting**: 5/hour per IP — prevents mass account creation
- **FK indexes**: Always add indexes on foreign key columns (8 were missing before audit)
- **ON DELETE cascades**: Add CASCADE or SET NULL on FKs to prevent orphaned rows
- **.env.local.example**: Always maintain a template .env file so new devs know required vars
