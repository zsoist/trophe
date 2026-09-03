# SDD ledger — plan: docs/superpowers/plans/2026-09-02-premium-workout-muscle-atlas.md

## Workspace and baseline

- Existing workspace: `/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902`
- Starting commit: `6f599c60d8e9ad6d74a40e2814f8a1f11116f6a1`
- Branch: `main` (the user explicitly approved work, commits, merges, and deploys in this workspace).
- Spec authority: `docs/superpowers/specs/2026-09-02-premium-workout-muscle-atlas-design.md`

## Pre-flight consistency scan

### Per-task internal consistency

| Task | Tests vs implementation | Files vs later use | Finding |
|---|---|---|---|
| 1 | Contract tests cover anatomy roles, exact media identity, and weighted load | Produces domain contracts consumed throughout Tasks 2–10 | Consistent |
| 2 | Interaction, pause, focus, and reduced-motion tests match visual primitives | Atlas/motion primitives are consumed by Tasks 4–8 | Consistent |
| 3 | Recommendation and authorization tests match migration, schema, pure ranking, and protected routes | Draft-only recommendation is consumed by home/review | Consistent |
| 4 | Home/navigation tests match today rail, atlas, schedule, and tab reselection | Home consumes Tasks 1–3 and feeds discovery/review | Consistent |
| 5 | Discovery tests match muscle-first selection, plan tray, and non-destructive back | Selection feeds Task 7 without starting Task 8 | Consistent |
| 6 | Detail tests match exact media, phases, muscle roles, fallback honesty | Detail consumes Tasks 1–2 and feeds contextual add/replace | Consistent |
| 7 | Builder/review tests match ordering, targets, muscle balance, and explicit start/log | Review is the sole transition into live or retrospective persistence | Consistent |
| 8 | Live tests match one-exercise stage, rest, pause, pain, and confirmed finish | Preserves the existing persistence state machine | Consistent |
| 9 | Analytics tests match accessible calendar/load/history outputs | Consumes Task 1 load calculations and completed evidence | Consistent |
| 10 | Asset-quality tests match 4K master, poster, motion, provenance, and budget | Produces v3 media expected by Task 1 resolver and visual routes | Conflict: listed files do not wire the new manifest into the resolver |
| 11 | Parity/motion/a11y tests match locale and route-shell changes | Integrates copy and motion over Tasks 4–9 | Consistent |
| 12 | E2E and release gates match full atlas → review → live journey | Consumes every prior task and documents/deploys final state | Consistent |

### Shared file/interface pairs

| Tasks | Producer / consumer or shared surface | Finding |
|---|---|---|
| 1 → 2 | `MuscleActivation`, `ExerciseMediaRecord` → atlas and motion | Compatible |
| 1 → 4 | anatomy/media resolvers → home atlas and evidence | Compatible |
| 1 → 5 | media resolver → exact discovery rows | Compatible |
| 1 → 6 | media/anatomy resolvers → exercise detail | Compatible |
| 1 → 7 | media/anatomy/load → plan cards and summary | Compatible |
| 1 → 8 | media contracts → live stage | Compatible |
| 1 → 9 | `calculateMuscleLoad` → analytics | Compatible |
| 1 ↔ 10 | canonical registry/resolver ↔ v3 manifest and cohort | Conflict: Task 10 must update the resolver/registry after generating v3 assets |
| 2 → 4 | `MuscleAtlas` → home target surface | Compatible |
| 2 → 5 | `MuscleAtlas` → discovery | Compatible |
| 2 → 6 | atlas/motion → detail | Compatible |
| 2 → 8 | motion player → live technique access | Compatible |
| 3 → 4 | recommendation source/reasons → today rail/home | Compatible |
| 3 → 7 | recommendation draft → editable plan | Compatible |
| 4 ↔ 11 | workout routes/copy → directional route shell/locales | Compatible if Task 11 owns final integration |
| 5 → 7 | multi-select tray → draft builder | Compatible |
| 5 ↔ 6 | exercise browse/detail routes and add/replace callbacks | Compatible |
| 6 ↔ 11 | detail copy/focus behavior → locale and accessibility integration | Compatible |
| 7 → 8 | explicit Start and saved draft → live state machine | Compatible |
| 8 → 12 | live session semantics → full E2E journey | Compatible |
| 9 → 12 | analytics screens → visual captures and canary | Compatible |
| 10 → 12 | shipped optimized media → media/header/canary checks | Compatible after resolver wiring ruling |
| 11 → 12 | localized route motion/a11y → final verification | Compatible |

