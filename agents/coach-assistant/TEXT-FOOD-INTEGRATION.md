# Text Food intake — offline service candidate

This slice adds a server service for a new meal described in text (including a
reviewed voice transcript). It does not expose a route, change the chat prompt,
write automatically from speech, or enable the feature in the published Preview.

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
   reviewed nutrition (catalogue drift causes conflict), and writes all selected
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

## Remaining integration

- Exact reviewed QA preflight/migration/postflight decision (still HOLD).
- Authenticated handler and feature capability composition using the existing
  getUser/actor allowlist, shared budget store and per-request transport identity.
- Review UI and canonical Food refetch, including clarification, expiry,
  unavailable-parser and ambiguous-response receipt recovery.
- Conversation routing, latest-message language and meal-specific evidence
  relevance. No claim that these user-facing failures are fixed by this service.
- Isolated database integration tests and physical-device acceptance before
  enabling the feature. Injected transaction tests do not certify PostgreSQL,
  provider quality, browser behavior or a live meal write.

## Offline evidence

The service tests cover review-only writes, current authorization, cross-scope
access, expiry, tampering, request-id conflict, pending/concurrent claims,
receipt replay, sibling-proposal duplication, 12-item meals, clarification,
native display names, cancellation, and atomic rollback on receipt/audit/readback
failure. They use injected transactions and synthetic Food data only.
