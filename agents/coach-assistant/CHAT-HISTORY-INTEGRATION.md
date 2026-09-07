# Durable global chat and final-answer lookup v1

Own-module implementation only. AG1 owns schema/routes/UI integration; AG4 reviews.
No database execution, production migration, model invocation, root dependency,
new action ledger, deployment, or paid access was performed. Cap0 remains unchanged.

## Existing infrastructure inspected

`db/schema/agent_conversation.ts` supplies content, owner, namespace, role and
session but not actor/tenant/subject/role lineage, thread title/revision,
idempotency or deletion lifecycle. Its "90 days by nightly cron" description has
no matching purge implementation in the inspected source. Retention here is
**until explicit deletion; automatic retention is not connected**. Do not advertise
90-day erasure. Existing privacy export/erasure manifests include conversation
content by user_id; AG1 must add the private sidecars to privacy review/export.

`app/api/ai/conversation/route.ts` writes a legacy user/assistant pair and enqueues
inferred memory extraction. This implementation uses none of that route or queue.
It writes only the isolated `coach-assistant-global-v1` namespace, never human
chat messages, system/tool entries or automatically extracted memories.

`drizzle/0008_harden_rls_and_supabase_integration.sql` grants own SELECT by user_id.
That alone would expose historical global-chat text after tenant revocation.
Reusing content is therefore conditional on the prepared restrictive namespace
policy. The sidecar service alone is insufficient security against direct REST.

## Concrete service and storage contract

`createCoachChatService(database, cleanup?)` executes parameterized Drizzle SQL
transactions with current actor, actor membership role, subject membership/client
role, tenant and assignment locks before and after each operation. Its scope is
server-derived `CoachChatScope`; no operation body can choose it. Clients use
self; professional actors require current assigned-coach relationship. Fixed
actor ownership means another coach or the subject does not inherit a different
actor's private thread. Actual context/RLS tests remain required.

`CHAT-SCHEMA-PROPOSAL.sql` is a review artifact, **not a registered migration**.
It prepares two private sidecars: `coach_chat_threads` (scope, title, creation
request, lineage, state, monotonic sequence/revision) and `coach_chat_turns`
(content reference, request/turn IDs, sequence, revision, role, hash, final
pipeline version/current flag). Content reuses `agent_conversation`, whose user_id
is the owning actor. No metadata is encoded in content or tool_calls.

The service requires `private.coach_chat_contract_version()` to return v1.
Missing schema/function/column or missing expected policy/trigger readiness
returns not_connected, with no memory/sessionStorage fallback. This is an
installation contract, not a substitute for real SQL/RLS validation. Private
sidecars have no authenticated/anon grants. The restrictive content helper is
authorization-only, SECURITY DEFINER, fully qualified, fixed search_path, no
caller-supplied identity and no dynamic SQL. Review owner/grants with AG1/AG4.
Other agent namespaces retain their existing permissive access.

Revocation triggers latch `access_revoked` on role/membership/assignment changes,
including deletion/recreation: restoring an old membership UUID or assignment
cannot reopen the old thread. This is deliberately conservative; a new thread
is required after such lineage changes. Thread identity, deletion state and
monotonic revision cannot roll back. Final metadata cannot mutate or change from
superseded back to current; deleted content IDs cannot be inserted again. No
historical sidecar backfill is performed.

## Operations and pagination

Every request has version `coach-assistant.chat.v1`:

- create: requestId/title (1–80 characters); server generates thread UUID.
  Unique actor+requestId and create hash make replay exact, including after rename.
- list: limit1–50, optional before {createdAt,id}; stable descending creation key,
  nextCursor only when an extra authorized row exists. Revoked/deleted excluded.
- read: threadId, limit1–50, afterSequence; ascending current user/final messages,
  nextSequence when another page exists. At most1000 persisted events per thread.
- rename: threadId/title/expectedRevision; conflict if revision has changed.
- delete: threadId/reviewed:true; invalidates lookup immediately, deletes content,
  then reports cleanup_pending or deleted based on actual cleanup confirmation.
- append_user: threadId/turnId/requestId/text; shared 2000-character input validator.
  Unique thread+requestId and unique user turn prevent duplicated appends.

Cursor values do not grant access: every page uses the fixed server scope and
reauthorization. Same timestamp ties use UUID order. No full-history model prompt
or inferred-memory extraction is introduced. Existing prompt history limits
remain unchanged. AG1 must decide how a bounded selection of persisted messages
is passed through the existing derived-history validation; stored transcript is
historical text, not current evidence or preference authority.

## Final provenance and TTS wiring

