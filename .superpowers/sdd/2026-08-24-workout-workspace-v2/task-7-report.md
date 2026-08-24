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

---

# Task 7 review fix round 1 — atomic persistence and mutation recovery

## Outcome

All Critical and Important review findings are addressed. Live creation and retrospective logging now use per-user idempotency keys; retrospective creation, set insertion, and completion share one database transaction; empty discard is one guarded delete RPC; all live set, pain, structure, and removal mutations participate in a central finish barrier with visible retry state. Cardio edits and live strength structure are retained in strict recovery storage, and blank names plus invalid retrospective metrics are rejected before persistence.

The previous read-then-delete concern is resolved by `public.discard_empty_workout_session(uuid)`.

## Mandatory Supabase migration and security evidence

Guidance followed:

- Supabase Database Functions: SECURITY INVOKER is the recommended/default posture, and function execution must be revoked from inherited roles before selectively granting it: https://supabase.com/docs/guides/database/functions
- Supabase local migrations: migration skeletons are created with `supabase migration new`: https://supabase.com/docs/guides/local-development/database-migrations

Commands and results:

```sh
node_modules/.bin/supabase --version
# 2.110.0

node_modules/.bin/supabase --help
node_modules/.bin/supabase migration --help
node_modules/.bin/supabase migration new --help
# all completed successfully

node_modules/.bin/supabase migration new workout_session_atomicity
# created supabase/migrations/20260824221316_workout_session_atomicity.sql
```

The generated skeleton was moved/adapted into the next canonical Drizzle migration, `drizzle/0075_workout_session_atomicity.sql`, and `_journal.json` was advanced to index 75. No duplicate migration remains under `supabase/migrations`.

The migration adds a nullable client request UUID and canonical request JSON to `workout_sessions`, with a per-user partial unique index. It defines these schema-qualified SECURITY INVOKER RPCs with `SET search_path = ''` and ownership derived only from `auth.uid()`:

- `start_workout_session`
- `save_retrospective_workout`
- `discard_empty_workout_session`
- `update_live_workout_structure`

For every RPC, EXECUTE is explicitly revoked from PUBLIC, `anon`, and `service_role`, then granted to `authenticated`. No service-role/client bypass is used; underlying RLS and authenticated table privileges are required.

Local verification:

```sh
node_modules/.bin/supabase start
npm run db:bootstrap
```

Result: the local stack started, all canonical migrations applied, and bootstrap verified schema, policies, functions, indexes, and explain plans. Direct catalog checks found all four functions with `prosecdef = false`; authenticated EXECUTE was true while anon and service_role were false. The migration was reapplied idempotently with local `psql -v ON_ERROR_STOP=1` after the final cardio validation adjustment.

## RED evidence

- `npx vitest run tests/db/workout-session-atomicity-contract.test.ts` — 1 failed / 4 before migration creation.
- `npx vitest run tests/workout/workout-persistence.test.ts` — 2 failed / 5: old read-then-delete boundary and missing atomic RPC wrappers.
- Live-session focused suite — 18 failed / 35 before discriminated pain loading, input validation, idempotent start, and transactional retrospective persistence.
- Workspace state/storage suite — 4 failed / 22 before the strict request-key and `linkedBelow` recovery fields/events.
- Provider suite — 5 failed / 9 before durable pre-request keys and `startLiveSession` ownership.
- Builder/review name validation — 2 failed / 12 before localized blank-name guards.
- Live cardio suite — 2 failed / 3 before exact zero-duration handling and recovered metric edits.
- Pain modal suite — 1 failed / 2 before awaited save, retained input, and retryable errors.
- Live workout suite — 4 failed / 7 before the shared pending/error barrier, verified pain recovery, and durable structure flows.
- `npx vitest run tests/db/workout-session-atomicity.test.ts` — 1 failed / 4 when a direct cardio RPC with null activity incorrectly resolved; this exposed SQL three-valued-logic in the validation predicate.

## GREEN evidence

Focused database security, journal, validation, concurrency, rollback, and atomicity:

```sh
npx vitest run tests/db/workout-session-atomicity.test.ts \
  tests/db/workout-session-atomicity-contract.test.ts \
  tests/db/migration-journal.test.ts
```

Result before the final concurrency addition: 3 files passed, 9 tests passed. The final runtime database file then passed 5/5, including simultaneous same-user/same-key starts on two connections coalescing to one row, cross-user ownership isolation, invalid-history rollback without a leaked session, idempotent history retry, atomic structure/removal, guarded non-empty discard, and rejection of null cardio activity.

Final affected/regression command:

