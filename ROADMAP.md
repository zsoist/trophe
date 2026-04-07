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
- [x] ✅ Supplement checklist + Progress tracking + Profile
- [x] ✅ Coach dashboard + client deep-dive + habit library
- [x] ✅ Supplement protocol builder + Custom food database
- [x] ✅ AI meal suggestions (Gemini) + AI photo analysis (Anthropic)
- [x] ✅ Server-side signup (bypasses email confirmation)
- [x] ✅ Demo accounts seeded (Nikos + Daniel + Daniela)

## Day 3: 40 Features + QA ✅
### Round 1 (20 features)
- [x] ✅ Habit mastery celebration + weekly check-in + coach summary
- [x] ✅ Habit auto-progression + compliance heatmap
- [x] ✅ Meal timing indicator + 12 recipe suggestions + 20 Greek foods
- [x] ✅ Weekly macro chart + carb cycling selector
- [x] ✅ Session note templates + activity timeline + progress photos
- [x] ✅ Myth-busting cards + body composition calculator
- [x] ✅ Personalized greeting + streak badges + Greek food labels
- [x] ✅ Export coaching summary + enhanced onboarding

### Round 2 (20 features)
- [x] ✅ Enhanced macro rings (%, consumed/target) + food quick history
- [x] ✅ Quick stats bar + habit detail modal + visual water bottle
- [x] ✅ Coach search/filter + quick actions + onboarding status
- [x] ✅ Supplement compliance grid + coach activity chart
- [x] ✅ Macro donut chart + weight projection + meal timeline
- [x] ✅ Client comparison table + habit radar chart
- [x] ✅ Toast notifications + loading skeletons + keyboard shortcuts
- [x] ✅ Client avatars + error boundary

### QA (22+16 bugs fixed)
- [x] ✅ Deep code audit: .single()→.maybeSingle(), double-click guards
- [x] ✅ ignoreBuildErrors REMOVED — 4 hidden TS errors found & fixed
- [x] ✅ Auth redirects on all pages, role gates on coach pages
- [x] ✅ E2E browser QA: 0 console errors across all pages

## Day 4: Workout Module ✅
- [x] ✅ Workout logging (timer, exercise picker, sets/reps/RPE, PR detection 🏆)
- [x] ✅ Workout history (past sessions, volume, repeat workout)
- [x] ✅ Muscle volume dashboard (weekly sets by muscle, frequency alerts)
- [x] ✅ Personal records board + weekly volume trend
- [x] ✅ Exercise comparison across sessions
- [x] ✅ Coach workout templates (create, assign to clients)
- [x] ✅ Pain flag system (injury tracking per exercise)
- [x] ✅ 30 trilingual exercises seeded (EN/ES/EL)
- [x] ✅ Landing page trilingual switcher with fade effect

## Day 5: Final QA + Demo Prep (before Thursday)
- [x] ✅ TypeScript strict mode ON (no ignoreBuildErrors)
- [x] ✅ Deep audit: 16 more fixes (auth redirects, .maybeSingle())
- [x] ✅ Swap cleaned (killed stale processes, 2.9GB free RAM)
- [ ] Walk Nikos through signup + first habit check-in
- [ ] Have Nikos log 2-3 days of meals + a workout
- [ ] Coach assigns supplement protocol to Nikos
- [ ] Test language switching (EN/ES/EL) live
- [ ] Prepare talking points for Kavdas meeting
