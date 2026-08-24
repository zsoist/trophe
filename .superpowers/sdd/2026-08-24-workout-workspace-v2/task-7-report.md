# Task 7 Report — Live, Pause, Set Logging, and Guarded Finish

## Status

Complete. Live strength/cardio logging, pause/resume recovery, immediate verified set writes, durable pain/superset state, guarded finish/discard, and confirmed retrospective strength/cardio persistence are implemented. Provider remains the sole owner of live session creation.

The integration ruling is also complete: `ExerciseBrowser` and `RoutedExerciseDetail` now live in ordinary component modules, while their Next route files are default-export-only. Standard `npm run typecheck` passes.

## RED evidence

1. Initial required Task 7 suite:

   ```sh
   npx vitest run tests/workout/live-session.test.ts tests/components/live-workout.test.tsx tests/components/live-cardio.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx
   ```

   Result: RED. The live-session and presentation modules did not exist; the suite reported missing imports/modules and missing provider finish/discard actions.

2. Provider finish/discard contract:

   ```sh
   npx vitest run tests/components/workout-workspace-provider.test.tsx
   ```

   Result: RED, 1 failed / 8 tests. The verified domain discard helper was not called and the old direct persistence dependency was still present.

3. Retrospective superset preservation:

   ```sh
   npx vitest run tests/components/retrospective-workout-logger.test.tsx
   ```

   Result: RED, 1 failed / 3 tests. Confirmed sets persisted `superset_group: null` instead of the linked group.

4. Refresh recovery for added sets:

   ```sh
   npx vitest run tests/workout/live-session.test.ts
   ```

   Result: RED, 1 failed / 16 tests: `recoverLiveExtraRows is not a function`.

5. Fail-closed transport behavior:

   ```sh
   npx vitest run tests/workout/live-session.test.ts
   ```

   Result: RED, 2 failed / 18 tests. Rejected secondary writes and reads escaped instead of returning safe verified defaults.

6. Empty persisted-session verification:

   ```sh
   npx vitest run tests/workout/workout-persistence.test.ts tests/workout/live-session.test.ts
   ```

   Result: RED, 3 failed / 22 tests. `deleteEmptyWorkoutSession` did not exist and live discard still used the general rollback deletion path.

7. Next route contract integration:

   ```sh
   npm run typecheck
   ```

   Result: RED. Generated Next route types rejected named `ExerciseBrowser` and `RoutedExerciseDetail` exports from route files. Both exports existed unchanged at the Task 6 baseline (`c4cdf13`), and the integration ruling required fixing them in this task.

## GREEN evidence

Final workout regression command:

```sh
npx vitest run tests/components/exercise-route-provider.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx tests/components/live-cardio.test.tsx tests/components/live-workout-page.test.tsx tests/components/live-workout.test.tsx tests/components/retrospective-workout-logger.test.tsx tests/components/workout-asset-resolver.test.ts tests/components/workout-builder.test.tsx tests/components/workout-entry-panel.test.ts tests/components/workout-home-data-flows.test.tsx tests/components/workout-home-v2.test.tsx tests/components/workout-review-page.test.tsx tests/components/workout-review.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/components/workout-workspace-provider.test.tsx tests/i18n/workout-workspace-copy.test.ts tests/lib/workout-supersets.test.ts tests/lib/workout-units.test.ts tests/workout/live-session.test.ts tests/workout/workout-history-order.test.ts tests/workout/workout-persistence.test.ts tests/workout/workout-summary-accuracy.test.ts tests/workout/workout-superset-persistence.test.ts tests/workout/workout-write-verification.test.ts tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts
```

Result:

```text
Test Files  27 passed (27)
Tests       185 passed (185)
```

Additional gates:

```sh
npm run typecheck
# PASS (standard command, including fresh generated Next route types)

npm run lint
# PASS, exit 0; 46 existing repository warnings, 0 errors

npx eslint app/dashboard/workout/exercises/page.tsx app/dashboard/workout/exercises/'[id]'/page.tsx components/workout/workspace/ExerciseBrowser.tsx components/workout/workspace/RoutedExerciseDetail.tsx tests/components/exercise-route-provider.test.tsx
# PASS, no output

git diff --check
# PASS, no output
```

Production build evidence:

```sh
npm run build
```

Result: webpack compilation and build TypeScript both pass. Static prerender then stops on the environment prerequisite `NEXT_PUBLIC_SUPABASE_URL` while rendering `/coach/calendar`.

Repository test wrapper evidence:

