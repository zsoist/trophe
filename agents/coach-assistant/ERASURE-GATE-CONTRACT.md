# Durable erasure gate — implementation boundary for AG1 and AG3

This proposal is not installed. It supersedes the integration document's generic writer-gate requirement with the protocol below. `eraseBeforeProfileDelete` alone must never authorize profile deletion.

## Durable state owned by AG1

Create a private identity gate keyed by user UUID, with states `open`, `closing`, `erased`, and an erasure request UUID. No cascading profile FK: the closed identity must survive profile deletion, worker restart, and retries. Missing gate/schema fails closed; backfill and creation of open gates belong to the controlled account provisioning path, never to arbitrary writers. `closing` and `erased` cannot return to `open`.

Create a private external-write ledger with operation UUID, actor UUID, subject UUID, attachment UUID, exact bucket/path, and state `active`, `settled`, or `uncertain`. Identity and object fields are immutable. Neither TTL expiry nor heartbeat loss settles an operation. Preserve unresolved entries until trusted reconciliation proves the remote operation finished. No client role receives direct grants to either table.

## Writer admission and settlement

1. In a short database transaction lock actor and subject gate rows in sorted UUID order. Require both `open`. Insert a unique `active` external-write entry with the exact reserved object identity; commit BEFORE sending any Storage request. An existing operation ID is not permission for a second concurrent upload.
2. Send the single Storage write. The active entry spans normalization, remote I/O and completion. Gate closure after admission does not remove this entry or imply that the request stopped.
3. After a definitive remote completion, atomically persist any resulting attachment metadata and mark the entry `settled`. Metadata finalization for an admitted operation may finish while the gate is `closing`; it must not admit another remote write. The reservation remains inventoried if finalization fails.
4. On timeout, abort, connection loss, crash, or otherwise ambiguous remote completion, leave `active` or mark `uncertain`. Never release in `finally`, infer completion from abort, or expire the entry. A retry must reconcile the original request before starting another write. A momentarily absent object is insufficient proof: the original remote request could still create it later.

Without a Storage/provider mechanism proving a lost write has terminated, the safe result is pending with privileged recovery required. Availability is deliberately subordinate to truthful erasure. If a future implementation permits expiring leases, it also needs fencing enforced at the Storage write boundary; a database-only epoch cannot fence a request already sent to Storage.

## Erasure orchestration owned by AG1

The existing privileged client-erasure workflow validates the target and request first. Dry-run performs no gate transition. For actual erasure, lock the identity gate and commit `open -> closing` before any inventory. Repeat requests reuse the closed state; cancellation does not reopen it.

Admission and closure lock the same row. Thus every write is either admitted with a durable active record before closure, or denied after closure. Query the ledger using `actor_id = user OR subject_id = user`; any active/uncertain record returns pending and prevents object cleanup, metadata deletion and profile deletion. The closed gate persists between worker invocations.

Once every admitted external write has settled, invoke the private-object erasure helper in resumable batches. Its exact bucket/path removal port must attest completion. After inventory reaches zero, run the central public cleanup, then delete the profile and auth identity. Retain `closing` on any failure; mark `erased` only after required deletions succeed. Central workflow coverage must also enumerate noncascading private ledgers and define their erasure/identity-retention treatment; this gate is not a full privacy inventory.

The pre-profile-delete transaction must verify `closing`, no unresolved writes, and zero nonremoved attachment rows. Every DB-only producer must participate in the same gate lock protocol, so no producer can insert after that check. The monotone closing state covers the gap before the existing separate profile deletion call. A helper result alone is not a transferable completion token.

## Exact writer ownership

| Entry point | Required participation | Owner |
| --- | --- | --- |
| `attachments-service.operation` / `attachment.prepare` | Lock open gates before reservation INSERT or returning an upload capability | AG3 module; AG1 supplies gate schema/functions |
| `attachments-service.upload` | Admit durable external operation before Storage I/O; settle after definitive result; preserve uncertain writes and reservation | AG3 |
| `attachments-storage.put` | Only callable under admitted upload; no independent HTTP/direct SDK writer may bypass admission | AG3 adapter, AG1 wiring/credential boundary |
| Photo Food `analyzeAndRecord` recording transaction | Lock open gates before observation INSERT; reject a result arriving after closure | AG3 |
| Chat create/append, action proposal/apply, memory writes | Lock open gates before mutations; central DB guards cover native writers too | AG3 service calls, AG1 central guards |
| Existing human `chat-attachments` upload and any other account Storage writers | Same durable admission/settlement protocol before remote writes; participate in central inventory | AG1 |
| Removal, expiry cleanup, privileged erasure | Allowed during closing; must never recreate objects or reopen state | AG3 cleanup, AG1 orchestration |
| Provisioning, SQL guards, `lib/privacy/erasure.ts`, routes | Gate lifecycle, privileged request validation, final checks, auth deletion and dry-run behavior | AG1 |

AG1 should expose transaction-scoped `assertOpen(tx, identities)`, plus durable `admitExternalWrite`, `settleExternalWrite`, `markUncertain`, `beginErasure`, and `inspectDrain` primitives. Inputs come from trusted server scope and stored reservations. AG3 can then wire its listed services against that fixed contract in a separate patch. Do not implement a permissive optional gate fallback.

## Required isolated evidence before activation

Race real database connections: admission versus closure in both orders; pause a Storage write across closure and verify erasure stays pending; kill the writer after dispatch and prove restart/TTL/abort cannot clear it; reject a new upload using an old token after closure; settle then drain and erase; retry after Storage deletion but before metadata commit; reject DB-only inserts after closure; cover actor and subject separately. Also exercise the existing human attachment writer, dry-run, missing schema, and failed auth deletion. Mock tests alone cannot certify this concurrency boundary.
