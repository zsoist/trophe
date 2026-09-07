# Conversation v5 release candidate — unapproved

`runConversationCandidate` in conversation-candidate.ts is the concrete evaluation
entrypoint. Supply a strict v2 request, synthetic repository, actor, fixed time,
AbortSignal and an explicitly injected provider with the existing structured
transport signature. No per-turn interpretation oracle is used. Each result is
marked evaluation.release=unapproved_candidate, semanticQualityVerified=false.
The ordinary HTTP path and contained runConversation do not select this mode;
request JSON cannot enable it. No API call was made and real records are blocked.

The candidate emits open declarative contextual explanation and a free follow-up.
Account-specific quantitative claims are typed evidence fragments rendered as full
canonical statements; actions/proposals/receipts remain separate deterministic
objects. Curated general record-interpretation explanations have separate IDs,
source version and text, chosen only from the applicable supplied list. Their
content is not rewritten into individual health or account outcomes. This is a
source distinction, not a finite list of conversational answer codes.

Structural validation checks references, entity aliases, curated applicability,
quantitative prose, bounds and output status. Additional conservative category
guards apply to answer AND followUp for account-state assertions, completed action
language, physiological outcomes and omission claims. These may reject useful
phrasing and cannot recognize every paraphrase, presupposition or language. Passing
those guards is not semantic verification. This candidate exists to evaluate those
tradeoffs independently, not to assert universal correctness or enable product now.

Development acceptance currently contains positive English and Spanish declarative
explanations with follow-ups, as well as the previously observed swapped-count,
passive-save, physiological assertion and question-presupposition failures. A runner
that rejects every answer fails the positive cases. Tests also cover invented
curated source, follow-up guard application and request-level mode injection.
AG4 supplies independent positive/negative release cases; these development cases
are not held-out evidence of actual Luna quality.

## Later measured evaluation, still blocked

Use the same v2 cases and prompt/schema version against the existing
invokeStructuredProvider transport, Luna low, one transport attempt and the shared
45-second/8000-input/2000-total-output limits. Start with a small positive/negative
subset, not an unconditional full battery. Record actual provider model ID, prompt,
commit/dataset, usage including reasoning/cache, latency, accepted/rejected output,
reference/numeric/account-action correctness, explanation usefulness and follow-up
relevance. Independent human or deterministic case oracles assess release results;
no LLM judge is required on every product turn.

Do not pass the live transport into the offline fixture runner and report its cost
as zero. A measured runner must distinguish actual usage/cost from fixture counters.
Before building/enabling that connection, satisfy LIVE-PILOT-READINESS.md: persistent
atomic pilot reservations covering AG3+AG4, uncertain attempts retained, known pricing,
account/provider access and an explicit AGG budget decision. Existing org-budget is
a soft historical cap and reconciliation skips failed runs. These are pending
prerequisites, not approvals inferred from pricing documentation or mock tests.
