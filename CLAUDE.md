# τροφή (Trophē) — Precision Nutrition Coaching Platform

## Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (strict mode)
- **Backend**: Supabase (auth + Postgres + RLS)
- **AI**: Gemini (meal suggestions), Anthropic Haiku 4.5 (food parse + photo analysis)
- **Food API**: USDA FoodData Central (free, DEMO_KEY)
- **Styling**: Tailwind CSS 4 + Framer Motion + Lucide icons
- **i18n**: Trilingual (EN/ES/EL) via lib/i18n.tsx

## Stats (2026-04-09)
- **26,023 lines** | **60 components** | **9 API routes** | **20 pages** | **48 commits**
- **19 database tables** (incl api_usage_log, form_analyses) | **43 RLS policies** | **15 indexes**
- **30 exercises** | **126 foods** | **20 Greek foods** | **10 habits**
- **85+ features** shipped across 9 iterations
- **0 TypeScript errors** (strict mode ON) | **0 console errors**

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

### Admin
- `/admin/costs` — API cost tracking dashboard (Daniel only)

## API Routes (9 total)
| Route | Method | AI | Guard | Purpose |
|-------|--------|-----|-------|---------|
| `/api/food/parse` | POST | Haiku | ✅ guardAiRoute | NLP text → structured food items |
| `/api/ai/photo-analyze` | POST | Haiku | ✅ guardAiRoute | Photo → food identification + macros |
| `/api/ai/meal-suggest` | POST | Gemini | ✅ guardAiRoute | 12+ meal suggestions within remaining macros |
| `/api/food/search` | GET `?q=` | — | — | USDA FoodData Central (350K+ foods) |
| `/api/food/local-search` | GET `?q=` | — | — | Local Supabase food DB (126+ foods) |
| `/api/nutrition/calculate` | POST | — | — | BMR/TDEE/macros (Mifflin-St Jeor) |
| `/api/auth/signup` | POST | — | — | Server-side signup (bypasses email confirm) |
| `/api/seed/food-database` | POST | — | ✅ requireAdminRequest | Seed 126-food database |
| `/api/seed/greek-foods` | POST | — | ✅ requireAdminRequest | Seed 20 Greek foods |

**lib/api-guard.ts**: Per-user rate limit (60 req/15min authenticated, 10/15min anonymous).
**lib/server-admin.ts**: Admin bearer-token + email-whitelist guard for seed routes.

## Supabase
- Project: Trophe (iwbpzwmidzvpiofnqexd)
- 19 tables (incl api_usage_log, form_analyses), 43 RLS policies, 15 indexes
- Service role key in .env.local (never expose)
- food_log source CHECK: `('usda', 'openfoodfacts', 'custom', 'photo_ai', 'natural_language', 'ai_estimate')`
- api_usage_log: tracks Anthropic + Gemini API calls (tokens, cost, latency)
- Migration ran: 2026-04-08 (.forge/migrate-api-usage-log.sql)

## Business Context (post-meeting April 9)
- **Partner**: Michael Kavdas (Greek nutritionist, PN L1, COO Athletikapp)
- **Status**: Testing phase (April 10-18). 3 subjects: Nikos, Daniel, Daniela
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

### Deploy
- Vercel Hobby rejects commits from unrecognized GitHub committers
- Vercel env vars set as "Production" only → preview deploys fail without them
- Always deploy with `vercel --yes --prod`, never just `vercel --yes`

### Food API / USDA (Codex audit 2026-04-09)
- USDA `DEMO_KEY` has a ~1000 req/day limit — falls back silently with degraded results, no user-visible error. Upgrade to a registered API key before beta launch
- Never pass API keys as URL query params (e.g. `?api_key=...`) — they appear in server logs, Vercel function logs, and browser history. Use server-side env vars only

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
