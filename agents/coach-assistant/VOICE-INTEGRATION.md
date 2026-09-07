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
status review_required, transcript.source synthetic_fixture. `prepareReviewedVoiceMessage`
requires explicit review, current matching scope and edited text within the same
2000-character text schema. It returns text only. The UI then uses the ordinary v2
text pipeline as a new submitted turn. Never send the transcript automatically,
execute a proposal from it, create memory or fabricate a receipt. Result text longer
than the message limit fails rather than silently dropping transcription content.

45-second total deadline, signal propagation and authorization after transcription
prevent a late or revoked result from being published. No persisted audio, remote
URL, paid transcription, TTS or measured ASR quality in this slice. Container signature
and duration checks reuse the stack; they do not prove audio intelligibility. Tests
use the existing real silent WebM fixture and explicitly injected transcript text.
TTS remains not_connected. Future playback must speak finalized user-visible text,
exclude secrets and unconfirmed action outcomes, and stop on cancellation/scope change.

## Governed extension

See [VOICE-GOVERNANCE-INTEGRATION.md](./VOICE-GOVERNANCE-INTEGRATION.md) for the
explicit authorized-record STT transport, optional TTS, shared budget adapter,
current pricing sources and injected-versus-live limits. This supersedes the
older synthetic-only gate description when a registered governed transcriber
is supplied. Bare legacy callbacks still require a synthetic repository.
