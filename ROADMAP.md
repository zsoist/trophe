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
- [x] ✅ middleware.ts rebuilt: server-side JWT verification + role-based routing

## Michael Feedback #1 — April 13 (same-day turnaround)
- [x] ✅ **(a)** MealSlotConfig: drag-to-reorder with GripVertical handle (HTML5 drag + touch events)
- [x] ✅ **(b)** MealSlotConfig: duplicate slot button (Copy icon → creates "Label 2" clone)
- [x] ✅ **(c)** QuickFoodInput: mic permission UX — `getUserMedia()` warms browser prompt before recognition
- [ ] **(d)** Personalized insights — Phase 3. Michael has prompts from his years of practice. Build on demand.

## Day 11: April 14 — Security Audit + Hardening (28 fixes from 6-agent audit)

### Features
- [x] ✅ Coach macro targets editor: set/override client macro targets (calories, protein, carbs, fat, fiber, water) with Auto-calc button (Mifflin-St Jeor + ISSN)
- [x] ✅ Microphone permission help card: step-by-step instructions when OS-level mic is denied (iPhone/Android/desktop)
- [x] ✅ 5MB file size limit on photo uploads (client-side validation)

### Critical Security Fixes
- [x] ✅ SQL injection in food search routes — sanitized ilike inputs (strip %, _, \)
- [x] ✅ Prompt injection in food parse + meal suggest — input capped at 500 chars, control chars stripped
- [x] ✅ Signup rate limiting (5/hour per IP)
- [x] ✅ Server-side auth middleware (middleware.ts) with JWT verification + role routing
- [x] ✅ Role gating: clients can't access /coach/*, coaches redirect from /dashboard/*
- [x] ✅ RLS enabled on api_usage_log

### High Security Fixes
- [x] ✅ Gemini API key moved from URL to x-goog-api-key header
- [x] ✅ Base64 payload capped at 7MB on photo-analyze
- [x] ✅ Security headers: CSP, X-Frame-Options, X-XSS-Protection, Referrer-Policy
- [x] ✅ FoodSource type drift fixed (added 'ai_estimate')
- [x] ✅ Supabase client placeholder fallback (no crash on missing env vars)

### Medium Fixes
- [x] ✅ 8 FK indexes added
- [x] ✅ 5 ON DELETE cascades/SET NULL added
- [x] ✅ Escape key on MealSlotConfig modal
- [x] ✅ ARIA labels on icon buttons (MealSlotCard, QuickFoodInput, MealSlotConfig)
- [x] ✅ React.memo on CalorieGauge, MacroRadar, ProteinDistribution
- [x] ✅ Unused pg dependency removed
- [x] ✅ .env.local.example created
- [x] ✅ limit param validated on local-search (capped at 50)

### Performance
- [x] ✅ USDA search uses URLSearchParams (cleaner, no key in plain URL)
- [x] ✅ local-search uses anon key instead of service role

### Market Research
- [x] ✅ Full B2B fitness/gym SaaS competitive analysis (Trainerize, TrueCoach, Healthie, Nutrium, etc.)
- [x] ✅ Three-tier product vision validated: Coach tool → Self-service tracker → B2B platform
- [x] ✅ Stripe Connect identified as payment standard for multi-tenant billing

### Migration
- [x] ✅ Migration ran in Supabase SQL Editor (RLS on api_usage_log, 8 FK indexes, 5 cascades, carb_cycling_enabled)
- [x] ✅ Deployed to production — trophe-mu.vercel.app
- [x] ✅ Commit 30d23a4 pushed to GitHub

## Day 12: April 15 — Login Fix + Data QA
- [x] ✅ Login routing fix — coaches now route to /coach, not /dashboard (commit 079a308)
- [x] ✅ Reassigned all 4 testers (Daniela, Nikos, Daniel, Dimitra) to Michael as coach
- [x] ✅ Full E2E QA: 8/8 client pages clean, coach dashboard 100% functional — health score 95/100
- [x] ✅ Deployed commit 079a308
- [x] ✅ MacroFoodIdeas component — protein, fiber, fats, carbs suggestions (Nikos feedback) (commit 584ecea)
- [x] ✅ George Kavdas account created (coach, for Monday partnership meeting)
- [x] ✅ E2E QA verified: 8/8 client + 5/5 coach pages clean, Food Ideas renders, all 4 testers assigned to Michael

## Day 13: April 16 — 50 Coach Components + Evaluator-Optimizer Loop

