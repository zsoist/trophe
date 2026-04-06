# τροφή (Trophē) — Roadmap

## Day 1: Foundation ✅
- [x] ✅ Project bootstrap (Next.js 16 + Supabase + Tailwind 4)
- [x] ✅ Database schema (13 tables + RLS + indexes)
- [x] ✅ Nutrition engine (BMR/TDEE/macros)
- [x] ✅ i18n system (EN/ES/EL)
- [x] ✅ Auth flow (login/signup with role selection)
- [x] ✅ Onboarding wizard (5 screens)
- [x] ✅ 10 habit templates seeded (trilingual)
- [x] ✅ Premium landing page

## Day 2: Full App Build ✅
- [x] ✅ Client dashboard (habit + macros + water)
- [x] ✅ Food logging with USDA API (350K+ foods)
- [x] ✅ Supplement checklist
- [x] ✅ Progress tracking (weight + habits)
- [x] ✅ Profile management
- [x] ✅ Bottom navigation (i18n)
- [x] ✅ Coach client overview dashboard
- [x] ✅ Individual client deep-dive
- [x] ✅ Habit library management (10 trilingual templates)
- [x] ✅ Supplement protocol builder
- [x] ✅ Custom food database
- [x] ✅ AI meal suggestions (Gemini)
- [x] ✅ AI photo analysis (Anthropic)
- [x] ✅ 4 API routes (food search, nutrition calc, AI suggest, AI photo)
- [x] ✅ Server-side signup (bypasses email confirmation)
- [x] ✅ Demo accounts seeded (Nikos + Daniel)

## Day 3: QA + Polish ✅
- [x] ✅ Full visual QA on mobile (375x812)
- [x] ✅ Deep code audit (22 bugs found, all critical/high fixed)
- [x] ✅ .single() → .maybeSingle() (prevents PGRST116 crashes)
- [x] ✅ Double-click guards (habit check-in, water)
- [x] ✅ Food search API key mismatch fixed
- [x] ✅ BottomNav i18n (was hardcoded English)
- [x] ✅ bg-white/3 → bg-white/[0.03] (valid Tailwind)
- [x] ✅ Login redirect for unauthenticated users
- [x] ✅ I18nProvider added to root layout
- [x] ✅ Performance verified (<650ms all pages)

## Day 4: Demo Prep (before Thursday)
- [ ] Walk Nikos through signup flow
- [ ] Have Nikos log 2-3 days of meals
- [ ] Coach assigns supplement protocol to Nikos
- [ ] Test language switching (EN/ES/EL) live
- [ ] Prepare talking points for Kavdas meeting
