# Durable action boundary — implementation proposal, not a connected capability

Current `draft.update` changes only the isolated store. `draftRefresh` is a reviewed
handoff to the UI owner, not a durable receipt. No production schema has changed.

## Existing services to reuse

`lib/trpc/routers/workouts.ts` preferences.mine/update reads and mutates
`client_profiles.workout_preferences`, validates with workoutPreferencesSchema,
and predicates writes on self-client or the current assigned coach. Extract its
mutation into one shared service under AG1 ownership; both tRPC and the coach
adapter must use that service. Preserve the existing authorization and audit.
Add organization membership authorization inside the transaction for coach access.
The initial coach adapter remains self-only.

The current update has neither expectedVersion nor an atomic receipt. Calling it
then writing a receipt creates a failure gap and is insufficient. `agent_conversation`
is an append-only history with content and retention, not an idempotency store.
`invite_reservations` and workout clientIdempotencyKey illustrate patterns but their
rows have unrelated semantics and must not be repurposed.

## Small schema delta for AG1 to own

A dedicated coach action receipt table with actor, subject, organization,
conversation, actionId, proposalId, action kind, canonical request hash, expected
resource version, resulting version, status and recordedAt. Unique(actor, actionId)
binds a retry to exactly one payload; any different subject/conversation/hash must
conflict. Store only minimal result metadata, not chat text or full profile history.
RLS must restrict receipt reads to the authorized actor, with current subject/org
access rechecked. Do not expose a general client INSERT/UPDATE permission.

Add a monotonically increasing workout preference revision to client_profiles.
All preference writers must advance it, including ordinary tRPC edits; a coach-only
revision misses concurrent user changes and ABA updates. Prefer a database trigger
for every actual workout_preferences change so writers cannot forget the revision.
AG1 selects the migration number and updates schema/ledger. This document does not
execute or reserve a migration.

## Transaction and recovery

1. Authenticate and authorize using verified actor and current organization scope.
2. Start one transaction and lock the target profile row; recheck assignment/scope.
3. Read the receipt for actor/actionId. If it exists, require all binding fields to
   match and return it without a second mutation. Revocation still denies access.
4. Verify the immutable proposal hash, five-minute expiry and expected revision;
   derive and validate the full resulting preferences through the shared service.
5. Perform the conditional update and insert the receipt within that transaction.
   Any receipt conflict or write failure rolls both back. Capture the resulting
   database revision, not the JSON schema's `version:1`.
6. Commit before returning `storage:database`. On uncertain connection outcome,
   return uncertain and query the same actionId through a new authorized read.
   Reusing that same actionId is safe; do not issue a fresh actionId to retry.

An already committed matching receipt can be recovered after proposal expiry or a
process restart. New applies require the original server-issued proposal; either
persist its minimal canonical envelope or authenticate a bounded envelope with a
stable server key. Prefer persistent proposals if AG1 wants cross-process review;
this choice remains open and is necessary before claiming durable proposal support.

## Draft boundary and isolated database verification

Workout drafts currently live in workspace storage. A server must not mistake a
client draft hint for a persisted record. The current shared helper compares the
entire latest workspace, including stage and pending requests, with the reviewed
version before producing the new state. AG1 connects it only after explicit review
and identity verification. Cross-device draft persistence needs an explicit owned
resource and cannot be claimed from this local helper.

Reuse AG1's disposable Auth/SQL CI. Required checks: concurrent same action produces
one change/receipt; competing revisions conflict; ordinary tRPC edit invalidates a
proposal; failed receipt insert rolls back the profile; lost response recovers by
actionId after restart; changed payload conflicts; foreign subject/org, revoked
membership and assigned-coach changes deny both mutation and receipt reads. No new
stack, paid calls, production migration or production enablement is required.
