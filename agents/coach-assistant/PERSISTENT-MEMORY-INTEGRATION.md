# Explicit persistent preferences — first bounded slice

`createPersistentMemoryService(db)` executes real transactions against canonical
`public.memory_chunks` and the existing private action proposal/receipt ledger.
It is not an HTTP binding, migration, UI implementation or SQL acceptance proof.

This slice stores only text explicitly submitted as source=user_input and
retention=persistent and subsequently reviewed/applied. Temporary and inferred
operation envelopes are rejected. No extraction, embeddings, provider call,
profile inference or automatic persistence occurs. It is thread-scoped:
actor=subject client, current organization membership, and conversation UUID must
match on every read/write/recovery. Cross-thread profile sharing is not yet
implemented and must require a separate explicit authorized scope.

Canonical rows use scope=agent, agent_name=coach-assistant-confirmed and
session_id=conversation UUID. Existing Coach personalContext reads scope=user
and cannot consume these rows. Generic readMemory vector/non-vector branches
and legacy tRPC list/delete/stats explicitly exclude this namespace. writeMemory
refuses it before extraction; legacy supersedence already requires scope=user.
Existing unrelated memory paths remain functional. Direct Data API exclusion
requires the isolated restrictive RLS below; namespace naming alone is not RLS.

## AG1 isolated schema requirements

- Add private.coach_memory_bindings: memory_id uuid primary key referencing
  memory_chunks(id), actor_id/subject_id/organization_id/conversation_id UUID
  nonnull, revision bigint nonnegative default 0, confirmed_text_hash text
  nonnull lowercase SHA256 (64 hex). Index the complete scope. No Data API grants;
  RLS/revoke private access. No legacy memory backfill or inferred confirmation.
- Confirm inserts canonical row then binding revision 0 in one transaction.
  Update trigger on memory_chunks increments binding revision whenever fact_text,
  source, fact_type, scope, agent_name, session_id, active, superseded_by, expires_at
  or user_id changes. No-op updates/retrieval counters need not advance it.
  Ordinary manual ABA must advance revision twice. Physical delete/recreate must
  not revive a reviewed old binding; tombstone the revision/binding or enforce
  inability to reuse identity. AG1 owns final isolated implementation.
- Extend SAME coach_action_proposals action check with memory.confirm,
  memory.correct, memory.delete. Envelope is PersistentMemoryProposal DIRECTLY
  (not {proposal}), bounded 4096 UTF8 bytes, review 5m. Existing receipt size1024
  works because result contains receipt+invalidation metadata, no preference text.
- Add restrictive authenticated RLS policy on memory_chunks excluding
  agent_name='coach-assistant-confirmed' for both USING/WITH CHECK, combined with
  existing grants/policies. Service owner queries enforce private binding. Verify
  coach/client direct API reads cannot bypass this namespace exclusion.

## Operation contract

Types and strict schemas live in memory-contracts.ts. memory.read returns <=20
currently active, unexpired, nonsuperseded confirmed cards whose SHA256 text hash
still matches the reviewed binding. Unknown/legacy/inferred content is excluded.
Reads query current rows, never summary caches or historical proposals.

memory.propose/action memory.confirm accepts reviewed candidate text but only
creates a 5m proposal; it does not create a memory. memory.correct and
memory.delete also only propose, using memoryId/resourceVersion. Render full
before/after, then memory.apply with proposalId/hash/resourceVersion, stable
actionId and reviewed:true. Apply validates current scope, signed persisted
content, version and before value under row locks. Shared actionId advisory key
matches preferences/Food. Mutation+revision+receipt+audit commit together.

memory.receipt recovers by actionId in the same authorized thread. Receipts
contain no old preference text; refresh.strategy=refetch and
refresh.discardDerivedContext=true require consumers to discard any cached
summaries/assistant context and refetch cards before the next generated turn.
invalidatedMemoryVersions identifies the old version on correction/deletion.
The new service itself uses no summaries/derived cache (derivedContext=excluded).
No claim is made that the existing UI/history pipeline consumes these refresh
signals yet. Until bound, this slice is not a product memory completion.

Abort before dispatch returns cancelled. Errors after transaction dispatch are
uncertain, including lost commit result coincident with abort; recover the same
actionId, never retry with a new identity. A soft delete excludes memory from
retrieval; historical proposal text remains in private ledger under its retention
policy. It is not a claim of privacy erasure.

## Required acceptance

Ten injected tests cover concrete SQL transaction control, confirm/correct/delete,
receipt replay, audit rollback, org/thread separation for same user, changed text
hash exclusion, temporary/inferred/unreviewed rejection, lost commit+abort receipt
recovery, all generic read query branches, and legacy router namespace exclusion.
These are SQL doubles/rendered predicates, not PostgreSQL/RLS evidence.

AG1/AG4 must verify actual SQL current-role revocation, direct API exclusion,
new-process receipt, memory↔Food↔preference actionId collisions both directions,
manual ABA/delete-recreate, hash/source tampering, expired proposal, receipt/audit
failure rollback and cancellation/commit boundary. HTTP/UI and explicit profile
scope expansion are later integrations; keep activation off pending those gates.
