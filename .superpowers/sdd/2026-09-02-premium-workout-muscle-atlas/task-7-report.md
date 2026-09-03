# Task 7 report — premium plan editor and review

## Outcome

Implemented the strength plan editor and review as compact Personal Best evidence boards. `PlanExerciseCard` owns resolver-backed movement identity and prescription evidence, while `PlanMuscleSummary` owns working-set totals, an explicitly estimated duration, deterministic role-weighted muscle load, and honest missing/concentrated-evidence warnings.

Builder controls now edit sets, reps, rest, target RPE, and notes; move earlier/later; remove; open full technique detail; and enter a deterministic replacement flow. Replacement travels through the existing muscle-first browser/detail routes, preserves the replaced row's prescription and position, rejects duplicates, returns to the originating Build/Review route, and does not create a session.

Review is immutable-looking and separates four decisions: Edit workout, Start workout, Log completed workout, and Save plan. Start is the only live-session path; retrospective logging remains distinct. Cardio Build/Review paths and the existing start/retrospective locks remain intact.

## Persistence truth

The recovered workspace payload remains version 2 for backward compatibility. Optional `restSeconds`, `targetRpe`, and `notes` round-trip in the device draft; older v2 drafts without them still load and receive UI defaults. These fields are included in the draft fingerprint so an exact pending request remains identifiable, but are intentionally omitted from the server `liveStructure` and saved-routine write because the existing repository schema only persists name, order, sets, and reps. The UI states this limit beside Save plan and in the success message. No schema/RPC change was introduced.

## TDD evidence

RED:

- The first focused run failed 19 assertions: the plan summary, full prescription controls, immutable review, explicit replacement/detail routing, optional draft-field storage, replacement mutation, and new copy were absent or still encoded legacy semantics.
- A later focused fingerprint test failed because the advanced draft prescriptions were not represented in `draftFingerprint`; the fingerprint was then extended without widening the server live payload.

GREEN:

- `npx vitest run tests/components/workout-builder-v3.test.tsx tests/components/workout-review-v3.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts tests/components/workout-workspace-provider.test.tsx tests/components/exercise-route-provider.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/lib/overlay-locale-coverage.test.ts tests/components/workout-builder-page.test.tsx tests/components/workout-review-page.test.tsx tests/components/live-workout-page.test.tsx tests/components/workout-home-data-flows.test.tsx tests/workout/workout-summary-accuracy.test.ts tests/workout/workout-write-verification.test.ts` — 16 files, 168 tests passed.
- `npm run typecheck` — passed.
- Targeted ESLint across every changed/new TypeScript and TSX production/test file — passed with no output.
- `git diff --check` — passed.

## Localization and responsive/accessibility work

All new visible and ARIA copy is present in English, Spanish, Greek, French, German, Italian, Portuguese, and Dutch. Existing overlay coverage is green. Exercise actions are semantic buttons with discrete move controls and 44px minimum targets, visible focus states, disabled states, error/status treatments, token-based light/dark colors, compact small-screen grids, clipped horizontal overflow, and safe-area bottom reserve.

## Files

- New: `components/workout/workspace/PlanExerciseCard.tsx`, `components/workout/workspace/PlanMuscleSummary.tsx`, Builder/Review v3 tests.
- Updated: Builder/Review pages and components, exercise picker/results/detail routed replacement flow, workspace provider/state/storage/routes/header, workout styles, all eight locale sources, and focused state/storage/provider/route/page tests.

## Concerns / follow-up

- Advanced prescription fields are deliberately local-draft-only until a future product-approved database/RPC migration exists. Saving a routine does not silently imply otherwise.
- Duration is a planning estimate based on 45 seconds per working set, prescribed between-set rest, and 60-second exercise transitions; it is labeled as an estimate.
- No full browser matrix was run in this task; Task 12 owns the final viewport/theme/locale matrix. Component styling includes the required 320–430px constraints.
- The Impeccable detector was not run, per the binding task instruction.