After successful user append, call `runVerifiedChatFinal(request, existingOptions,
serverScope)` instead of calling the same pipeline twice. It invokes existing
`runConversation` once unchanged, snapshots the validated request and scope, and
mints an opaque process-local proof only for its successful output/snapshot.
When the route has already selected `createIsolatedCoachEngineBinding`, call
`runVerifiedChatFinalWithIsolatedEngine(request, existingOptions, serverScope,
isolatedEngine)` instead. That function invokes `isolatedEngine.run` once and
accepts only its process-minted binding plus the exact response object attested
to the same request and actor. It never calls `runConversation` again. A forged
engine is rejected before invocation; copied/serialized output, changed input,
or a different actor cannot mint a proof. The route should choose exactly one
of these two entry points for a turn.
There is no arbitrary-text constructor. Existing provider gates still apply.
`appendFinal(scope,{threadId,requestId,expectedAssistantRevision?},proof,signal)`
requires that exact proof object, same scope/thread/turn and persisted user text
hash. One proof binds one requestId (retries retain it); browser JSON final=true,
forged objects, another user prompt and copied proofs are rejected.

Regeneration uses a newly produced proof and the current assistant revision.
It appends a new content ID/revision and supersedes the previous one transactionally.
Old final IDs stop resolving even if newly generated text is identical. The
persisted message is exactly output.answer; runtime prompts, memory/context
payloads and raw model objects are not persisted. Pipeline validation is the
source of finality, not an additional claim of perfect semantic correctness.
A failed model turn leaves its real user message unanswered; it creates no fake
assistant text. Missing persistence should be handled before generation by AG1.

`createDurableCoachSpeechTextPort(service,serverScope,currentSessionEpoch)` is the
concrete server lookup for the earlier TTS service. It accepts only the exact
current assistant content ID from an active authorized thread, verifies stored
content hash/pipeline version and rechecks the live session epoch. User turns,
superseded/deleted/foreign/unbound content return null. Epoch is provided by the
existing authenticated session, never browser JSON; logout returns null and a
new session must use a new epoch. This release supports self-client TTS, matching
its existing authorization boundary. AG1 still owns route/playback integration.

## Reviewed deletion and scope

Suggested review text: "Delete this conversation, its messages, drafts, attachments
and memories saved exclusively to this conversation. Preferences explicitly saved
to your profile and already-applied food/workout changes or human messages remain."

Content is deleted in the first transaction and the thread becomes cleanup_pending;
all final lookup is immediately invalid. `createCoachChatCleanup` uses the existing
confirmed-memory namespace/bindings/advisory lock and deletion revision trigger.
It physically deletes only exclusively bound thread memory chunks in batches of20,
leaving their revision tombstones and verifying that every deleted binding advances.
More remaining chunks keep cleanup_pending so a retry can make bounded progress. Soft memory.delete alone would retain fact_text and is not
enough to claim erasure. It removes scoped memory-action envelopes/receipts because
they also contain deleted preference text; those proposals can no longer apply.
It removes unapplied scoped action drafts and any own-namespace session derivatives.
Applied independent non-memory action receipts/canonical records are preserved.
Profile preferences and other-thread memories are never selected by these deletes.

Attachments are inventoried by exact scope and removed through the existing
`createPrivateAttachmentService.operation(attachment.remove)` lifecycle. Storage
failure, absent tables/service with pending objects, mismatched remaining bound
memory, or partial cleanup keeps cleanup_pending. Repeating delete retries cleanup;
it never recreates the thread or its request ID. New resource writes matching a
thread tombstone are blocked by the proposed attachment/proposal guard, preventing
late uploads from recreating cleaned data. Existing upload row locks cover storage
I/O; actual lock order/rollback/storage-race tests remain required in PostgreSQL.
Already-delivered signed URLs can survive only their existing short expiry; UI
must also discard playback/derived caches on deletion. No remote byte retraction
or instantaneous provider-retention erasure is claimed.

The new cleanup is an explicit backend erasure operation, not an inferred-memory
producer, model-driven action, generic profile reset or scheduled janitor. No
90-day cron is provisioned. Subject/profile deletion cascades content through the
existing owner FK and sidecars through prepared FKs; storage objects still require
the broader existing erasure workflow review, not a false cascading-storage claim.

## Evidence and remaining gates

Stateful injected SQL tests execute the concrete service and actual existing
offline conversation pipeline: two actors/tenants/roles/subjects, revocation and
latched lineage, idempotency, pagination, CAS rename, verified-final proof,
regeneration/deletion/logout lookup and missing storage. Cleanup tests distinguish
an exclusively thread-bound preference from the same independently saved profile
preference, preserve binding revisions, and exercise pending/resumable attachments.
These are not PostgreSQL, Supabase Auth/REST, cross-device UI or storage race tests.

Required AG1/AG4 integration acceptance: schema constraints/helper/grants, legacy
positive REST access plus global revoked/deleted/foreign negative cases; true
transaction rollback/restart/concurrent replay; role/membership/assignment ABA;
late attachment completion against deletion; memory physical erasure/revision;
privacy export/retention contract; exact text/session lookup and UI invalidation.
No paid API was used. US$0.
