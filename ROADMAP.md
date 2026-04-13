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
- [x] ✅ 2026-04-07 Critical meal tracking fix: source CHECK constraint mismatch (meals were silently failing to save)
- [x] ✅ 2026-04-07 Photo paste support added (clipboard images → AI analysis)
- [x] ✅ 2026-04-07 Removed capture="environment" (now allows gallery + camera)
- [x] ✅ 2026-04-07 "Lock All" meal feature built (per-meal + bulk, localStorage)
- [x] ✅ 2026-04-07 Error handling added to Copy Yesterday + RecipeSuggestions inserts
- [x] ✅ 2026-04-07 CLAUDE.md optimized with full API reference, pitfalls, deploy notes
- [x] ✅ 2026-04-07 API integration tests: 4/6 pass (food search, local search, nutrition calc, auth signup)
- [ ] Walk Nikos through signup + first habit check-in
- [ ] Have Nikos log 2-3 days of meals + a workout
- [ ] Coach assigns supplement protocol to Nikos
- [ ] Test language switching (EN/ES/EL) live
- [ ] Prepare talking points for Kavdas meeting

## Day 6-7: Mega Meal Tracking Upgrade (2026-04-08)

### Iteration 1: Core UX (11 features)
- [x] ✅ Sticky save bar (fixed bottom, always visible)
- [x] ✅ Success celebration animation (checkmark burst)
- [x] ✅ Undo delete with 5s soft-delete toast
- [x] ✅ Macro targets vs consumed with color-coded progress
- [x] ✅ Quick favorites (star entries, one-tap re-log)
- [x] ✅ Meal logging streak (flame counter)
- [x] ✅ Floating remaining calorie budget counter
- [x] ✅ Smart retry on parse failure + manual entry fallback
- [x] ✅ Photo preview during analysis
- [x] ✅ Voice input (Web Speech API)
- [x] ✅ Quick add manual entry

### Iteration 2: Engagement + Intelligence (8 features)
- [x] ✅ Meal quality score (A/B/C/D badges per meal)
- [x] ✅ Daily nutrition insights (client-side AI)
- [x] ✅ Weekly summary card (7-day bar chart + trends)
- [x] ✅ Animated macro progress rings (SVG)
- [x] ✅ Achievement badges (6 milestones)
- [x] ✅ Fiber tracking in all displays
- [x] ✅ Nutritional warnings (low protein, high carb)
- [x] ✅ Animated number transitions

### Iteration 3: Customization (6 features)
- [x] ✅ Custom meal slots (add/remove/rename/reorder)
- [x] ✅ Meal notes per slot
- [x] ✅ Meal quality score badges on cards
- [x] ✅ View mode toggle (Macros/Gauge/Radar)
- [x] ✅ Theme color picker (6 accent colors)
- [x] ✅ Compact meal view mode

### Iteration 4: Calendar & Navigation (10 features)
- [x] ✅ Date navigator (arrows, swipe, today button)
- [x] ✅ Monthly calendar view (color-coded days, streak fire)
- [x] ✅ Week strip (horizontal 7-day bar)
- [x] ✅ Day comparison drawer (side-by-side)
- [x] ✅ Streak freeze (1/week protection)
- [x] ✅ Smart health tips (21 rotating, context-aware, hourly)

### Iteration 5: Charts & Analytics (10 features)
- [x] ✅ 30-day macro trend chart (multi-line SVG)
- [x] ✅ Calorie heatmap (GitHub-style grid)
- [x] ✅ Calorie gauge (speedometer)
- [x] ✅ Macro radar chart (5-axis spider)
- [x] ✅ Protein distribution bars
- [x] ✅ Food frequency ranking (top 8)
- [x] ✅ Eating window tracker
- [x] ✅ Day-of-week patterns
- [x] ✅ Macro adherence scoring
- [x] ✅ Monthly report card (A-F grade)

### Iteration 6: Templates & Data (8 features)
- [x] ✅ Meal templates (save/load full meals)
- [x] ✅ Data export (CSV with date range)
- [x] ✅ Food search modal with filters
- [x] ✅ Nutrient density scoring
- [x] ✅ Fasting timer
- [x] ✅ Meal photo gallery
- [x] ✅ End-of-day summary (shareable)
- [x] ✅ API cost tracker + admin dashboard

### QA Fixes (8 issues resolved)
- [x] ✅ MealSlotConfig Save/Cancel moved to top (iOS-style)
- [x] ✅ CalorieGauge animation rewritten (stroke-dasharray)
- [x] ✅ MealTimeline dot positioning fixed
- [x] ✅ FastingTimer simplified to eating window only
- [x] ✅ ProteinDistribution cleaned up
- [x] ✅ CalorieHeatmap empty cell visibility fixed
- [x] ✅ Food input buttons separated from textarea
- [x] ✅ Health tip time-awareness (no "breakfast" at 11pm)

