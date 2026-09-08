# Progress: recorded trends and explicitly reviewed measurement creation

AG3 owns this backend slice. AG1 granted the exclusive new-file lease for
`lib/workout/measurement-service.ts` and `tests/measurement-service.test.ts`.
No UI, route, provider, root dependency, production migration, ledger replacement,
SQL execution, CI dispatch or paid call is part of this delivery. US$0; paid cap0.

## Canonical product seam

`app/dashboard/progress/page.tsx` currently inserts measurements directly with
Supabase. There was no exported creation validator/writer to reuse. The new small
shared writer inserts into the existing `db/schema/measurements.ts` table on the
caller's transaction. AG1 can adopt it in the native UI separately; this delivery
does not change that UI or claim its existing direct insert is validated here.

Only the four existing fields are accepted: explicit calendar `measuredDate`,
positive `weightKg`, nullable `bodyFatPct` (0–100) and nullable positive `waistCm`.
Weight is required as in the current product. Every property must be supplied;
`null` explicitly means omitted optional measurement. No coercion, inferred date,
weight conversion, photos, notes, body estimates or arbitrary fields. Finite
PostgreSQL real representation is required. Proposal preserves the user's number;
returned SQL values are checked at float4 precision. This is storage validation,
not clinical validation. Explicit future dates are accepted by the writer but are
outside today's read window until that date arrives.

## Connection contract

Server-only `executeProgressAction(actorId, raw, repository, service, signal)`
requires `authorized_records`, obtains the organization from current authenticated
repository context and checks it again after execution. `createProgressService(db)`
also locks and validates current self-client/profile/membership authorization on
every transaction. This initial slice has no professional-view widening.

- `progress.read`: version, conversationId, turnId, optional self clientId, days
  exactly 30, 90 or 365. Returns collection version, bounded measurements, trends.
- `measurement.propose`: same base, resourceVersion from read, exact after values,
  inputSource `explicit_user`. Creates a five-minute reviewed proposal only.
- `measurement.apply`: same base, proposalId, hash, resourceVersion, actionId and
  reviewed true. Must originate from the user's concrete review confirmation.
- `measurement.receipt`: same base and actionId. Recovers durable historical result.

No model tool registration or automatic dispatch was added. An `explicit_user`
marker alone is not proof of human provenance: the future handler/UI must bind
review to the exact displayed values and must not populate it from image estimates.
Browser consumers import only `progress-contracts.ts`; server schema/actions import
the shared validator and must not be bundled into UI.

## Deterministic summary

Query selects only IDs, owner for validation, date and the three numeric fields,
filtered by authenticated owner and inclusive calendar window in the profile's
IANA zone. It reads at most 251 rows and retains 250; it does not expand sparse
windows to all history. The collection revision lock makes the SQL reads consistent
against native writes once the proposed BEFORE trigger is installed.

Identical duplicate IDs are counted and dropped; conflicting IDs, wrong owner or
out-of-window rows fail closed. Invalid legacy values become missing, with an
explicit count. Trends use only actual non-null values: arithmetic mean for each
recorded date, first and last distinct dates, and their difference. Body-fat change
uses percentage points. Fewer than two dates means no numeric trend. Source IDs,
observation/date counts, aggregation and truncation are explicit. No extrapolation,
forecast, treatment advice or interpretation of missing records as behavior.

## CAS, replay and SQL prerequisite

`PROGRESS-SCHEMA-PROPOSAL.sql` is an unexecuted isolated-review artifact. It adds only
collection revision metadata, never a new action ledger. AG1 must extend the
existing proposal action constraint with `measurement.create` while preserving its
other accepted actions; the artifact deliberately does not replace an unknown
integration-head constraint. Missing metadata returns not_connected. A missing
revision advance at write returns uncertain and rolls the entire transaction back.

Scope revisions retain tombstones through row deletion/recreation, advance for
native INSERT/UPDATE/DELETE (both owners on reassignment), and conservatively
advance on profile/client-profile/membership mutations. The proposed measurement
TRUNCATE guard prevents a row-trigger bypass. Auth-table TRUNCATE/trigger disabling
is privileged maintenance and must invalidate outstanding proposals before access
is restored; that maintenance path is not exposed by this service. Grants and
SECURITY DEFINER ownership require AG1/AG4 isolated verification before connection.

Apply locks actor/action ID, authorizes, recovers same-action receipt before looking
for any canonical measurement, then locks subject revision and scoped proposal.
The proposal ID is the new measurement's canonical ID. A durable receipt for that
proposal blocks another action ID even after the measurement is deleted. Hash
binds actor, subject, organization, conversation and complete reviewed envelope.
CAS/expiry are checked before insert. Insert, revision advance, receipt and minimal
ID/version-only audit commit together. Receipt recovery proves an earlier commit,
not continued existence or current value; UI must refetch.

Cancellation before dispatch returns cancelled; interruption or lost acknowledgement
after dispatch returns uncertain and calls for same-action receipt recovery. No
second creation should be initiated to resolve that uncertainty.

## Verification and remaining acceptance

AG3's 13 passing tests (3 files), scoped TypeScript and file-scoped ESLint pass.
The bounded suite uses injected SQL transactions, including modeled rollback and
lost commit acknowledgement. It covers explicit validation, deterministic sparse /
duplicate / invalid / truncated reads, same-date means, CAS, expiry, tampering,
scoped receipts, revocation, missing revision metadata, missing trigger advancement,
canonical return mismatch, receipt/audit failure, cancellation and post-delete
proposal consumption. It does not execute real SQL/RLS/concurrent transactions.

Before activation: AG4 source review, AG1 isolated SQL installation and action
constraint extension, actual native CRUD/owner transfer/ABA, concurrent apply,
receipt collision/rollback, authenticated RLS positives/negatives, auth lineage,
timezone DST and calendar boundaries, cleanup restoration, and actual handler/UI
review/refetch/recovery. No API/semantic evaluation or preview completion is claimed.
