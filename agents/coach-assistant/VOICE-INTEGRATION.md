# Coach voice v1 — integration boundary

Reuse `startCoachAudioRecording` from voice-contract.ts, a thin call to the existing
lib/microphone/recording-session.ts with the existing lower maximum of 30 seconds.
No per-screen recorder or Realtime framework. UI cancels this session on identity,
organization or conversation change, dismiss and unmount; microphone tracks are
released even when permission resolves after cancellation. Local playback may use
the captured Blob and an object URL owned/revoked by the UI. Do not upload on capture.

After explicit upload review, `transcribeCoachAudio(file,metadata,options)` verifies
self authorization, organization stability, file signature, existing container
parser duration and 2MiB size. Metadata duration is not authoritative. Only explicit
synthetic repository plus injected transcription provider can run in this tranche;
no injection or real records returns budget_blocked/not_connected. The callback
reuses invokeOpenAiTranscription's signature and existing transcription policy;
it does not call runTranscription or /api/ai/transcribe under a false food context.
The existing route's food/intake contract is unchanged. Real STT needs a separately
authorized connection, budget and review, not a UI assertion of availability.

Successful results are scoped to actor/organization/conversation and original turn,
status review_required, transcript.source synthetic_fixture and trust untrusted_transcript.
The result carries a process-bound, five-minute review token signed over actor,
organization, conversation, turn, locale and the original transcript hash. It carries
no audio or transcript copy beyond the editable result, and records that audio was
discarded after transcription. A server restart invalidates outstanding review tokens.
`prepareReviewedVoiceMessage`
requires explicit review, current matching scope and edited text within the same
2000-character text schema. It returns text only. `runReviewedVoiceTurn` verifies the
token, cancellation and current authorization, then passes the edited text unchanged
to the existing ordinary v2 text pipeline for the same conversation and turn. It does
not create another agent runtime. Authorization and response scope are checked again
after that pipeline completes. Never send the transcript automatically,
execute a proposal from it, create memory or fabricate a receipt. Result text longer
than the message limit fails rather than silently dropping transcription content.

Before the text pipeline runs, spoken numeric alternatives such as “15 o 50”,
“fifteen or fifty”, “15 oder 50” or “15/50” return clarification_required. This is
conservative because the existing pipeline may classify the resulting request as a
mutation; the adapter does not invent a second intent classifier. The check covers
the supported transcription languages while preserving the reviewed language,
units and negation byte-for-byte for unambiguous text.

45-second total deadline, signal propagation and authorization after transcription
prevent a late or revoked result from being published. No persisted audio, remote
URL, paid transcription, TTS or measured ASR quality in this slice. Container signature
and duration checks reuse the stack; they do not prove audio intelligibility. Tests
use the existing real silent WebM fixture and explicitly injected transcript text.
TTS remains not_connected. A successful reviewed turn may return an optional
available_on_request descriptor bound to conversation and turn. The descriptor contains
no audio, disables autoplay, requires a response id, expires after 60 seconds and names
only the validated final answer as its future text source. Any later playback must
speak that finalized user-visible text, exclude secrets and unconfirmed action outcomes,
and stop on cancellation or scope change.
