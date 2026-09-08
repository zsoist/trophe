# Measured pilot runner — LIVE-01 gated

The US$3/day America/Bogota authorization replaces the former zero-dollar gate.
Live mode is callable only with the real shared transport and durable budget store;
an injected transport is rejected. The initial evaluation's conservative maximum
reservation is calculated before work and must stay at or below US$0.50. A missing
credential or failed budget gate still prevents provider dispatch.

Each model invocation receives its own reservation and stable attempt identity.
There are at most two per turn, each configured with one HTTP attempt so SDK retries
cannot bypass admission. Reports aggregate measured usage while retaining per-attempt
IDs and provider `x-request-id` values. Missing usage, uncertain transport outcomes,
or an unpriced returned model retain the reservation and stop the run.

`runCoachPilotEvaluation` in pilot-runner.ts accepts pilotId, verified actorId,
evaluationId, mode, optional fixed dataset caseIds and includeSyntheticText.
Dependencies are the authorized persistent PilotBudgetStore and AbortSignal;
mode=injected additionally requires an explicitly injected structured transport.
Mode=live does not accept an injected transport masquerading as measured usage.
No live call or credential access has been performed. This runner is not an HTTP
feature flag.

The built-in LIVE-01 dataset contains the six authorized situations: complete week,
partial/empty week, Food 250g→150g review intent, ambiguous Food correction,
instruction injection in retrieved curated data, and a denied subject switch. The
Food case enables the existing provider-selected typed action only when the server
has deterministically bounded both quantities and screen scope. The model must
select and copy that allowlisted action; the runner never inserts the expected intent
into the response. No proposal is applied in this direct runner. AG1's integrated
app trace owns canonical Food resolution, proposal, confirmation and receipt.

The runner stops on failed structural checks or uncertain accounting. Structural
checks are not a semantic release score; every case has `qualityReview=pending` and
`releaseApproved=false`. Dataset/prompt/pricing versions, selected tool/arguments,
proposal/receipt counts, request IDs, usage, latency, reservation and cost accompany
the review artifact.

For each generated turn, deterministic evaluation/case IDs bind one agentRunId,
attemptId, turnId and request hash. The runner validates the Luna/OpenAI/low policy
and the single-attempt 2000-output contract, reserves through the store, then claims
dispatch before invoking the existing structured transport. It does not call
executeAiTask/createGeneration or create a duplicate runtime row. The SQL writer
must settle telemetry on the same existing agent_runs row while preserving budget
metadata. Prompt/hash/usage contain no user identity or credentials.

Usage is settled before output validation: malformed prose can still cost money.
Provider failure retains unknown consumption. An uncertain settlement/claim never
causes an automatic retry or reservation release. A repeated evaluationId recovers
the same attempt and cannot dispatch it again; recovered results do not invent a
zero historical cost. The report carries IDs for explicit follow-up recovery.
An abort may leave the persistent state dispatched instead of unknown if the
accounting write is cancelled; both retain the full charge and prohibit redispatch.

Unlike the offline candidate response's diagnostic telemetry, report costs are
priced directly from observed usage. Injected runs expose simulatedUsageCostUsd
and measuredUsageCostUsd=null with actualProviderCalls=0. A future authorized live
run exposes usage-priced measured cost; unknown usage/accounting yields null.
That amount is calculated from provider usage at the versioned tariff, not an
invoice reconciliation. No fixture zero-cost label is used as live measurement.

Default reports contain status, IDs, output digest, token counts, latency and costs,
not generated answer text. includeSyntheticText explicitly returns a review artifact
for these fixed synthetic cases; save it only in the authorized private evaluation
location. It is necessary for later independent qualitative review without repeating
paid calls. The runner does not print or persist prompts, credentials or environment.

Eight current runner tests use an explicitly serialized fake store and injected
transport. They prove orchestration, labels and failure handling, not actual SQL
exclusion/durability, provider access, measured Luna quality or authorization to
spend. The persistent writer's isolated SQL acceptance and an explicit budget
decision remain prerequisites to changing the live gate.

Model provenance: requestedModel is the configured request target. returnedModel
is explicitly null because the current ProviderResult does not expose response.model.
Neither the literal request nor fixture tests verify an account's access or returned
model snapshot. Before measured API evaluation, extract and retain the provider's
actual returned model through a compatible shared transport change under its lease.

Observed-model transport update: `ProviderResult.responseModel?: string` now
carries the actual OpenAI response.model when it is a nonblank string, through
the unchanged structured dispatcher. Missing/invalid metadata stays absent;
there is no request-model fallback. Each case/attempt reports requestedModel
and nullable returnedModel separately, including responses whose output later
fails candidate validation. The report aggregate returnedModel is nonnull only
when every dispatched case has the same known returned model. Mixed, unknown,
not-attempted and recovered-without-new-response cases do not invent provenance.
Injected response metadata is fixture evidence, not account/model availability.
Provider exceptions currently leave returnedModel null; the budget ledger stores
usage/charges but does not persist response metadata, so a recovered run cannot
reconstruct the prior returned model. Cost estimates still use the requested
Luna pricing version; an observed different identifier needs review before any
claim that its actual tariff matches. This metadata addition does not authorize
live calls, change prices or release a budget reservation.

Pricing correction supersedes the preceding requested-tariff limitation: only
exact observed `gpt-5.6-luna` is mapped to the current COACH_PRICING_VERSION.
No dated snapshot aliases are mapped. Missing/different response metadata calls
mark_pricing_unknown with the original usage and nullable responseModel, never
settle. Both cost fields remain null. The persistent core retains the full
reservation, records unpricedModel and accountingAlert, and blocks subsequent
reserve/dispatch through the pilot aggregate. No ordinary settle can clear that
record; explicit future reconciliation is required. A failed persistence call
still leaves the dispatched reservation held; the runner stops without retry.

Integration boundary: runner now requires an explicit typed `candidate` dependency
with `promptVersion` and `run`. It imports no candidate engine, open-conversation
module or candidate prompt. The supplied promptVersion must equal the governed
request policy version before any reserve/dispatch. There is no default engine
or endpoint binding. Runner tests use a small transport/shape fixture only;
their passes make no claim about candidate conversation quality. A future
composition root must explicitly supply a reviewed candidate implementation.
