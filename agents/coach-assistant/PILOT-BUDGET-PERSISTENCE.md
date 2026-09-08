# Pilot reservation core and persistent writer contract

## LIVE-01 authorization delta — 2026-09-08

The active pilot limit is US$3 per America/Bogota calendar day, shared by
the team, environments and modalities through one durable authority. Ordinary
admission stops at US$2.70 to retain an overrun margin. This supersedes every
zero-dollar statement below. It does not create a production migration or prove
that a hosted authority has been provisioned.

Every attempt persists its server-derived `admissionDay`. The active ledger is
today's settled usage plus every open reserved/dispatched/unknown amount, including
attempts admitted on prior days. At a natural day change, settled historical usage
leaves the active total; open reservations remain charged. Rows and history are
never deleted or reset by midnight. `accountingBlocked` also survives the boundary.

The isolated table accepts exactly one `ask-trophe-shared` configuration row and
stores the current ledger day. The transaction lock serializes rollover, reserve,
dispatch and settlement. All pilot modalities and environments must point to this
same hosted database row; separate deployments or pilot IDs are not compliant.
The current SQL is still disposable acceptance DDL and must not be run in production.

Implementation: pilot-budget.ts. AG3 owns pure decisions and the validating port
adapter. AG1 owns the persistent transaction writer and any schema/root changes.
There is no production in-memory ledger. `reserveCoachPilotAttempt` now delegates
to the durable store under the active program cap; no live provider call has run.

## Shared interface

PilotBudgetStore.execute(command, signal) returns a validated database-tagged result
only after commit. Commands: reserve, lookup, claim_dispatch, mark_unknown, settle,
release_unstarted. Every command carries the same immutable binding: pilotId,
actorId, attemptId, agentRunId, turnId, exact model, pricing version, request hash,
and worst-case reservedNanoUsd. A changed binding conflicts even for lookup/retry.

Use integer nanoUSD, one dollar = one billion units. Current reservation is 4,400,000
($0.0044), covering 8000 inputs at the highest supported tier (cache write) plus
2000 total output including reasoning. pricePilotUsageNanoUsd computes exact known
usage; reasoning is already contained within output. Invalid/zero/unknown usage
retains the full reservation. Measured usage above the reservation is recorded in
full, leaving the cap overdrawn and blocking new reservations rather than hiding it.

## Reuse agent_runs under one serialized pilot transaction

Prefer one existing agent_runs row per attempt, using its id as agentRunId and a
namespaced metadata.coachPilot object for the immutable binding, state, integer
charge and settlement usage. Existing text status/metadata allow an isolated writer
without changing other tasks. Keep generic float-dollar telemetry separate from
the authoritative integer pilot accounting. Do not create duplicate reservation and
runtime rows and accidentally bill both. The future coach transport adapter must
update/link this same attempt row rather than silently creating another budget row.

The writer needs an authoritative cap for the entire AG3+AG4 pilot and an allowed
runner/actor scope. This configuration must survive restart, must not derive from
request JSON, and must not reset each day. Reuse an appropriate existing durable
configuration slot if ownership/semantics permit; otherwise AG1 prepares a minimal
isolated cap table. No schema is created or migrated by this core.

Before each decision, authorize the configured pilot actor and acquire a transaction
lock keyed by pilotId. Load the current authoritative cap, aggregate charges from
all that pilot's rows (including pending/unknown/failed attempts), per-turn reserved
attempt count and the existing attempt. Call decidePilotBudgetCommand against that
locked snapshot, then insert/update the row and any aggregate within the SAME
transaction. Unique attempt identity and agentRunId binding must prevent a second
row or cross-pilot collision. All writers of these namespaced fields must honor the
same locking protocol. Missing/corrupt charges are an error, not COALESCE-to-zero.
Ordinary agent_runs writers must preserve these namespaced fields.

## State and crash protocol

reserved/dispatched/unknown retain the full amount. settled charges measured usage.
released is zero only from reserved, before any dispatch claim. No timeout or sweep
releases a dispatched/unknown attempt. Reservation retries do not create a new row;
released attempts cannot be resurrected. At most two distinct reservations per turn
is a conservative bound, including unstarted reservations later released.

claim_dispatch must persist reserved -> dispatched and return dispatchGranted=true
exactly once. A replay returns false, including after restart. If its response is
lost, the adapter returns uncertain and must NOT call the provider. If the process
crashes after the claim but before/after sending, the reservation remains charged;
lookup cannot grant a fresh permission. Do not retry the transport under that same
attempt or auto-create another attempt to conceal the uncertain one.

After known usage, settle atomically replaces the reserved charge. Matching repeated
settlement is idempotent; changed usage conflicts for explicit investigation. A cap
reduced to zero blocks an unstarted dispatch even if it was reserved previously.

## Required database acceptance

Concurrent reserve attempts across separate transactions/processes cannot exceed
the cumulative cap. Concurrent claim_dispatch yields exactly one permit. Duplicate
attempt/agentRun bindings, foreign actors/pilots and changed request hashes fail.
Restart and lost responses preserve pending/unknown charges and never redispatch.
Failed receipt/row writes roll back the charge and row together. Unknown consumption
is retained; measured overrun is charged. A manual cap reduction blocks dispatch.
No automatic day-boundary reset or unknown-expiry release is allowed.

The test Map is explicitly a serialized injected port: it proves core and adapter
behavior, not SQL exclusion, crash durability, auth or production spend. The
disposable loopback PostgreSQL suite now passes concurrency, restart, rollback,
authority, midnight and accounting-retention checks. Hosted provisioning remains a
separate release gate.

## Accounting quarantine and current dispatch authorization

The locked snapshot also requires accountingBlocked, aggregated from any persisted
accountingAlert for the pilot. claim_dispatch rechecks the current cap and this
block before issuing a new permission; a prior reservation is not authorization
past revocation/kill. Writer authorization must also be rechecked at claim time.

The current tariff cannot price input above 272,000 tokens. Such usage becomes
unknown with the full reservation retained, the anomalous counters persisted and
accountingAlert=true. New reservations and unstarted dispatches are blocked for the
whole pilot while that alert exists. Measured short-tier overruns are charged in
full and also raise the alert. This prevents a cheap short-tier reconciliation or
continuing other attempts against an unquantified overrun. Missing/invalid measured
usage likewise raises an alert; ordinary response-loss mark_unknown still retains
the bounded reservation without inventing usage. Resolution requires supported
usage evidence; it is never a timer-based release.

Observed-model pricing guard: accept new command `mark_pricing_unknown` with
binding, usage, responseModel (string|null). Core writes unknown/full reservation,
usage, accountingAlert:true and optional record field unpricedModel (string|null).
Preserve this field in JSON persistence and validation; recompute accountingBlocked
from accountingAlert as before. Ordinary settle is forbidden once unpricedModel
exists; reconciliation is intentionally not exposed here. No new SQL table.
Older writers rejecting the command remain fail-closed with a dispatched hold,
but cannot prove the new persistent alert behavior until integrated/tested.
