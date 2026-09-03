# Task 8 report — focused live-session experience

## Outcome

Implemented a one-exercise strength live stage with the authoritative exercise-media resolver, compact workout path, exact target and previous-set evidence, large active set inputs and completion control, rest state, technique/pain/plate access, and an explicit next-exercise preview. The current movement keeps its poster or controllable loop; pausing the workout stops the active clock through the existing reducer and passes `playbackDisabled` to the media primitive until the user explicitly resumes.

The existing atomic set, pain, structure, finish, retry/idempotency, offline recovery, and terminal empty-session discard boundaries remain unchanged. High-severity pain still calls the durable append mutation first and pauses only after that mutation verifies. Finish remains protected by `FinishWorkoutDialog`; empty sessions expose discard only.

Local workspace recovery is now deliberately best-effort. Storage getter, read, write, and clear failures no longer block a healthy server start or terminal transition. When local storage is usable, the exact request envelopes and recovery behavior remain intact.

## TDD evidence

### RED

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/components/workout-workspace-provider.test.tsx`

Result: 3 expected failures. The new focused-live tests could not find `Exercise 1 of 2` or `Pause workout` because the prior UI rendered every exercise/set row, and the denied-storage provider consumer test remained on its loading state with an unhandled `storage denied` error from `loadWorkspaceState`. This proved both the missing stage and the local-storage/server-write coupling before implementation.

### GREEN

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/components/live-cardio.test.tsx tests/components/plate-calculator-v2.test.tsx tests/components/pain-flag-modal.test.tsx tests/workout/live-session.test.ts tests/workout/workout-persistence.test.ts tests/components/workout-workspace-provider.test.tsx tests/i18n/task8-locale-parity.test.ts tests/lib/overlay-locale-coverage.test.ts`

Final focused verification:

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/components/live-cardio.test.tsx tests/components/plate-calculator-v2.test.tsx tests/components/pain-flag-modal.test.tsx tests/workout/live-session.test.ts tests/workout/workout-persistence.test.ts tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts tests/components/workout-workspace-provider.test.tsx tests/i18n/task8-locale-parity.test.ts tests/lib/overlay-locale-coverage.test.ts`

Result: 13 files, 165 tests passed.

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts tests/components/workout-workspace-provider.test.tsx tests/components/live-workout-v3.test.tsx`

Result: 4 files, 67 tests passed.

## UX and localization

- `LiveExerciseStage` uses `resolveExerciseMedia` with the exercise name and equipment identity. Unsupported/mismatched media remains labeled by the existing honest-fallback media primitive.
- `LiveSessionPath` is a compact text-first progress trace, rather than a catalogue grid.
- The active logger uses 56px controls with 18px numeric input text. Inputs and CTA have bottom safe-area clearance.
- Cardio pause/resume stays distinct and now uses the same large active control treatment.
- Plate calculator and pain reporting now state their specific purpose at the top of their compact, scroll-safe dialogs. Pain guidance explains the verified-save-before-auto-pause behavior.
- Added coherent source strings for every newly-visible UI unit in en/es/el and each overlay locale: fr/de/it/pt/nl. Locale-parity coverage includes the new keys.

## Static checks

- `npm run typecheck` — passed.
- Targeted ESLint across each changed production and test file — passed with no output.
- `git diff --check` — passed.

## Files changed

- New: `components/workout/workspace/LiveExerciseStage.tsx`, `components/workout/workspace/LiveSessionPath.tsx`, `tests/components/live-workout-v3.test.tsx`.
- Updated: focused live/cardio/set components; plate and pain dialogs; workspace provider/storage; locale dictionaries; live/provider/locale tests.

## Concerns

- The broader full-suite Node 26 Web Storage collision was not used to mask any product behavior; focused Vitest commands use `NODE_OPTIONS=--no-experimental-webstorage` as required.
- The Impeccable detector was not run, per the binding instruction.

