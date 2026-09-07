# Single persisted set correction

New shared writer, approved AG1 lease: `lib/workout/set-edit-service.ts` and its test. The existing `save_live_workout_set` RPC inserts/idempotently replays; it does not edit. No UI/router/schema/production SQL changed.

Compose `createWorkoutSetService(database)` with `executeWorkoutSetAction(authenticatedActor, raw, authorizedRepository, service, signal)` in the existing gated Coach handler when isolated SQL acceptance is ready. No model tool or new public route is enabled by this slice.

Operations use version `coach-assistant.v2`, conversationId and turnId:
- `set.read`: explicit setId returns canonical snapshot/version.
- `set.resolve`: explicit authorized sessionId + exerciseId returns latest persisted creation timestamp, reading at most two candidates. Null or tied latest timestamps return ambiguous_selection. No selection is inferred from prose. Prefer the user's explicit setId.
- `set.propose`: setId, resourceVersion, after `{reps:10}`. Creates a five-minute canonical before/after proposal; changes no set.
- `set.apply`: setId, proposalId, hash, actionId, resourceVersion, reviewed:true. Commits the single update and durable receipt together.
- `set.receipt`: setId + actionId recovers an uncertain outcome. Reuse the same actionId; do not create a replacement action to retry.

Only integer repetitions 1..2147483647 are accepted, matching the positive Workout domain and PostgreSQL integer storage. Weight, set/session/exercise identity, flags, notes, original client_request and all other fields remain unchanged. The retained isPr flag is NOT recalculated or certified as a correct record after correction. Refresh set/session/exercise-derived queries from canonical storage after an applied receipt.

Corrections allow both open and finished owned sessions; they do not reopen or finish a session. Existing save_live_workout_set replay checks remain unchanged: while live, the original identical client_request returns the original ID without overwriting corrected reps; a different request conflicts. After completion, the existing RPC rejects replay before insertion. Retrospective original idempotency data is also preserved. These SQL compatibility conclusions are source inspection, pending actual integration tests.

Transactions reauthorize current client/self/org, hold membership/profile share locks and the owner session update lock before locking the exact set, matching Workout lock order. The writer uses the same transaction connection as the ledger and checks set ID, session ID, current owner and previous reps. No delete/reinsert, all-set update, privileged bypass or paid call.

AG1 isolated prerequisites (NOT supplied as production migration):
- Reuse private.coach_action_proposals and private.coach_action_receipts; permit action workout.set.reps.update in any action constraint.
- private.coach_workout_set_versions(set_id UUID primary key, revision monotonic bigint), backfill existing rows and increment on every ordinary insert/update/delete; retain tombstones across deletion/recreation (including session cascades). Do not cascade away the revision. Missing revision fails closed. Scope/session/exercise changes must invalidate it.
- Existing ledger uniqueness/immutability, RLS isolation and action receipts stay unchanged. Audit action is workout_set_reps_updated for workout_sets; no sensitive prose in audit payload.

Validation: nine tests across the shared writer, action boundary and transaction service; scoped TypeScript and lint. Transaction tests use an injected SQL double, including rollback and a simulated committed transaction with a lost response, followed by same-action receipt recovery. This does not prove real PostgreSQL/RLS/concurrency or HTTP/Auth behavior. Real SQL fixtures must cover foreign session/organization, ordinary edits and delete/recreate ABA, finalized sessions, original insertion replay after correction, concurrent applies and durable receipt recovery. No CI/build/database execution performed by AG3.
