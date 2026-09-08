# Single persisted set correction

New shared writer, approved AG1 lease: `lib/workout/set-edit-service.ts` and its test. The existing `save_live_workout_set` RPC inserts/idempotently replays; it does not edit. No UI/router/schema/production SQL changed.

`createWorkoutSetService(database)` is composed with `executeWorkoutSetAction(authenticatedActor, raw, authorizedRepository, service, signal)` through the existing `/api/coach-assistant` POST handler. `set.*` remains default-off behind `COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED=1`, the existing preview allowlist and the existing production denial. No new route or runtime is created.

The existing open conversation schema can return one typed `workout.set.reps.update`
action intent only when the same server process has the set action capability enabled.
The model selects the offered action; deterministic parsing binds one explicit digit
count from a latest-set correction in the user message. Ambiguous, negated or spelled
counts are not offered, and a provider-selected count that differs from the bound
value invalidates the response. The intent carries `latest_open_session_set`; it is
not a proposal and contains no model-selected record ID. The client follows it with
`set.resolve` and `set.propose` and must display the canonical proposal before apply.

Operations use version `coach-assistant.v2`, conversationId and turnId:
- `set.read`: explicit setId returns canonical snapshot/version.
- `set.resolve`: optional authorized sessionId and exerciseId narrow the target. Without IDs, exactly one owned open session must exist; zero returns not_found and multiple sessions return ambiguous_selection. Within it, the latest persisted set creation timestamp is read from at most two candidates. Null or tied latest timestamps return ambiguous_selection. No record ID is inferred by the model or client. Prefer an explicit setId when already known.
- `set.propose`: setId, resourceVersion, after `{reps:10}`. Creates a five-minute canonical before/after proposal with expectedVersion/precondition; changes no set.
- `set.apply`: setId, proposalId, hash, actionId, resourceVersion, reviewed:true. Commits the single update and durable receipt together.
- `set.receipt`: setId + actionId recovers an uncertain outcome. Reuse the same actionId; do not create a replacement action to retry.

Only integer repetitions 1..2147483647 are accepted, matching the positive Workout domain and PostgreSQL integer storage. Weight, set/session/exercise identity, flags, notes, original client_request and all other fields remain unchanged. The retained isPr flag is NOT recalculated or certified as a correct record after correction. Refresh set/session/exercise-derived queries from canonical storage after an applied receipt.

Corrections are limited to owned sessions with completed_at IS NULL. The current 0079 terminal-authority trigger forbids edits to completed sessions. Resolve/read/propose/apply return session_completed under the owner-session lock before touching a set; an earlier committed receipt remains recoverable after completion. The shared writer also requires completed_at IS NULL. No session is reopened or finished. Existing save_live_workout_set replay checks remain unchanged: while live, the original identical client_request returns the original ID without overwriting corrected reps; a different request conflicts. After completion, the existing RPC rejects replay before insertion. Retrospective original idempotency data is also preserved. These SQL compatibility conclusions are source inspection, pending actual integration tests.

Transactions reauthorize current client/self/org, hold membership/profile share locks and the owner session update lock before locking the exact set, matching Workout lock order. The writer uses the same transaction connection as the ledger and checks set ID, session ID, current owner and previous reps. No delete/reinsert, all-set update, privileged bypass or paid call.

AG1 isolated prerequisites (NOT supplied as production migration):
- Reuse private.coach_action_proposals and private.coach_action_receipts; permit action workout.set.reps.update in any action constraint.
- private.coach_workout_set_versions(set_id UUID primary key, revision monotonic bigint), backfill existing rows and increment on every ordinary insert/update/delete; retain tombstones across deletion/recreation (including session cascades). Do not cascade away the revision. Missing revision fails closed. Scope/session/exercise changes must invalidate it.
- Existing ledger uniqueness/immutability, RLS isolation and action receipts stay unchanged. Audit action is workout_set_reps_updated for workout_sets; no sensitive prose in audit payload.

Validation uses focused tests across the shared writer, action boundary, transaction service, conversational action intent and default-off HTTP dispatch. Transaction tests use an injected SQL double, including rollback and a simulated committed transaction with a lost response, followed by same-action receipt recovery and canonical read. This does not prove real PostgreSQL/RLS/concurrency or HTTP/Auth behavior. Real SQL fixtures must cover foreign session/organization, ordinary edits and delete/recreate ABA, finalized sessions, original insertion replay after correction, concurrent applies and durable receipt recovery. No database, provider or production execution is performed by AG3.
