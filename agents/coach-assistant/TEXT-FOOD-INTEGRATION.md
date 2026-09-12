# Text Food intake — offline service candidate

This slice adds a server service, gated handler and functional review UI for a
new meal described in text (including a reviewed voice transcript). It does not
write automatically from speech or enable the feature in the published Preview.
Both COACH_ASSISTANT_TEXT_FOOD_ACTIONS_ENABLED and
NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED default off.

## Flow

1. `text.food.parse` authenticates the current client and active chat scope, checks
   the database action capability, and commits a pending request-id claim before
   parsing. The server adapter uses the existing native Food parser through a
   request-bound `food_parse` governed transport. Every native provider phase has
   its own shared-budget admission/settlement. A crashed or failed pending claim
   is not dispatched again with the same request id.
2. The returned parsed basis is hash-bound to actor, subject, organization and
   conversation, expires after five minutes, and contains the native items and
   any clarification. No Food rows exist yet.
3. `text.food.propose` accepts only item indices, explicit grams, meal type and
   date. It derives nutrition with the existing Food calculation and persists
   an immutable review with fixed entry ids. Duplicate indices and client macro
   fields are rejected. Identity clarification must be resolved before review.
4. `text.food.apply` requires `reviewed: true`, the exact proposal/hash and an
   action id. It reauthorizes, verifies expiry and the parsed basis, rederives the
   reviewed nutrition (catalogue drift causes conflict; referenced foods rows
   are locked FOR SHARE until commit, and missing references are rejected), and writes all selected
   items with the native reviewed-entry mapper and `natural_language` source.
5. The same transaction verifies returned Food rows, persists a receipt and
   audit record. Any failure rolls back the entire meal. Same-action replay
   returns the receipt. Another action or sibling proposal for the consumed
   parsed basis cannot create a duplicate meal. The result requests a date-based
   canonical refetch; clients must not present the proposal as a saved record.

## Database boundary — HOLD

The QA action constraint currently permits only preference.update,
food.quantity.update and food.photo.create. This service therefore returns
`not_connected` BEFORE parser dispatch. No migration has been applied.

The prepared external QA SQL changes only the action constraint, appending
food.text.create. It must receive an exact operation review before execution.
No new budget authority, envelope limit, role grants or reset is required.
Pending parse claims use the existing proposal table and its current chat-scope
trigger. Claim completion changes only the pending envelope to the parsed basis;
review proposals are not updated.

## Functional integration

The existing getUser/rate gate and actor allowlist dispatch text.food operations.
The private runtime composes the existing shared budget authority and native
parser; the client cannot provide actor identity or a provider transport.

In a durable live chat, a bounded affirmative new-meal statement in English or
Spanish prepares a draft before aggregate evidence reads. Negative, future,
correction and ambiguous-reference requests stay outside this automatic path.
The answer uses the current statement's language, states that nothing is saved,
and exposes the editable review. The same conversation path serves live voice's
onQuery callback. The parser's shared-ledger usage is not represented as free
chat generation: cost is unknown in this response and settled in the ledger.

TextFoodReview owns portions/date/meal selection, proposal invalidation after
editing, explicit confirmation, receipt recovery and canonical Food refresh.
TextFoodRecoveryNotice checks a pending receipt when the same chat is reopened
in the same browser session after a reload. Session storage contains only request
identifiers/hashes, never credentials, meal text or nutrition. Storage failure
prevents confirmation dispatch. No recovery path resends apply.

The component uses existing classes and localized labels; it does not implement
AG2's approved visual redesign. Stable props: draft, conversationId, transport,
onReceipt, optional onDismiss. The Food page's existing refresh listener also
accepts the text-food feature flag. Its delete/undo handlers are untouched.

## Remaining release boundaries

- Exact reviewed QA migration decision (still HOLD), then isolated full-schema
  integration, authenticated browser and physical-device acceptance.
- Intent coverage remains deliberately bounded to explicit English/Spanish new
  meal descriptions; it is not a claim of general conversational food reasoning.
- Reopening the same chat in the same browser session supports receipt recovery;
  cross-device recovery UI and general durable proposal history are not provided.
- Both new flags remain off. No deployment, paid parser run or live meal write
  has been performed for this candidate.

## Offline evidence

The service tests cover review-only writes, current authorization, cross-scope
access, expiry, tampering, request-id conflict, pending/concurrent claims,
receipt replay, sibling-proposal duplication, 12-item meals, clarification,
native display names, cancellation, and atomic rollback on receipt/audit/readback
failure. They use injected transactions and synthetic Food data only.

A dedicated disposable local PostgreSQL test verifies that the actual catalogue
FOR SHARE query blocks a concurrent nutrient update until commit and rejects a
missing reference. This narrow lock test does not certify full-schema RLS or the
QA action migration. It accepts only AG1_TEXT_FOOD_TEST_DATABASE_URL pointing to
127.0.0.1:5432/trophe_text_food_ag1_<unique suffix>; it never reads DATABASE_URL.
