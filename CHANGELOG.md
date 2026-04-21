# Changelog

All notable changes to Trophē are logged here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — v0.2 in progress

### Added
- `/agents/` folder as single source of truth for LLM surface (prompts, clients, schemas, per-agent pipelines). Routes shrink to thin adapters (food-parse went 258→51 LOC).
- **Recipe analyzer** (Michael #C): paste-a-recipe flow on food log page. Agent extracts ingredients, computes totals + per-serving, slider to log 0.25× → full recipe as a single food_log entry.
- Prompt caching (`cache_control: ephemeral`) on Haiku 4.5 system prompts. Cache hits cost ~10% of normal input tokens; ~70% projected spend reduction at steady state.
- Vitest + `@vitest/coverage-v8`. 25 unit tests on `lib/nutrition-engine.ts` covering BMR, TDEE, goal calorie adjustments, ISSN macro targets, fiber/water, step calories, remaining macros.
- GitHub Actions CI pipeline (`.github/workflows/ci.yml`): typecheck + lint + test on every PR and push to main. Node 20, 10-min timeout, concurrency cancel-in-progress.
- ESLint rule banning raw `bg-stone-9xx|bg-neutral-9xx|bg-zinc-9xx` on themed surfaces (`app/dashboard/**`, `app/onboarding/**`). Prevents light/dark regression.
- Pre-paint inline theme script in `app/layout.tsx` — no flash of wrong theme on cold load.
- Coach Export button on client detail: downloads a Markdown report (profile + macros + active habit + recent notes).
- Full doc suite: CHANGELOG, ARCHITECTURE, DEPLOYMENT, SECURITY, RUNBOOK.

### Changed
- Theme toggle now functions in client mode (previously worked only on coach pages due to hardcoded `dark` class on `<html>` and `bg-stone-950` page backgrounds that ignored `.light`). Swept 9 dashboard page backgrounds to `var(--bg-primary)`.
- Macro progress rings on `/dashboard/log` use `var(--border-default)` for background track (previously `rgba(255,255,255,0.05)`, nearly invisible). Rings now read as rings, not crooked arcs.
- MealPatternView redesigned food-first (Michael #1): individual foods are the hero with frequency bars + per-food avg calories; meta aggregates (avg kcal/day, P/C/F) demoted to small footer row.
- MealSlotConfig duplicate: new slot inserts at source index + 1 and renumbers `order` instead of appending to end (Michael #7).
- Coach client Set Macros button now scrolls the in-page editor into view (was silently toggling state 600px above the floating action bar).

### Fixed
- `fceeeaa` — server-side admin guard for `/admin/*` routes (Codex HIGH #2).

## [Apr 18–19, 2026] Monday meeting prep sprint

No product-ship work; all effort on the April 20 partnership meeting with Michael Kavdas + George Tsatsaronis.

### Added
- 10-slide HTML meeting deck (`trophe-apr20-deck.html`, outside product bundle). Canvas-rendered interactive globe on slide 1 (Bogotá ↔ Athens great-circle arc, drag to rotate, traveling pulse dot, Colombia + Greece highlight outlines with ocean-anchored labels, τροφή letter-by-letter reveal + shimmer sweep, 4 attendees). Flip-card product demo on slide 2. 5-layer architecture / AI-engineering diagram on slide 3. Active-tester actor map on slide 4. Strong + moves-we're-building-toward on slide 5. Phases in Greek numerals (ένα · δύο · τρία) on slide 6. Two-column what-I-want-to-hear / input-I-need on slide 7. Profile map on slide 8. Partnership table-setting on slide 9. Close on slide 10.
- `docs/monday-prep/` — five internal prep docs: retro, agenda, partnership options, positioning, cut decision.
- Strategic frame captured in `MEETING-NOTES.md`: Daniel's archetype (Technical Co-Founder / CTO), top goals A > D > G > H, 4–8 hrs/week ceiling, open equity stance (20–40%; three-way equal acceptable).

### Fixed (slide 1 globe — canvas renderer polish)
- `G_TILT` sign flip: −32° → +23°. North hemisphere now faces viewer (previous setting showed southern hemisphere).
- High-DPI canvas: backing store scaled by `devicePixelRatio`, logical coord system unchanged via `ctx.scale(dpr, dpr)`. Retina sharpness restored.
- Horizon-aware polygon clipping on Colombia + Greece highlight outlines. Fills only when fully on the visible hemisphere (avoids diagonal chord-cut artifacts at the limb). Stroke-only otherwise.
- Ocean-anchored pill labels: Colombia at Pacific `[1, −82.5]`, Greece at south Aegean `[34.5, 26.5]`, each with dashed gold leader line from hero dot. Labels rotate with globe naturally.
- Traveling pulse dot along the Bogotá → Athens arc (~5s loop). Reuses pre-computed 100-point great-circle array by index; zero trig per frame.
- Title grid `minmax(0, 1.1fr) minmax(0, 1fr)` + `max-width: 1400px` + mega-font trim to `clamp(96px, 14vw, 240px)` — prevents display typography from silently forcing the grid wider than its parent cap on fullscreen.

## [Apr 17, 2026] Codex cycle + food accuracy deep fix

- `7087ea1` — docs: Codex score 5.6, food accuracy pitfall captured

## [Apr 16, 2026] Coach components integration + food accuracy

- `37478ea` + `0856a26` — 50 coach components built, integrated into pages
- `946a3f0` — dashboard overhaul (CalorieRing + MacroBars + Quick Actions); protein calibration; sugar tracking
- `90a83c6` — **critical**: 22 serving-size defaults + 21 DB entries rewritten (yogurt 170→150g, chicken 175→120g, feta 100→30g, rice 185→150g). Protein was overestimated 20-30% across the board.
- `9ec7247` — macro ring labels + Nikos targets recalc (ISSN 2.0 g/kg protein) + sugar estimate
- `14b8564` — all Codex warnings resolved (target 4.6 → 8+)
- `196fe80` — local timezone for all date calculations (was UTC, caused day-boundary bugs)
- `0a9d993` / `b42c458` — Michael feedback #3 shipped: light theme, meal patterns, role switcher, visible customize button, coach logout

## [Apr 15, 2026] Michael testing kickoff + macro food ideas

- `584ecea` — macro food ideas: context-aware suggestions by remaining macros
- `035c8d6` — **pitfall fixed**: CSP header was blocking Supabase fetch on mobile browsers. Removed wildcard, added explicit project domain.
- `079a308` — route coaches to `/coach` after login, not `/dashboard`

## [Apr 14, 2026] Security audit + coach macro targets

- `30d23a4` — 6-agent security audit with 28 fixes; coach macro targets editor; Michael feedback #2
- `86ea8c3` / `c4db15e` / `a62b9ff` — **pitfall**: Supabase JS v2 stores sessions in localStorage, not cookies. Server-side middleware auth cannot read them. Removed blocking middleware, added client-side role guards + documented in CLAUDE.md.

## [Apr 13, 2026] Michael feedback #1

- `a774567` — drag-to-reorder meal slots, duplicate slot, mic permission UX
- `7fb5ff1` — rate limiting on AI routes, form save, banner removal, Dimitra added as client

## [Apr 9, 2026] Kavdas meeting retrospective

- `473e4b3` / `6d12086` — `.single()` → `.maybeSingle()` sweep; form_analyses table; post-meeting doc sprint

## [Apr 8, 2026] 60-feature mega upgrade + Form Check

- `1a316f7` / `f81d26a` / `103cf75` — 60-feature mega upgrade: calendar, charts, analytics, engagement, cost tracking
- `a1c0143` / `4687f6d` / `0cb04db` — **AI Form Check**: browser-based exercise analysis via MediaPipe Pose (33 landmarks, 30+ FPS, no server). Camera fallback + Safari roundRect compat.
- `9596590` / `2851bc6` / `2c8173f` — demo page for Michael Kavdas (EN/EL toggle)

## [Apr 7, 2026] Meal tracking iterations + custom foods

- `4903877` / `6e18d97` / `5c4e988` — 25 meal tracking features across 3 iterations
- `d75ec2c` — CLAUDE.md optimized with API reference, pitfalls, deploy notes

## Earlier

Project bootstrap April 5, 2026. Day 1 foundation (Next.js 16 + Supabase + Tailwind 4 + auth + onboarding + nutrition engine + i18n). Full day-by-day through April 6 in `ROADMAP.md`.
