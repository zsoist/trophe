# Human-message capability in Coach Everywhere

The existing conversation engine accepts a server-created message capability registry.
The Luna-low selector (`coach-assistant.capability.v3-message-review`) can choose only `coach.message.recipient {}`,
`coach.message.propose {message}` or `none`. Identity overrides, apply, send and receipt
tools are absent from its schema. Unknown fields fail strict validation.

The registry resolves the canonical assigned coach through the human-message service and,
for a draft request, creates a canonical proposal containing the exact normalized text and
recipient snapshot. It reauthorizes around every service boundary and returns
`applied:false`. No message insert, rate charge or receipt occurs during preparation.

The same open-conversation generator renders a review-only response as the second and
final model invocation. The capability result is untrusted data in that prompt. The
generator cannot expose a second mutation intent or claim send, delivery or receipt.
Choosing `none` falls through the existing grounded conversation path.

Handler composition is gated by `COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED` and an injected
human-message service. The isolated CI boundary implements a narrow deterministic fixture
for the Spanish/English draft request; it makes no network call and is not the product
classifier. Tests use synthetic identities and injected services. API spend is US$0.
