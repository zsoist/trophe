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

The private relationship revision and shared proposal/receipt schema remain isolated
prerequisites owned by AG1. No production DDL or migration was executed here. Tests use
synthetic identities and injected transaction doubles only. API spend is US$0 and no real
recipient was contacted.