```sh
npx vitest run tests/components/exercise-route-provider.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx tests/components/live-cardio.test.tsx tests/components/live-workout-page.test.tsx tests/components/live-workout.test.tsx tests/components/pain-flag-modal.test.tsx tests/components/retrospective-workout-logger.test.tsx tests/components/workout-asset-resolver.test.ts tests/components/workout-builder.test.tsx tests/components/workout-entry-panel.test.ts tests/components/workout-home-data-flows.test.tsx tests/components/workout-home-v2.test.tsx tests/components/workout-review-page.test.tsx tests/components/workout-review.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/components/workout-workspace-provider.test.tsx tests/i18n/workout-workspace-copy.test.ts tests/lib/workout-supersets.test.ts tests/lib/workout-units.test.ts tests/workout/live-session.test.ts tests/workout/workout-history-order.test.ts tests/workout/workout-persistence.test.ts tests/workout/workout-summary-accuracy.test.ts tests/workout/workout-superset-persistence.test.ts tests/workout/workout-write-verification.test.ts tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts tests/db/workout-session-atomicity-contract.test.ts tests/db/workout-session-atomicity.test.ts tests/db/migration-journal.test.ts
```

Result: 31 files passed, 224 tests passed.

```sh
npm run typecheck
# pass

npm run lint
# exit 0: 0 errors, 46 pre-existing warnings

git diff --check
# pass
```

## Files in this fix round

Persistence and migration:

- `drizzle/0075_workout_session_atomicity.sql`
- `drizzle/meta/_journal.json`
- `components/workout/workout-persistence.ts`
- `lib/workout/live-session.ts`

Recoverable workspace and presentation:

- `lib/workout/workspace-state.ts`
- `lib/workout/workspace-storage.ts`
- `components/workout/workspace/WorkoutWorkspaceProvider.tsx`
- `components/workout/workspace/LiveWorkout.tsx`
- `components/workout/workspace/LiveCardio.tsx`
- `components/workout/workspace/FinishWorkoutDialog.tsx`
- `components/workout/PainFlagModal.tsx`
- `components/workout/workspace/RetrospectiveWorkoutLogger.tsx`
- `components/workout/workspace/WorkoutBuilder.tsx`
- `components/workout/workspace/WorkoutReview.tsx`
- `app/dashboard/workout/review/page.tsx`
- `lib/i18n.tsx`

Focused tests:

- `tests/db/workout-session-atomicity-contract.test.ts`
- `tests/db/workout-session-atomicity.test.ts`
- `tests/workout/workout-persistence.test.ts`
- `tests/workout/live-session.test.ts`
- `tests/workout/workspace-state.test.ts`
- `tests/workout/workspace-storage.test.ts`
- `tests/components/workout-workspace-provider.test.tsx`
- `tests/components/live-workout.test.tsx`
- `tests/components/live-cardio.test.tsx`
- `tests/components/pain-flag-modal.test.tsx`
- `tests/components/retrospective-workout-logger.test.tsx`
- builder/review/home/write-boundary regression tests listed in the final command above.

## Self-review

- Confirmed the provider remains the sole live-session create owner. It writes the UUID request key to strict recovery storage before starting the network request and reuses it after an ambiguous response.
- Confirmed retrospective validation rejects blank names, non-finite/negative weights and distances, non-positive set/repetition/duration values, out-of-range RPE/effort, duplicate set numbers, and invalid cardio activity before or inside the RPC.
- Confirmed an invalid set insert rolls back the newly inserted session, while an exact retry returns the existing completed session without duplicate sets.
- Confirmed finish/discard are disabled during pending set, pain, superset, or removal writes and remain blocked after failures. Retry input remains present and verified success clears the relevant failure.
- Confirmed a failed pain load never replaces local durable flags; recovery must be explicitly retried. Pain input remains open after failed save.
- Confirmed zero-time/zero-metric cardio is empty and offers atomic discard; real metrics make it non-empty without fabricating duration. Live cardio values are written to the recovered draft.
- Confirmed superset links are recoverable before sets exist, future sets derive the saved group, and atomic removal deletes persisted rows then commits normalized local structure only after verification.
- Confirmed migration journal ordering, no duplicate Supabase migration, SECURITY INVOKER, explicit execution grants, authenticated ownership, `git diff --check`, standard typecheck, and final regression coverage.

## Concerns

- Repository-wide lint still reports the existing 46 warnings outside the Task 7 changed paths; it has zero errors. Task 7 changed-file lint is clean.
- The two separately ledgered minor rest-timer/undo items were intentionally not touched in this review round.

