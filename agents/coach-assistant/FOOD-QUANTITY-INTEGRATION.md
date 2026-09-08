# Food quantity correction — concrete shared writer and transaction service

AG3 owns the extracted lib/food/log-edit-service.ts, its manual food.ts call sites,
and agents/coach-assistant/food-service.ts. AG1 owns isolated schema/CI/integration.
This is not a second food mutation: manual edit/coachEdit and reviewed quantities
call the same applyFoodLogEdit and deriveFoodLogEdit with editFieldsSchema.

createFoodQuantityService(db) implements FoodQuantityService.execute plus the real
parseFoodQuantityChange validator. Operations are food.resolve/read/propose/apply/receipt.
Resolve accepts the old grams plus an optional visible meal or date hint, then selects
exactly one currently owned row. No match returns not_found and multiple matches return
ambiguous_selection for clarification; it never chooses another entry or creates a meal.
Every later operation is bound to entryId, actor/self subject, organization, conversation
and turn.
Propose accepts grams only, showing the entry's full before/after values, foodId and
source provenance, including macros recalculated through the shared Food derivation.
The proposal carries expectedVersion. Apply requires proposal/hash/version/actionId
and reviewed:true.
The adapter verifies returned resource/quantity/receipt/refresh binding; no optimistic
success is returned without an applied receipt and versioned refetch boundary.

The action boundary reauthorizes after service dispatch, and the transaction reauthorizes
current client self and organization membership,
locks the food_log row and canonical foods nutrient source, and checks the private
entry revision. A saved proposal stores the shared calculation and a stable sorted
JSON hash, independent of JSONB key ordering. Apply checks the original values and
recomputes through the same shared function; changed reference nutrients conflict
before writing. The post-write values must match the reviewed values exactly and
the revision must advance. Record update, receipt and audit commit together.
Flywheel capture retains the existing non-blocking behavior using a savepoint when
inside this transaction; sanitized error metadata replaces raw exception logging.

It reuses private.coach_action_proposals and private.coach_action_receipts, not a
new ledger. Food envelopes are {proposal,expectedEdit,foodId}; receipt result is the
complete FoodQuantityResult with receipt+refresh. The existing unique actor/actionId
and advisory lock namespace are shared. Replay joins proposal.action and entry ID;
other action families conflict. AG1 is adding the corresponding preference-side
namespace checks. Current actor authorization is rechecked even for receipt reads.
A deleted entry can retain its original authorized receipt; it cannot be re-applied.

Exact isolated prerequisites owned by AG1: apply coach-durable-actions.sql, then
coach-food-actions.sql, adding action food.quantity.update, 4096-byte proposal
limit and private.coach_food_entry_versions(entry_id,revision) with a trigger for
actual ordinary row changes. Food receipt envelopes fit the existing 1024-byte
limit. No productive migration, table creation, SQL execution or HTTP enablement
has been performed by AG3. The factory remains unconnected pending that acceptance.

Refresh strategy is refetch for the matching entry/day (food.log.list), not a blind
replacement of UI state. Another manual edit after commit can legitimately make
its current revision newer than the historical receipt; re-fetch authoritative
records and do not relabel a replay as another mutation. The UI must keep identity
and conversation checks when displaying results.

Validation to date: the existing manual Food tests, actual extracted calculation
and savepoint sequencing with injected DB operations, adapter binding tests and
concrete transaction-service tests with a rollback-capable SQL double. These are
not PostgreSQL auth/row-lock/trigger/atomicity evidence. Required isolated checks:
250g->150g canonical preview/apply, manual edit and nutrient-source change conflicts,
foreign entry/org rejection, revoked receipt read, same action replay, duplicate
concurrent apply, receipt failure rolling back entry/revision, flywheel failure
savepoint recovery and deleted-entry receipt behavior.

The isolated SQL suite must also collide the same actor/actionId between preference
and Food in BOTH directions, and check an ordinary manual ABA edit that returns to
the same values with a newer revision. Inject failures at both receipt insertion
and audit insertion: entry mutation, revision and receipt must roll back together.
These are required SQL oracles, not claims covered by the injected transaction tests.

### Gated handler transport (AG3)
The existing `handleCoachRequest` accepts all five typed `food.*` operations via
optional `createFoodService(): FoodQuantityService | Promise<FoodQuantityService>`.
`COACH_ASSISTANT_FOOD_ACTIONS_ENABLED=1` is required independently of preference
and isolated action flags. Default/off returns 404 before repository/service
creation; enabled without a bound service returns 503. No fallback to another
action family. Existing preview allowlist, guard, production exclusion, body
limit, cancellation/deadline and no-store response apply. AG1 owns concrete route
binding and UI; activate only after isolated SQL acceptance. No route binding or
flag activation is included in this change.

UI contract: POST the `FoodQuantityOperation` union to the existing endpoint.
The conversational intent target is `{selection:'authorized_food_entry',
entryHintId,previousGrams,grams}`. It is only a review intent: call food.resolve with
the old amount and optional hint, then use its canonical entry/version for propose.
Read returns snapshot and its version. Propose sends that resourceVersion and
`after: {grams}`; render the full before/after for review. Apply must carry the
proposal id/hash, unchanged resourceVersion, stable actionId and `reviewed:true`.
Recover uncertain delivery with food.receipt and the same actionId. An applied
receipt includes `refresh` with entryId/loggedDate, previousVersion/version and
`strategy:'refetch'`; refetch actual Food data, never optimistically substitute
model text. Errors map invalid_input 400, forbidden 403, not_found 404, expired
410, version/idempotency conflicts 409, uncertain/cancelled 503. Transport gating
and generic guard failures retain the existing v1 error envelope. A receipt
lookup requires the entryId/conversationId used by the original operation.

Verification: 22 handler/transaction-double tests pass, scoped TypeScript and
lint pass. This proves injected transport behavior, not deployed HTTP/Auth/SQL.
Receipt/proposal JOIN now additionally binds actor, subject, organization and
conversation for defense against mismatched ledger rows.