### Overnight (12/12 tasks — ALL completed, first time ever)
- [x] ✅ Evaluator-optimizer loop worked on Trophē for first time (Codex found signup role bypass → fix-agent auto-patched)
- [x] ✅ Codex fact review: 100 facts, 57 kept, 40 demoted, 3 deleted
- [x] ✅ Codex scored Trophē 4.6/10 (7 warnings beyond the critical)

### 50 Coach Components Built + Integrated
- [x] ✅ Wave 1: 10 dashboard intelligence (greeting, pulse cards, risk heatmap, etc.)
- [x] ✅ Wave 2: 12 client detail (macro gauge, sparklines, mood trend, etc.)
- [x] ✅ Wave 3: 10 smart coaching (auto-macro optimizer, plateau detector, etc.)
- [x] ✅ Wave 4: 10 visual WOAH (transformation card, achievements, confetti, etc.)
- [x] ✅ Wave 5: 8 workflow (message templates, checklist, calendar, etc.)
- [x] ✅ All integrated into coach pages, TypeScript clean, production built and deployed

### Security Fixes
- [x] ✅ Signup role bypass auto-fixed (forced role='client' for public signups)
- [x] ✅ 3 Codex warnings fixed (a11y pinch-zoom, useCallback deps, aria-label)
- [x] ✅ Discord bot codex exec role guard implemented (CRITICAL proposal)

### Proposals Resolved (4/4)
- [x] ✅ Log rotation script created
- [x] ✅ Digest psql timeout fix (20s → 5s + graceful fallback)
- [x] ✅ OpenBrain multi-hop: skipped (already correct defaults)
- [x] ✅ Discord bot role guard: implemented

### Commits
- [x] ✅ 37478ea (integration), 0856a26 (components + fixes)
- [x] ✅ Production deployed: trophe-mu.vercel.app

### Michael Feedback #3 — April 16 (same-day turnaround)
- [x] ✅ Light/dark theme toggle — CSS custom properties, .light class, Sun/Moon animated toggle on Profile + coach header, localStorage persistence
- [x] ✅ Meal Pattern View — coach sees client eating patterns grouped by meal type (frequency, avg macros, common foods), toggle between Pattern/Daily view
- [x] ✅ Role-aware coach navigation — coach/admin/super_admin users can access coach surfaces
- [x] ✅ Logout button — added to coach dashboard header
- [x] ✅ Visible "Customize" button — replaced invisible 14px icon with labeled button + border
- [x] ✅ Legacy dual-role testers migrated to canonical coach/admin/super_admin roles
- [x] ✅ New files: `components/ThemeMode.tsx`, `components/coach/MealPatternView.tsx`
- [x] ✅ Commits: b42c458 (logout + customize visibility), 0a9d993 (light theme + meal patterns + role switcher)

### Evening Session — April 16 (Dashboard Overhaul + Exercise Expansion + Codex Fixes)

#### Dashboard Overhaul
- [x] ✅ Hero welcome card with time-aware greeting + avatar + daily motivation
- [x] ✅ Large 160px CalorieRing (consumed/target/remaining)
- [x] ✅ 4 horizontal MacroBar progress bars (Protein/Carbs/Fat/Fiber) with labels + numbers
- [x] ✅ Meal dots showing X of 5 meals logged
- [x] ✅ Quick Actions 2x2 grid (Log Food, Workout, Water, Progress)
- [x] ✅ Compact water tracker (single line, horizontal segments)
- [x] ✅ Removed: MacroRing, MacroDonut, CarbCyclingSelector, MealTimingIndicator

#### AI Food Parser Calibration
- [x] ✅ CRITICAL ACCURACY RULES in system prompt (exact USDA values for eggs, chicken, rice, etc.)
- [x] ✅ Math validation: cal = P*4 + C*4 + F*9
- [x] ✅ sugar_g field added to ParsedFoodItem interface + output

#### Exercise Database Expansion
- [x] ✅ Expanded from 30 → 113 exercises (83 new gym exercises)
- [x] ✅ Custom exercise modal added to workout page
- [x] ✅ Seed script: scripts/seed-exercises.js

#### Nikos Feedback Fixes
- [x] ✅ Macro ring labels (Cal/P/C/F) — users couldn't tell which ring was which
- [x] ✅ Nikos targets recalculated (protein 139→154g, fat 77→93g per ISSN)
- [x] ✅ Sugar estimate with WHO 36g limit
- [x] ✅ Ring colors: green <90%, gold 90-110%, red >110%

