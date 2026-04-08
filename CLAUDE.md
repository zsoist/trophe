# τροφή (Trophē) — Precision Nutrition Coaching Platform

## Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (strict mode)
- **Backend**: Supabase (auth + Postgres + RLS)
- **AI**: Gemini (meal suggestions), Anthropic Haiku 4.5 (food parse + photo analysis)
- **Food API**: USDA FoodData Central (free, DEMO_KEY)
- **Styling**: Tailwind CSS 4 + Framer Motion + Lucide icons
- **i18n**: Trilingual (EN/ES/EL) via lib/i18n.tsx

## Stats (2026-04-07)
- **17,335 lines** | **28 components** | **9 API routes** | **17 pages**
- **17 database tables** | **39+ RLS policies** | **10 indexes**
- **30 exercises** | **126 foods** | **20 Greek foods** | **10 habits**
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
- `supabase-schema.sql` — Nutrition schema (13 tables)
- `supabase-workout-schema.sql` — Workout schema (4 tables)

## API Routes (9 total)
| Route | Method | AI | Purpose |
|-------|--------|-----|---------|
| `/api/food/parse` | POST | Haiku | NLP text → structured food items |
| `/api/ai/photo-analyze` | POST | Haiku | Photo → food identification + macros |
| `/api/ai/meal-suggest` | POST | Gemini | 12+ meal suggestions within remaining macros |
| `/api/food/search` | GET `?q=` | — | USDA FoodData Central (350K+ foods) |
| `/api/food/local-search` | GET `?q=` | — | Local Supabase food DB (126+ foods) |
| `/api/nutrition/calculate` | POST | — | BMR/TDEE/macros (Mifflin-St Jeor) |
| `/api/auth/signup` | POST | — | Server-side signup (bypasses email confirm) |
| `/api/seed/food-database` | POST | — | Seed 126-food database |
| `/api/seed/greek-foods` | POST | — | Seed 20 Greek foods |

## Supabase
- Project: Trophe (iwbpzwmidzvpiofnqexd)
- 17 tables, 39+ RLS policies, 15 indexes
- Service role key in .env.local (never expose)
- food_log source CHECK: `('usda', 'openfoodfacts', 'custom', 'photo_ai', 'natural_language', 'ai_estimate')`

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

## Demo Accounts
| Account | Email | Password | Role |
|---------|-------|----------|------|
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

### Debugging
- Schema-code drift: if DB CHECK constraint doesn't match code's source values, inserts silently fail
- When meals "don't log", first check the source value being sent vs what the CHECK allows
- Paste support requires explicit `onPaste` handler — browsers don't auto-handle clipboard images