---

# Task 7 review fix round 2 — replay-safe live consistency

## Outcome

All round-2 Critical and Important findings are addressed. Live set reads now fail closed, logical set completion is unique and exact-retry idempotent, canonical live structure is session-owned and versioned, start identity is a complete pre-transport envelope plus a per-user draft fingerprint, and pain additions are atomic/idempotent without a stale full-array overwrite. The provider and UI serialize conflicting mutations and retain visible recovery paths. Live and retrospective numeric validation now holds at both the TypeScript domain boundary and SQL boundary.

## Mandatory migration workflow and Supabase security

Commands:

```sh
node_modules/.bin/supabase --version
# 2.110.0

node_modules/.bin/supabase migration new --help
# pass

node_modules/.bin/supabase migration new live_workout_consistency
# created supabase/migrations/20260824230052_live_workout_consistency.sql
```

The generated skeleton was moved/adapted to the next canonical migration, `drizzle/0076_live_workout_consistency.sql`; no duplicate Supabase migration remains. The Drizzle journal advances exactly once at index 76.

Migration 0076 adds:

- session-owned `live_structure` plus `live_structure_version` CAS state;
- complete live start request/fingerprint identity and a per-user unique draft hash;
- one unique logical set row per `(session_id, exercise_id, set_number)` plus an exact request fingerprint;
- atomic pain mutation IDs;
- authenticated-only `start_workout_session`, `save_live_workout_set`, `update_live_workout_structure`, `append_live_pain_flag`, `finish_live_workout_session`, and strict `save_retrospective_workout` RPCs;
- a direct-write trigger that rejects late sets outside the canonical live structure.

All new/replaced functions are `SECURITY INVOKER`, use `SET search_path = ''`, derive ownership from `auth.uid()`, explicitly revoke EXECUTE from PUBLIC/anon/service_role, and grant only authenticated. No service-role or client bypass exists.

Canonical local application and probes:

```sh
npm run db:bootstrap
```

Result:

```text
[run-migrations] ✅ all migrations applied
Verified DB schema, policies, functions, and index inventory.
==> Bootstrap complete.
```

This also verified that a manually present schema with the 0076 journal row absent is safely reapplied and journaled. The legacy bootstrap branch now stamps only the verified <=0074 baseline, runs the canonical migrator for 0075+, and probes the required RPC signatures, columns, and unique index. A reachable database with missing consistency RPCs fails the runtime suite instead of skipping.

## RED evidence

Database/guard suite before 0076:

```sh
npx vitest run tests/db/live-workout-consistency-contract.test.ts \
  tests/db/bootstrap-workout-migration-guard.test.ts \
  tests/db/live-workout-consistency.test.ts \
  tests/db/migration-journal.test.ts
```

Failures covered the missing canonical migration, journal/verification probes, committed-response-loss set retry, authoritative pre-set structure/removal, cross-tab pain merging, and strict retrospective JSON types.

Domain/provider suite before implementation:

```sh
npx vitest run tests/workout/workout-persistence.test.ts \
  tests/workout/live-session.test.ts \
  tests/workout/workspace-state.test.ts \
  tests/workout/workspace-storage.test.ts \
  tests/components/workout-workspace-provider.test.tsx
```

Result: 22 failed / 78, demonstrating absent discriminated set recovery, idempotent set/structure/pain APIs, complete start envelope replay, and validation.

UI RED suite:

```sh
npx vitest run tests/components/live-workout.test.tsx \
  tests/components/live-cardio.test.tsx \
  tests/components/pain-flag-modal.test.tsx \
  tests/components/exercise-set-logger.test.tsx
```

Result: 13 failed / 22 before fail-closed recovery, serialized controls, stable pain mutation IDs, and retained cardio validation feedback.

## GREEN evidence

Database contract/runtime/security/concurrency/rollback/journal:

```sh
npx vitest run tests/db/live-workout-consistency-contract.test.ts \
  tests/db/bootstrap-workout-migration-guard.test.ts \
  tests/db/live-workout-consistency.test.ts \
  tests/db/workout-session-atomicity.test.ts \
  tests/db/workout-session-atomicity-contract.test.ts \
  tests/db/migration-journal.test.ts
```

Result: 6 files passed, 21 tests passed. Runtime probes cover two-tab start coalescing with the original date, exact set replay after committed response loss, conflicting set rejection, pre-set structure recovery, late insert rejection after removal (RPC and direct insert), concurrent pain additions plus replay, finish without stale pain overwrite, strict JSON type/presence rejection, transaction rollback, RLS ownership, invoker rights, and role grants.