#### Codex Review Fixes
- [x] ✅ Admin costs page: admin-email-only access
- [x] ✅ api-guard.ts: documented intentional unverified JWT
- [x] ✅ CSP re-added with explicit Supabase domain (not wildcard)
- [x] ✅ FoodSearchModal: fixed dead local search path
- [x] ✅ Dead WeightChart function removed (~80 lines)

---

## April 18, 2026 — v0.2 Foundations Day

Goal: 10-20 user enterprise discipline at near-zero cost. Two parallel tracks: Michael feedback fixes + first pieces of v0.2 architecture.

### Michael Feedback (6/7 items shipped)
- [x] ✅ #1 Meal pattern food-focused layout (foods hero, meta demoted)
- [x] ✅ #3 Light/dark theme toggle works in client mode (structural fix: removed hardcoded `dark` on `<html>`, swept 9 dashboard page backgrounds to `var(--bg-primary)`, pre-paint inline script, ESLint guard)
- [x] ✅ #5 Logout verified working
- [x] ✅ #6 Coach/client switcher verified working
- [x] ✅ #7 Duplicate meal slot inserts at source+1 (not appended to end)
- [x] ✅ A Set Macros button scrolls editor into view; Export generates Markdown client report
- [x] ✅ B Macro rings background track visible in both themes
- [x] ✅ C **Recipe analyzer** — paste recipe → AI extracts ingredients + totals + per-serving → slider to log N servings
- [ ] #2 Client-specific habits — deferred to phase 2 (Michael's call)
- [ ] #4 Bi-directional notifications — scoping Sunday

### v0.2 Architecture
- [x] ✅ `/agents/` folder scaffolded (prompts, clients, schemas, per-agent pipelines + README)
- [x] ✅ food-parse migrated: route shrunk 258 → 51 LOC
- [x] ✅ recipe-analyze agent + route + UI modal wired to log page
- [x] ✅ Prompt caching on Haiku 4.5 system prompts (`cache_control: ephemeral`)
- [x] ✅ Vitest 4 + 25 unit tests on nutrition engine
- [x] ✅ GitHub Actions CI: typecheck + lint + test on every PR/push
- [x] ✅ ESLint rule: ban raw dark-only Tailwind on themed surfaces
- [x] ✅ Full doc suite: CHANGELOG, ARCHITECTURE, DEPLOYMENT, SECURITY, RUNBOOK

