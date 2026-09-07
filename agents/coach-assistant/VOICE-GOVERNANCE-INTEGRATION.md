# Governed STT and optional TTS — 2026-09-07

Implemented offline; production cap remains `COACH_PILOT_BUDGET_USD = 0`.
No UI, route, migration, key, public storage, paid inference, or deployed activation.

## STT wiring

`transcribeCoachAudio` preserves actual container validation (WebM/MP4, 30s,
2MiB), current self/organization authorization, cancellation and 45s deadline.
Legacy arbitrary fixture callbacks remain synthetic-repository-only. An explicit
`createGovernedCoachTranscriber` may wrap `createInjectedOpenAiCoachTranscriber`
with authorized records; its frozen actor/org/conversation/turn binding must match
current authorization. It reauthorizes again after reservation/dispatch claim.
This reuses `invokeOpenAiTranscription` and `taskPolicies.transcribe` directly,
without Food/intake context, a new STT provider, or model fallback.

Server composition supplies `AudioIdentity` (same pilotId as text, actorId from
session, organizationId from authorization, conversation/turn plus stable unique
attemptId/agentRunId), `createAudioBudgetStore(database, actorId)`, and the explicit
injected transport for offline integration. JSON sent by the browser is never a
budget identity, provider, final text or authorization context.

Output remains `review_required` with `synthetic_fixture` provenance for the
injected provider. Capture → editable transcript → `prepareReviewedVoiceMessage`
→ normal text pipeline only after user review. There is no autosend or action.
A silent 108ms fixture tests parsing only: its injected words are not ASR evidence.

## Optional final-answer speech

`createOpenAiCoachSpeechProvider` implements OpenAI POST `/v1/audio/speech`, model
`gpt-4o-mini-tts`, built-in `coral`, speed1, PCM 24kHz/16-bit/mono. It reuses the
existing OpenAI access guard and transport debit hook; no retry, redirect or
custom endpoint. Live transport stops at cap0 before key access/network. Injected
fetch uses the existing offline placeholder. Bytes are bounded while reading;
empty, odd-sized, >30s, oversize, wrong MIME and exactly zero PCM are rejected.
PCM is headerless: these checks do not prove speech intelligibility or accuracy.

`synthesizeCoachSpeech` accepts only responseId/conversationId. The **server-owned**
`CoachSpeechTextPort` must resolve the current already-validated final answer,
`speechAllowed`, immutable revision and authenticated sessionEpoch. It must deny
proposals, unverified receipts, secrets, internal context and withdrawn answers.
The helper rejects non-final/denied values and common key shapes, but this is not
a semantic verifier of model prose. Do not wire this port to raw request/model
text. The engine's final-output validation remains authoritative. Concrete final
answer/session lookup and UI playback are integration dependencies owned by AG1.

Ready audio includes synthetic-voice disclosure, scope, text/audio hashes and
current response revision/session epoch, with a one-minute expiry. Server
`validateCoachSpeechPlayback` recognizes only the issued object and rechecks the
current final text, scope, revision and epoch; copied/forged objects are invalid.
No audio is persisted. Regeneration must change revision even if text is identical;
logout must revoke the lookup/change session epoch. AG1 must stop playback and
revoke its local object URL on either event/scope change; bytes already delivered
cannot be remotely retracted. This process-local receipt is technical audio
availability, never a receipt of a saved/sent business action.

Binary Speech responses have no documented per-request token usage. The concrete
transport returns usage:null. **Valid audio may still be ready** only after the
ledger confirms `unknown`, the full reservation remains held, and post-transport
scope/text authorization still matches. The server envelope's `accounting` field
is internal (`held_unknown`); do not display finance plumbing in playback UI.
Missing transport returns not_connected. Missing/ambiguous durable confirmation,
invalid bytes, cancellation, expired/revoked scope return no playable result.
No extra inference is performed to reconcile usage or validate pronunciation.

## One accumulated budget, two explicit token tariffs

Sources fetched 2026-09-07:

- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [STT model rates and limits](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe)
- [Transcription request/usage contract](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [Speech request contract](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)
- [Synthetic voice disclosure/PCM protocol](https://developers.openai.com/api/docs/guides/text-to-speech)

Tariff version `openai-audio-standard-2026-09-07.v1` is for the standard global
OpenAI endpoint: STT input $1.25/output $5 per million provider tokens; TTS text
input $0.60/audio output $12 per million provider tokens. Integer nanodollars:
STT 1250/5000 per token; TTS 600/12000. No cache tier is asserted by these audio
contracts. Estimated per-minute prices are **not** settlement prices. No Luna
pricing, local duration, character count or PCM length substitutes for usage.
Unknown model/tariff/unit blocks reservation; unknown usage holds the full amount.

Reservation is $0.03 per audio attempt, matching the existing STT task envelope
(16k model input +2k output at this tariff). For TTS this is a conservative local
reservation, **not a provider-enforced generation cost ceiling**: its speech API
has no max-output-token control here. A measured overrun is charged fully and
sets the accounting alert. Cap0 remains the live gate; enabling paid TTS requires
an accepted bounded-cost policy as well as durable/permission gates. No claim of
hard paid per-turn enforcement against an opaque provider overrun is made.

`createAudioBudgetStore` is a concrete adapter in the leased
`lib/workout/pilot-budget-service.ts`. It shares the same transaction and locked
`private.coach_pilot_budgets` account as `createPilotBudgetStore`, and records
attempts in existing `agent_runs.metadata.coachPilot`. Mixed rows are validated,
summed and checked against stored count/total. It retains existing Luna record
validation/pricing and adds audio records with modality/unit and scope binding;
no historical records are rewritten. One STT and one TTS attempt per turn;
existing maximum two text invocations. Combined turn reservations/known spend
must fit $0.05; all modalities also share the accumulated account cap.

Reserve → claim_dispatch → provider → settle/unknown. Replays never redispatch.
Dispatched/unknown attempts prevent new claims/reservations across modalities,
including when cancellation makes mark_unknown unavailable; reconciliation of
that same attempt remains possible. A confirmed unknown/overrun sets the durable
accounting block. No retries or automatic reset. Unknown reservations never become
available money. Released applies only to provably unstarted attempts. No
billing text/audio content is stored: only identifiers, hashes, units and costs.

The SQL adapter is implemented and exercised using injected transactions.
Actual PostgreSQL locking/RLS, rollback/restart, existing private table and
agent_runs constraints require AG1 integration/AG4 review before activation;
no DDL or DB execution occurred here. The shared-source delta is separate from
the own-module patch, based on the explicitly copied AG1 source in its manifest.

## Evidence limits

Tests exercise concrete multipart/JSON HTTP construction with injected fetch,
container/PCM validation, scope and turn binding, cancel/revoke/regenerate/logout,
unknown holds, replay, mixed accounting, and existing text budget/runner behavior.
They do not establish real ASR/TTS quality, actual API usage/latency, database
concurrency, browser microphone/playback UX, or a working paid connection.
US$0 spent. No provider/model availability probe was made.
