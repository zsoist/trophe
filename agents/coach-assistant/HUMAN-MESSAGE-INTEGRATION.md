# Reviewed human-coach message

This vertical extends the existing Coach Everywhere runtime and the existing human chat
storage. Coach AI conversation history remains separate from `public.messages`. No SMTP,
email, push provider, attachment or new route is involved.

`createCoachMessageService(database, consumeRateLimit)` requires the existing durable
rate limiter. The existing Coach handler accepts operations only behind
`COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED`; AG1 owns concrete route composition and UI.
Operations are `message.recipient`, `message.propose`, `message.apply` and
`message.receipt`. They carry `coach-assistant.v2`, conversation and turn IDs.

Recipient resolution uses current self, organization membership, client/coach roles and
the assigned coach relation. Exactly one row is required. No row returns `not_found` and
multiple rows return `ambiguous_selection` for clarification. The snapshot includes the
coach UUID, nullable canonical name and a version binding relationship revision and scope.

Proposal stores that recipient and the normalized exact message, then returns proposal ID,
hash, relationship version, expiry and `reviewRequired:true`. Apply accepts no replacement
text and requires the exact proposal ID, hash, coach ID, version, stable action ID and
`reviewed:true`. Editing therefore requires a new proposal and confirmation.

Apply locks the action and proposal, rejects another action consuming the proposal, uses
the existing `client-message` rate bucket and re-resolves authorization immediately before
the shared writer. Message insert and durable receipt commit in one transaction. A failed
precommit receipt rolls the message back. A lost response is recovered with the same
action ID; replay never inserts or charges twice. A post-commit authorization change is
reported as `uncertain`, never as proof that nothing was stored.

Receipt status `stored` means persisted in the human chat at `recordedAt`; it does not mean
delivered, read or still present after later deletion. The refresh signal instructs the UI
to refetch the canonical client/coach thread. The flow never promises rollback of a stored
message and never retries an uncertain apply automatically.

AG1 composes the service in the existing route only when the server flag is `1`; the
browser entry is separately compiled behind `NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED`.
The browser accepts only strict JSON capability/result shapes, keeps recipient and exact
text visible for review, invalidates confirmation after editing, and blocks another Coach
action while a review or uncertain write is unresolved. A receipt emits a scope-bound
`refetch` event to the existing human chat; no parallel message timeline is created.
If the assignment version is stale, the UI keeps the draft, clears the old review and
requires an explicit recipient refresh followed by a new review and confirmation.

`db/isolated/coach-message-actions.sql` provides the private relationship revision and
extends the shared proposal/receipt ledger only inside the disposable CI database. It
invalidates reviews for assignment, profile role/name and organization-membership changes,
including ABA changes. The guarded fixture exercises real local Auth, HTTP, SQL and mobile
UI with synthetic client/coach identities. It verifies one message, one receipt and one
limiter charge; recovery uses the same action ID in a new process. Evidence label:
`AUTH_DB_ISOLATED`; model cost is US$0 and no external recipient is contacted.

Known limit: both flags remain off by default. This isolated SQL is not a production
migration and was not applied to production. Enabling production remains a separate
integration decision after review and migration approval.