### Deferred to Sunday/Next Week
- [ ] Supabase Pro upgrade + PITR + migrations folder (needs user click)
- [ ] Promptfoo golden set for food-parse + recipe-analyze (30 cases)
- [ ] Playwright E2E on 5 critical flows
- [ ] `/admin/ops` dashboard (LLM spend, error rate, active users)
- [ ] Shared-components light-mode sweep (110+ classes in `/components/*`, out of Michael's critical path — spawned as background task)
- [ ] Large-file refactor (coach/client/[id]/page.tsx 1499 LOC, coach/page.tsx 1338 LOC, dashboard/log/page.tsx 1040 LOC)
- [ ] `@supabase/ssr` migration → re-enable server-side middleware auth + nonce CSP

### Commits (6 today, all on main + pushed)
- `fceeeaa` fix(security): server-side admin guard
- `4a2b31a` fix: Michael feedback batch 1
- `eeaaa70` refactor(coach): food-first meal pattern view
- `724c84d` refactor(agents): extract food-parse + prompt caching
- `88b94d5` ci: Vitest + GitHub Actions
- `51514f3` feat: recipe analyzer

---

## April 19, 2026 — Monday meeting prep day

Scope: no product-ship work. All effort on the April 20 partnership meeting with Michael Kavdas + George Tsatsaronis (first-time introduction, ~21 yrs deal-making background).

### Built
- [x] ✅ 10-slide HTML meeting deck (`trophe-apr20-deck.html`). Interactive canvas globe on slide 1 (Bogotá ↔ Athens great-circle arc, drag to rotate, traveling pulse dot, Colombia + Greece highlight outlines with ocean-anchored labels, 4 attendees). Flip-card product demo on slide 2. 5-layer architecture diagram on slide 3. Active-tester actor map on slide 4. Strong + moves-we're-building-toward on slide 5. Phases in Greek numerals (ένα · δύο · τρία) on slide 6. Two-column what-I-want-to-hear / input-I-need on slide 7. Profile map on slide 8. Partnership table-setting on slide 9. Close on slide 10.
- [x] ✅ Slide 1 canvas polish: tilt sign fix, DPR scaling for retina sharpness, horizon-aware polygon clipping on country highlights, ocean-anchored labels with leader lines, traveling pulse dot, `minmax(0, 1fr)` grid fix for max-width honoring, mega-font clamp trim.
- [x] ✅ 5 `docs/monday-prep/*` docs updated with the April 19 strategic frame.

### Strategic frame landed
- [x] ✅ Daniel's archetype named: **Technical Co-Founder Who Treats This Like a Paid Apprenticeship**. Top goals A > D > G > H (meaningful side income €500–2K/mo, Dialectica safety, CV credential, fun). 4–8 hrs/week ceiling. Open on equity (20–40%; three-way equal acceptable).
- [x] ✅ Opening statement scripted (2 min, verbatim in `MEETING-NOTES.md`).
- [x] ✅ Walk-away doc finalized (must-haves / won't-accept / open-to in `MEETING-NOTES.md`).
- [x] ✅ `docs/monday-prep/02-agenda-apr20.md` revised with 20-min deck slot.
- [x] ✅ `docs/monday-prep/03-partnership-options.md` reframed from "defend majority" to "three live options + Daniel's transparent stated position."

### Pending
- [ ] Sunday afternoon: rehearse deck out loud, time it (target 15 min delivery).
- [ ] Sunday ~noon Colombia: send agenda + retro as pre-read.
- [ ] Monday 7am Colombia: re-read walk-away note, join call calm.

---

## PHASE 2: Testing (April 10-18, 2026)
_4 test subjects, daily usage, bug collection_

| Tester | Email | Role | Focus |
|--------|-------|------|-------|
| Michael Kavdas | michael@kavdas.com | coach | Assign habits, monitor dashboard |
| Dimitra Kavdas | dimitra@kavdas.com | client | Greek user, female perspective (added Apr 13) |
| Nikos | nikos@biorita.com | client | Athlete, daily meal logging + workouts |
| Daniel | daniel@reyes.com | super_admin | Post-surgery recovery client + dev |
| Daniela | daniela@trophe.app | coach | Biomechanics/engineer perspective |

_All passwords: `trophe2026!`_

- [x] ✅ Test accounts created and verified
- [ ] Michael creating nutrition plans for test subjects (week of Apr 13)
- [ ] Dimitra onboarded as Greek-language client
- [ ] Nikos logs 2-3 days meals + workouts
- [ ] Collect bug reports and feature requests
- [ ] Fix critical bugs as they're found
- [ ] Reconvene meeting (April 16-18)

## May 3, 2026 — Composite Foods + Restaurant Data + UX Fixes (33 commits)

### Sprint 1: Food Accuracy (morning)
- [x] ✅ Branded fast food Wave 3 (23 items + 98 unit conversions)
- [x] ✅ Beverage unit normalization (Wave 3.5)
- [x] ✅ Langfuse production traces via Cloudflare Tunnel
- [x] ✅ Volume unit display fix (ml/L instead of grams)
- [x] ✅ Fried egg canonical fix (gr-12)

### Sprint 2: Composite Dishes + Restaurant Chains (afternoon)
- [x] ✅ Composite dish decomposition pipeline (`dish_recipes` table + LLM decompose-on-miss)
- [x] ✅ 44 cached recipe mappings in decomposition prompt
- [x] ✅ 38 traditional Colombian + Greek dish recipes seeded
- [x] ✅ 76 restaurant chain items (48 MenuStat US + 28 Colombian chains)
- [x] ✅ CI lint parity enforced (--no-cache + vercel.json buildCommand)
- [x] ✅ Oatmeal/salmon name corrections + 50-case eval

### Sprint 3: UX Bug Fixes — Daniela's report (evening)
- [x] ✅ Loading skeleton on food log page (no blank screen)
- [x] ✅ Promise.all parallelization of 4 Supabase queries (~800ms → ~200ms)
- [x] ✅ 15s timeout on food parse + 20s on photo analysis
- [x] ✅ Session refresh on mobile foreground (visibilitychange hook)
- [x] ✅ Better error messages (session expired, timeout, connection)
- [x] ✅ Network error handling (don't false-redirect to login)

---

## PHASE 3: Post-Testing Features (May 2026)
_Top priorities from Michael's feedback_

- [x] ✅ Composite dish decomposition (souvlaki, arepa, bandeja paisa)
- [x] ✅ Restaurant chain data (McDonald's, Starbucks, Crepes & Waffles, El Corral, Frisby)
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