## Day 8: AI Form Check + Demo Page (2026-04-08→09)
- [x] ✅ MediaPipe Pose integration (browser WASM, 33 landmarks, 30+ FPS)
- [x] ✅ Bulgarian Split Squat reference dataset (202 data points from gym-analysis)
- [x] ✅ lib/form-analysis.ts — ported biomechanics math from Python
- [x] ✅ FormCheck component (camera + detection loop + rep counting)
- [x] ✅ PoseOverlay component (green skeleton + angle labels)
- [x] ✅ FormScore component (gauge + per-rep breakdown)
- [x] ✅ Form Check page at /dashboard/workout/form-check
- [x] ✅ Demo page for Michael Kavdas (/demo) with EN/EL toggle
- [x] ✅ Michael's account created (michael@kavdas.com, coach)
- [x] ✅ Gold banner on landing page (temporary, removed April 13)
- [x] ✅ form_analyses table created in Supabase
- [x] ✅ MacroTrendChart .single() → .maybeSingle() fix
- [x] ✅ Overnight audit: 97/100, all 10 tasks ran

## Day 9: Kavdas Meeting + Documentation (2026-04-09)
- [x] ✅ Meeting with Michael Kavdas (1.5h)
- [x] ✅ Meeting report PDF generated
- [x] ✅ MEETING-NOTES.md created
- [x] ✅ BUSINESS.md created (business plan, competitive landscape, roadmap)
- [x] ✅ SPEC.md updated with Michael's vision
- [x] ✅ All system docs updated

## Day 10: April 13 Audit + Hardening
- [x] ✅ All 29 uncommitted/unpushed commits synced to GitHub
- [x] ✅ lib/api-guard.ts — per-user + per-IP rate limiting on all 3 AI routes (60 auth/10 anon per 15min)
- [x] ✅ lib/server-admin.ts — admin bearer-token auth guard for seed routes
- [x] ✅ Gold demo banner removed from landing page
- [x] ✅ Form analyses saved to Supabase form_analyses table (was TODO/alert)
- [x] ✅ Dimitra Kavdas account created (dimitra@kavdas.com, client, Greek)
- [x] ✅ middleware.ts deleted (client-side Supabase auth confirmed pattern)

## Michael Feedback #1 — April 13 (same-day turnaround)
- [x] ✅ **(a)** MealSlotConfig: drag-to-reorder with GripVertical handle (HTML5 drag + touch events)
- [x] ✅ **(b)** MealSlotConfig: duplicate slot button (Copy icon → creates "Label 2" clone)
- [x] ✅ **(c)** QuickFoodInput: mic permission UX — `getUserMedia()` warms browser prompt before recognition
- [ ] **(d)** Personalized insights — Phase 3. Michael has prompts from his years of practice. Build on demand.

---

## PHASE 2: Testing (April 10-18, 2026)
_4 test subjects, daily usage, bug collection_

| Tester | Email | Role | Focus |
|--------|-------|------|-------|
| Michael Kavdas | michael@kavdas.com | coach | Assign habits, monitor dashboard |
| Dimitra Kavdas | dimitra@kavdas.com | client | Greek user, female perspective (added Apr 13) |
| Nikos | nikos@biorita.com | client | Athlete, daily meal logging + workouts |
| Daniel | daniel@reyes.com | both | Post-surgery recovery client + dev |
| Daniela | daniela@trophe.app | both | Biomechanics/engineer perspective |

_All passwords: `trophe2026!`_

- [x] ✅ Test accounts created and verified
- [ ] Michael creating nutrition plans for test subjects (week of Apr 13)
- [ ] Dimitra onboarded as Greek-language client
- [ ] Nikos logs 2-3 days meals + workouts
- [ ] Collect bug reports and feature requests
- [ ] Fix critical bugs as they're found
- [ ] Reconvene meeting (April 16-18)

## PHASE 3: Post-Testing Features (May 2026)
_Top priorities from Michael's feedback_

- [ ] Nutritional plan generator (AI builds, coach adjusts)
- [ ] Supermarket list with local products
- [ ] Client diary → pattern mapping → plan adjustment
- [ ] Recipe suggestions by culture/city
- [ ] Gamification improvements (reaffirmation nudges)
- [ ] Client profile portability
- [ ] Educational content delivery for nutritionists

## PHASE 4: Launch Prep (June-July 2026)
- [ ] Legal entity established
- [ ] Pricing model finalized
- [ ] Onboard 2-3 more beta nutritionists
- [ ] Marketing via Michael's network
- [ ] Eastern medicine research phase begins