## Review round 1 fixes

### Outcome

- The compact workout path is now a real, keyboard-accessible navigation control. It selects by stable exercise ID, carries current/completed/pending semantics, and keeps exactly one exercise stage expanded. A completed exercise can be reopened to undo a set or reach technique, pain, and plate controls.
- A completed prescription no longer coerces `-1` to exercise zero. The unselected terminal state is an honest finish-ready summary with the existing confirmed finish action; selecting a path entry still reopens it for correction.
- Rest elapsed time snapshots at pause, does not advance while paused, and resumes from that snapshot. The parent and a set-id-scoped in-memory handoff preserve the snapshot when a one-stage row unmounts for navigation or a live-stage remount occurs.
- Plate calculation now groups load inputs, explicit total-minus-bar/per-side output, warm-up explanation, and an unmistakable close action. Pain reporting now follows a compact three-step where/severity/context structure, retains verified-save-before-pause behavior, and keeps retryable recovery visible.

### RED

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx`

Result before the round-1 implementation: 2 failing new assertions — the static path could not navigate to `Exercise 2 of 2`, and the all-completed recovery state could not render `Ready to finish` (it coerced the missing active index to exercise one).

### GREEN

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/components/plate-calculator-v2.test.tsx tests/components/pain-flag-modal.test.tsx tests/i18n/task8-locale-parity.test.ts tests/lib/overlay-locale-coverage.test.ts tests/workout/live-session.test.ts tests/workout/workout-persistence.test.ts tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts`

Result: 11 files, 145 tests passed. This includes a fake-timer real-consumer test proving rest freezes during pause and resumes from the captured elapsed time.

### Static checks

- `NODE_OPTIONS=--no-experimental-webstorage npm run typecheck` — passed.
- Targeted ESLint on all modified components, locale dictionaries, and focused tests — passed with no output.
- `git diff --check` — passed.

## Review round 2 rest-clock correction

### Outcome

Replaced the module-global rest cache with a `LiveWorkout`-owned clock scoped to the current session. Each set snapshot carries precise `elapsedMs`, `capturedAt`, and `running` state. Stage transitions atomically freeze or resume the session snapshots before child rest effects run; a remounted row receives that authoritative snapshot and never recomputes from `created_at` once it exists. Running navigation continues naturally; paused navigation remains frozen.

Entries clear when a set is undone, an exercise is removed, rest completes, a workout finishes/discards, or the session changes. This prevents stale set-ID reuse and unbounded state growth.

### TDD evidence

**RED:** the new real-consumer fake-timer test exercised complete set → partial rest → pause → path navigation → 30 seconds of paused wall time → return → resume. Against the prior approach it exposed the delayed/original-timestamp clock restoration that absorbed paused time.

**GREEN:**

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/components/plate-calculator-v2.test.tsx tests/components/pain-flag-modal.test.tsx tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts`

Result: 7 files, 86 tests passed.

`NODE_OPTIONS=--no-experimental-webstorage npm run typecheck`, targeted ESLint for the rest-clock production/test files, and `git diff --check` all passed.

## Review round 3 lifecycle correction

- A successful superset mutation no longer touches rest-clock entries: grouping is structural only and preserves a running or paused rest.
- A successful exercise removal now clears every persisted-set rest entry for that removed exercise, after the authoritative structure mutation accepts. Failed removal leaves rest untouched.
- The real-consumer fake-timer fixture now supplies `created_at` from the original completion instant. It pauses at exactly seven seconds, persists that timestamp, toggles a successful superset, navigates away for 30 paused seconds, returns with the exact unchanged value, and then proves the first resumed second increments exactly once. This would fail if a remount re-synced from the original server timestamp.

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/workout/live-session.test.ts tests/components/plate-calculator-v2.test.tsx tests/components/pain-flag-modal.test.tsx`

Result: 6 files, 82 tests passed. Typecheck, targeted lint, and diff check passed.