Ruling: Task 10 also modifies `lib/workout/exercise-media.ts` and its focused tests to activate `/workout-v3` poster/motion entries after provenance checks — the approved spec requires the premium media to be used, not merely generated — if wrong, this adds a narrow registry integration diff that can be reverted without data loss.

## Baseline test evidence

- Command: `npm test`
- Result: 265 test files passed, 1 skipped, 2 failed; 2050 tests passed, 46 skipped, 6 failed.
- Pre-existing failures: 4 in `tests/components/live-workout-plate-real-consumer.test.tsx` (no atomic save calls / missing materialized warm-up row) and 2 in `tests/components/admin-theme-contract.test.ts` (`localStorage` unavailable in the test runtime).
- Pre-existing output noise: Node `module.register()` deprecation and missing `--localstorage-file` experimental warnings.

Ruling: Continue the approved workout implementation while treating the four live-workout baseline failures as a blocking Task 8 acceptance condition and the two admin/runtime failures plus warnings as a blocking Task 12 release condition — the user explicitly requested continuous execution and broad production readiness — if wrong, this temporarily allows task-scoped commits on top of a known red full suite, but production remains gated on a fully reconciled run.

## Carried adversarial findings

- Task 1: current `Floor Press` lookup can mismatch Barbell and Dumbbell because resolution is name-only; exact equipment compatibility must close it.
- Task 5: the exercise-picker sticky return CTA can sit fully underneath the fixed bottom navigation at 390×844; the plan tray/footer must own safe-area/nav clearance.
- Task 8: severity 4–5 pain copy says pause/stop while the live clock currently continues; high-severity pain must trigger the durable auto-pause path.
- Task 11: translated bottom-nav labels can overflow at 350–390px; responsive labels must remain bounded or icon-only until enough width, with geometry tests updated.

## Baseline diagnostic reconciliation

- Evidence: `.superpowers/sdd/2026-09-02-premium-workout-muscle-atlas/baseline-diagnostic.md`.
- Focused control under `NODE_OPTIONS=--no-experimental-webstorage`: live warm-up 7/7 and admin theme 21/21 pass.
- Root cause of the six baseline failures: Node 26 experimental Web Storage collides with Vitest/jsdom's Web Storage implementation.
- Separate product risk exposed: the live persistence path must not prevent a healthy atomic server write merely because browser storage is unavailable.
- The earlier pain auto-pause concern is already addressed on the starting commit after a successful severity 4–5 save; Task 8 must preserve and test it, not duplicate it.

Ruling: Treat the six initial failures as an environmental baseline defect, stabilize the final test runner with `--no-experimental-webstorage`, and require Task 8 to make local draft storage best-effort around authoritative atomic server saves — this preserves offline recovery when available without making storage availability a prerequisite for safety-critical workout logging — if wrong, a browser with denied storage could retain less local recovery context, but server-authoritative data remains intact and the behavior is explicitly testable.

- Environment repair: moved only duplicate `node_modules/@types/* 2` directories into the plan-local ignored quarantine; `npm run typecheck` then passed with no output errors. No source or lockfile changed.
- Task 1: fix round 1/5 (2 addressed, 0 open — exact equipment aliases/conflicts; explicit completed-set requirement; commits `87c9bcb..9554ff5`).
- Task 1: complete (commits `6f599c6..9554ff5`, review clean).
- Task 2: fix round 1/5 (4 addressed, 1 open — media truth gate, focus semantics, reduced-motion hydration, controlled view; boundary-clipped hit targets remained; commits `230e93b..d449b05`).
- Task 2: fix round 2/5 (1 addressed, 0 open — boundary-safe ≥44px atlas hit targets; commits `d449b05..7abe46c`).
- Task 2: complete (commits `9554ff5..7abe46c`, review clean).

