# τροφή (Trophē) — Precision Nutrition Coaching Platform

## Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (strict mode)
- **Backend**: Supabase (auth + Postgres + RLS)
- **AI**: Gemini (meal suggestions), Anthropic Haiku 4.5 (photo analysis)
- **Food API**: USDA FoodData Central (free, DEMO_KEY)
- **Styling**: Tailwind CSS 4 + Framer Motion + Lucide icons
- **i18n**: Trilingual (EN/ES/EL) via lib/i18n.tsx

## Stats (2026-04-07)
- **15,444 lines** | **25 components** | **25 routes** | **47 features**
- **17 database tables** | **30 exercises** | **20 Greek foods** | **10 habits**
- **0 TypeScript errors** (strict mode ON) | **0 console errors**

## Architecture
- Two roles: `client` and `coach` (and `both`)
- Habit engine: 14-day cycles, one habit at a time (Precision Nutrition methodology)
- Workout module: exercises, sessions, sets, PRs, pain flags, coach templates
- Coach assigns habits → client checks in daily → coach sees behavioral intelligence

## Key Files
- `lib/nutrition-engine.ts` — BMR/TDEE/macro calculations (Mifflin-St Jeor)
- `lib/i18n.tsx` — Trilingual dictionary + useI18n() hook
- `lib/types.ts` — All TypeScript interfaces matching Supabase schema
- `lib/supabase.ts` — Supabase client singleton
- `supabase-schema.sql` — Nutrition schema (13 tables)
- `supabase-workout-schema.sql` — Workout schema (4 tables)

## Supabase
- Project: Trophe (iwbpzwmidzvpiofnqexd)
- 17 tables, 39+ RLS policies, 15 indexes
- Service role key in .env.local (never expose)

## Deploy
```bash
cd /Volumes/SSD/work/forge-projects/trophe
git push origin main   # Vercel auto-deploys from GitHub (~32s build)
```
Production: https://trophe-mu.vercel.app

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

## Pitfalls (learned the hard way)
- NEVER use `.single()` on ANY query — use `.maybeSingle()` (PGRST116 crash)
- NEVER use `ignoreBuildErrors: true` — it masks real runtime crashes
- ALWAYS add loading guards on async buttons (double-click = double insert)
- `bg-white/3` is invalid Tailwind — use `bg-white/[0.03]`
- Coach pages need role gate — redirect `role === 'client'` to `/dashboard`
- `window.location.href` causes full reload — use `router.push()` from next/navigation
- `.replace('_', ' ')` only replaces first occurrence — use `.replaceAll()`
- Supabase email confirmation ON by default — use admin API with `email_confirm: true`
- Vercel Hobby rejects commits from unrecognized GitHub committers
- i18n file must be .tsx (contains JSX)
- Framer Motion `ease` arrays need `as const` for TypeScript
- React hooks MUST be called before any early `return` statement
- `ringColor` is not a valid CSS property — use `borderColor` instead