Affected workout UI/domain/provider/regression suite:

```sh
npx vitest run tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx tests/components/live-cardio.test.tsx tests/components/live-workout-page.test.tsx tests/components/live-workout.test.tsx tests/components/pain-flag-modal.test.tsx tests/components/retrospective-workout-logger.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-entry-panel.test.ts tests/components/workout-home-data-flows.test.tsx tests/components/workout-home-v2.test.tsx tests/components/workout-review-page.test.tsx tests/components/workout-review.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/components/workout-workspace-provider.test.tsx tests/i18n/workout-workspace-copy.test.ts tests/lib/workout-supersets.test.ts tests/lib/workout-units.test.ts tests/workout/live-session.test.ts tests/workout/workout-history-order.test.ts tests/workout/workout-persistence.test.ts tests/workout/workout-summary-accuracy.test.ts tests/workout/workout-superset-persistence.test.ts tests/workout/workout-write-verification.test.ts tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts
```

Result: 26 files passed, 163 tests passed.

Additional gates:

```sh
npm run typecheck
# pass (standard tsc --noEmit, including Next route types)

npm run lint
# exit 0: 0 errors, 46 pre-existing repository warnings

npx eslint <Task 7 changed TypeScript/TSX test paths>
# Task 7 paths clean; scripts/db/verify.ts is repository-ignored

git diff --check
# pass
```

## Files in round 2

Persistence/schema/runtime:

- `drizzle/0076_live_workout_consistency.sql`
- `drizzle/meta/_journal.json`
- `components/workout/workout-persistence.ts`
- `lib/workout/live-session.ts`
- `scripts/db/bootstrap-local.sh`
- `scripts/db/verify.ts`

Recoverable workspace/UI:

- `components/workout/PainFlagModal.tsx`
- `components/workout/workspace/ExerciseSetLogger.tsx`
- `components/workout/workspace/LiveCardio.tsx`
- `components/workout/workspace/LiveWorkout.tsx`
- `components/workout/workspace/WorkoutWorkspaceProvider.tsx`
- `lib/i18n.tsx`
- `lib/workout/workspace-state.ts`
- `lib/workout/workspace-storage.ts`

Focused tests:

- `tests/db/bootstrap-workout-migration-guard.test.ts`
- `tests/db/live-workout-consistency-contract.test.ts`
- `tests/db/live-workout-consistency.test.ts`
- `tests/db/workout-session-atomicity.test.ts`
- `tests/components/exercise-set-logger.test.tsx`
- `tests/components/live-cardio.test.tsx`
- `tests/components/live-workout.test.tsx`
- `tests/components/pain-flag-modal.test.tsx`
- `tests/components/workout-workspace-provider.test.tsx`
- `tests/workout/live-session.test.ts`
- `tests/workout/workout-persistence.test.ts`
- `tests/workout/workout-write-verification.test.ts`
- `tests/workout/workspace-state.test.ts`
- `tests/workout/workspace-storage.test.ts`

## Self-review

- Confirmed set recovery never maps an unverified read to `[]`; finish remains blocked until sets, pain, and canonical structure all load successfully.
- Confirmed an exact committed-set retry returns the original row ID and a changed payload for the same logical set is rejected. A database unique index prevents duplicate logical sets even across tabs.
- Confirmed structure changes use a row lock plus expected-version CAS; server state is updated before set deletion/group normalization so the direct-write trigger rejects removed exercises and future sets must use the canonical group.
- Confirmed the provider persists every start RPC argument before transport, reuses the same envelope after date change, re-reads shared storage for stale tabs, and the database fingerprint coalesces distinct tab UUIDs.
- Confirmed pain retries reuse one modal mutation UUID, concurrent append RPCs serialize, exact replay is a no-op, and finish never writes a stale pain array.
- Confirmed live set/cardio and retrospective strength/cardio validation rejects non-finite, negative, non-integral, missing, string-coerced, or out-of-range values before durable writes; SQL independently enforces exact JSON types and rolls back invalid requests.
- Confirmed pending/failed mutations block finish/discard and conflicting controls; failure feedback remains visible, set/structure recovery is explicitly retryable, and pain/cardio input remains present.
- Confirmed standard typecheck, lint, local canonical migration application, runtime RLS/security/concurrency tests, and diff checks pass.

## Concerns

- Repository-wide lint still reports the existing warnings outside Task 7; there are zero errors and changed Task 7 application paths are clean.
- The separately ledgered rest-timer reset and undo idempotency issues remain intentionally out of scope and untouched.
