# τροφή (Trophē) — Precision Nutrition Coaching Platform

## Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Backend**: Supabase (auth + Postgres + RLS)
- **AI**: Gemini (meal suggestions), Anthropic Haiku 4.5 (photo analysis)
- **Food API**: USDA FoodData Central (free, DEMO_KEY)
- **Styling**: Tailwind CSS 4 + Framer Motion + Lucide icons
- **i18n**: Trilingual (EN/ES/EL) via lib/i18n.tsx

## Architecture
- Two roles: `client` and `coach` (and `both`)
- Habit engine: 14-day cycles, one habit at a time (Precision Nutrition methodology)
- Coach assigns habits → client checks in daily → coach sees behavioral intelligence
- Optional food logging with USDA search + AI photo analysis

## Key Files
- `lib/nutrition-engine.ts` — BMR/TDEE/macro calculations (Mifflin-St Jeor)
- `lib/i18n.tsx` — Trilingual dictionary + useI18n() hook
- `lib/types.ts` — All TypeScript interfaces matching Supabase schema
- `lib/supabase.ts` — Supabase client singleton
- `supabase-schema.sql` — Full database schema with RLS policies

## Supabase
- Project: Trophe (iwbpzwmidzvpiofnqexd)
- 13 tables, 30+ RLS policies, 11 indexes
- Service role key in .env.local (never expose)

## Deploy
```bash
cd /Volumes/SSD/work/forge-projects/trophe
git push origin main   # Vercel auto-deploys from GitHub
```

## Env Vars (Vercel)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- GEMINI_API_KEY
- ANTHROPIC_API_KEY

## Design System
- Dark theme (bg-stone-950)
- Gold accent: #D4A853
- Glass morphism: `.glass`, `.glass-elevated`
- Buttons: `.btn-gold`, `.btn-ghost`
- Inputs: `.input-dark`
- Inter (sans) + Playfair Display (serif headings)

## Vercel Deploy Identity
```bash
git config user.name "zsoist"
git config user.email "zsoist@users.noreply.github.com"
```

## Pitfalls
- Supabase RLS blocks all queries if user not authenticated
- i18n file must be .tsx (contains JSX)
- Framer Motion `ease` arrays need `as const` for TypeScript
- Vercel Hobby rejects commits from unrecognized GitHub committers (use zsoist identity)