Ruling: Task 3 will create the plan-specified `drizzle/0082_workout_preferences.sql` directly instead of also running `supabase migration new`, because this repository's deployed history is the numbered Drizzle directory and generating a parallel `supabase/migrations` entry would create two migration authorities — official Supabase guidance is still applied to JSONB, grants, RLS, UPDATE visibility, and index review — if wrong, the migration will need to be imported into a future Supabase CLI history, but the repository remains internally consistent and rollback is a single additive column.
- Task 3: fix round 1/5 (6 addressed, 3 open plus 1 new — exact authorization/race, base tenant isolation, weekday, volume, audit closed; anatomy truth, reasons, caller proof, coach-private references remained; commits `d64320c..d14aec5`).
- Task 3: fix round 2/5 (3 addressed, 1 open — real anatomy, truthful caps/reasons, referenced coach-private closed; behavioral tenant caller proof remained; commits `d14aec5..30ca9a4`).
- Task 3: fix round 3/5 (route defense-in-depth and other-coach caller proof added; one current-coach unreferenced test gap remained; commits `30ca9a4..d48c94f`).
- Task 3: fix round 4/5 (current-coach unreferenced mutation tripwire addressed; 0 open; commits `d48c94f..fdb2c98`).
- Task 3: complete (commits `7abe46c..fdb2c98`, review clean).
- Task 4: fix round 1/5 (6 addressed, 1 open — truthful loading/empty/cardio, singular CTA, compact atlas, strongest roles, source labels; cardio+offer fallback remained; commits `40fcb71..80998dc`).
- Task 4: fix round 2/5 (atlas/rail/title cardio precedence addressed; Schedule contradiction remained; commits `80998dc..e315bcf`).
- Task 4: fix round 3/5 (Schedule now shares saved-draft evidence; 0 open; commits `e315bcf..e1bf53d`).
- Task 4: complete (commits `fdb2c98..e1bf53d`, review clean).
- Task 5: fix round 1/5 (3 Important and 2 Minor findings addressed — narrow Add affordance, 320px tray/reachability, picker atlas/media localization, truthful back-view legend, muscle-group terminology, and lazy poster decoding; 1 Important plus 1 Minor remained in the Home atlas consumer/localized singular ARIA; commits `4830abc..b4965e7`).
- Task 5: fix round 2/5 (Home atlas consumer copy and singular anatomical-role ARIA localized; German, Dutch, and Greek composed role grammar remained Important because tests asserted isolated tokens; commits `b4965e7..b1cd840`).
- Task 5: fix round 3/5 (grammar-safe complete role noun phrases and composed production ARIA assertions added; internal post-comma capitalization remained Important in EN/EL/DE/NL; commits `b1cd840..ce00422`).
- Task 5: fix round 4/5 (sentence-internal role casing corrected for EN/EL/DE/NL while preserving inflection; exact all-role/all-locale assertions; commits `ce00422..27570f1`; scoped re-review pending).
- Task 5: complete (commits `e1bf53d..27570f1`, final scoped review clean; muscle-first browse, truthful exact media, persistent multi-add tray, 320px reachability, Home atlas and all eight locales accepted).
- Task 6: fix round 1/5 (rerender-stable sheet focus, session-pause-aware motion, real-browser detail/sheet geometry, stale-PR reset, and explicit pause-spy addressed; commits `3de55b8..b04fabb`; 79 unit/component tests and authenticated light/dark 320/375/390/430 Playwright passed; scoped re-review pending).
- Task 6: fix round 1 re-review found 1 Important proof gap: Playwright paused before its timer wait, so it did not exercise the running-clock rerender despite the application fix and direct rerender unit test being sound; fix round 2/5 opened.
- Task 6: fix round 2/5 (Playwright separated live and paused phases, but captured clock before sheet focus, leaving a race where the poll could pass without a post-focus tick; commit `45bdf0a`).
- Task 6: fix round 3/5 (clock baseline captured after child focus, next displayed tick observed before focus assertion; commit `60b647d`; scoped re-review pending).
- Task 6: complete (commits `27570f1..60b647d`, final scoped review clean; 79 focused tests, authenticated light/dark four-width browser geometry/focus coverage, and repeated post-focus timer proof accepted).
- Task 7: implementation commit `b89b114` passed 168 focused tests, typecheck, targeted lint, and diff-check; review found 2 Important issues (route-level Review mutability and absent pointer reordering) plus 1 Minor same-ID replacement churn.
- Task 7: fix round 1/5 addressed all findings in `9519d39`: draft-only add/replace route guards, stable-ID pointer reordering with retained 44px buttons, and same-ID replacement no-op/disabled state; 170 broader focused tests, typecheck, targeted lint, and diff-check passed.
- Task 7: complete (commits `60b647d..9519d39`, scoped re-review clean; explicit immutable Review, distinct Start/Log/Save actions, honest device-draft prescription fields, deterministic muscle summary, and draft-only replacement flow accepted).
- Task 8: initial commit `ece65b1` passed 165 focused tests/typecheck/lint; review accepted storage isolation, durable pain ordering, exact media, and finish authority but found 4 Important live-flow issues plus superficial Pain/Plate structure.
- Task 8: fix round 1/5 (`df638c8`, `62198ce`) addressed navigable stable-ID path, final finish-ready state, required consumer tests, and material Pain/Plate hierarchy; re-review left paused rest/remount correctness open and rejected the module-global snapshot cache.
- Task 8: fix round 2/5 (`c33d2cd`) replaced the global cache with session-scoped parent rest snapshots; re-review found cleanup misplaced on Superset, absent on Remove, and a `created_at` regression-fixture gap.
- Task 8: fix round 3/5 (`1531f43`) preserved rest through successful Superset, cleared removed-exercise snapshots only after successful server mutation, and seeded exact `created_at` fake-time evidence; 82 focused tests/typecheck/lint/diff-check passed.
- Task 8: complete (commits `9519d39..1531f43`, final scoped re-review clean; one-stage live flow, real pause semantics, finish/discard authority, high-pain durable auto-pause, and best-effort browser storage accepted).
- Task 9: implementation and review fixes (`2bccef4..c09eff5`) grounded analytics in terminal workout evidence, added pagination/deduplication, truthful preferred-unit and empty states, per-session aggregation, and full eight-locale rendering checks.
- Task 9: final exact-session fix (`fd11f26`) scopes “Last” to the newest terminal strength session ID, preventing later same-day cardio or unresolved sessions from inheriting earlier strength work; focused 19/19 plus related 23 tests, typecheck, lint, and diff-check passed.
- Task 9: complete (commits `1531f43..c09eff5`, final scoped re-review clean; real schedule, measurement, history, recent-session, progress, and muscle-load surfaces accepted with no fabricated data).
- Task 10: initial premium media implementation `88d4475` produced 16 exact-name/equipment-gated generated exercise assets, 3840×2160 deterministically upscaled masters, responsive posters, and real three-phase WebM loops; independent review found one P1 verification gap because tests trusted manifest motion declarations without decoding output.
- Task 10: fix round 1/5 (`97efe84`) added isolated decoder-backed negative fixtures and validates VP9, 960×540, 2 fps, 2 seconds, exactly four decoded frames, pairwise-distinct setup/work/finish, frame 4 = frame 2, actual SHA-256 values, native dimensions, and truthful resampling for all 16 loops.
- Task 10: complete (commits `c09eff5..feb8e76`, final independent re-review clean; 16 reviewed exact exercise/equipment media records, genuine decoded phase motion, provenance, budgets, resolver gating, reduced-motion consumption, and mechanical corruption/regression defenses accepted).