```sh
npm test
```

Result: exits 1 before Vitest with `Database prerequisite unavailable. Run npm run db:bootstrap.` Direct affected/regression Vitest runs above pass.

## Implementation summary

- Provider state/actions now support guarded finish cancellation, verified completion, and verified empty discard. `finishingFrom` preserves live versus paused clock origin and is strictly whitelisted/validated in recovery storage.
- `lib/workout/live-session.ts` owns Task 7 domain persistence: immediate complete/uncomplete, recovery reads, durable pain flags, verified supersets/removal, finish, verified empty discard, retrospective save/rollback, and fail-closed transport handling.
- Empty discard first verifies the persisted session has no workout sets, then verifies exactly one owned session row was deleted. Failed/unverified deletion keeps recovery.
- Live recovery restores clock state, persisted sets (including sets added beyond plan targets), pain flags, PR baseline, and adjacent superset links.
- Strength logger uses explicit weight/reps/RPE labels, complete/saving/undo states, rest targets, and a More disclosure for technique, pain, plate calculator, supersets, and separated destructive removal.
- Live cardio uses the same clock and guarded finish boundary. Retrospective strength/cardio creates a session only at final confirmation; failed partial saves attempt verified rollback and empty strength is rejected before creation.
- Unit conversion, compound PR detection, pain flags, supersets, rest targets, no-empty-session behavior, and existing RLS-owned query patterns are preserved.
- Next route named components were moved to `components/workout/workspace` per the integration ruling; behavior stayed covered by the existing 11 route-provider tests.

## Files

Created:

- `app/dashboard/workout/live/page.tsx`
- `components/workout/workspace/ExerciseBrowser.tsx`
- `components/workout/workspace/ExerciseSetLogger.tsx`
- `components/workout/workspace/FinishWorkoutDialog.tsx`
- `components/workout/workspace/LiveCardio.tsx`
- `components/workout/workspace/LiveWorkout.tsx`
- `components/workout/workspace/RetrospectiveWorkoutLogger.tsx`
- `components/workout/workspace/RoutedExerciseDetail.tsx`
- `lib/workout/live-session.ts`
- `tests/components/exercise-set-logger.test.tsx`
- `tests/components/finish-workout-dialog.test.tsx`
- `tests/components/live-cardio.test.tsx`
- `tests/components/live-workout-page.test.tsx`
- `tests/components/live-workout.test.tsx`
- `tests/components/retrospective-workout-logger.test.tsx`
- `tests/components/workout-review-page.test.tsx`
- `tests/workout/live-session.test.ts`
- `tests/workout/workout-persistence.test.ts`

Modified:

- `app/dashboard/workout/exercises/[id]/page.tsx`
- `app/dashboard/workout/exercises/page.tsx`
- `app/dashboard/workout/review/page.tsx`
- `components/workout/workout-persistence.ts`
- `components/workout/workspace/WorkoutWorkspaceProvider.tsx`
- `lib/i18n.tsx`
- `lib/workout/workspace-state.ts`
- `lib/workout/workspace-storage.ts`
- `tests/components/exercise-route-provider.test.tsx`
- `tests/components/workout-workspace-provider.test.tsx`
- `tests/workout/workspace-state.test.ts`
- `tests/workout/workspace-storage.test.ts`

## Self-review

- Confirmed with search/tests that live `createWorkoutSession` ownership remains exclusively in `WorkoutWorkspaceProvider.startLive`; set completion never creates another session.
- Recovery is cleared only after a verified finish callback or verified empty deletion. Failed/throwing writes leave the state recoverable and UI retryable.
- Confirmed the finish dialog restores the original running/paused clock mode and strict storage rejects malformed/missing `finishingFrom` combinations.
- Confirmed retrospective strength/cardio persistence waits for final confirmation, uses kilogram storage, preserves PR/pain/superset fields, and rejects empty strength before creation.
- Confirmed route extraction is behavior-preserving and route files now satisfy Next's export contract.
- `git diff --check`, affected lint, full lint, standard typecheck, and 185 regression tests are green.

## Concerns

- Full `npm test` requires the local database bootstrap, which is unavailable in this workspace.
- Full build requires deployment-style public Supabase environment variables for static prerender; compilation and build TypeScript pass before that external configuration stop.
- Empty-session discard uses a verified read-then-delete because no atomic RPC exists in the current schema. The finishing UI prevents normal same-client set writes during that interval; an atomic cross-tab guarantee would require a database function/migration.
