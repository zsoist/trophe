# Ask Trophē voice UI — P6 integration

The global composer owns the only assistant microphone session. Its visible flow is:
permission request, recording, local review, processing, editable transcript, explicit
send, answer, and optional device playback. Cancel, panel close, unmount, identity or
subject change, conversation change, recorder failure and a new recording all cancel
the active session. The shared recording session releases every MediaStream track;
the controller also revokes its object URL and stops answer playback.

`VoiceTranscriptionTransport` is injected. The private Workout review injects an
explicit `synthetic_fixture` whose text states that it did not come from the recording;
it does not imitate STT quality or call a provider. Product routes keep transcription
unconnected in this slice.

Reviewed text uses the P6 server contract and preserves the original turn id. The UI
preflights ambiguous alternatives such as “15 or 50” with the same browser-safe helper
as the server. The server verifies its ephemeral token and scope before continuing
through the existing offline v2 conversation pipeline. The HTTP adapter is gated by
both `COACH_ASSISTANT_VOICE_REVIEW_ENABLED=1` and the existing assistant preview
allowlist; it returns 404 in production. The client flag is
`NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED=1`. Both remain off by default.

Speech is descriptor-driven and never autoplays. When the reviewed response offers a
validated-final-answer descriptor, the user may start or stop the browser's device
voice. Starting a recording, closing the assistant, changing scope or unmounting stops
playback. No generated audio, raw recording, transcript copy, remote audio URL or
provider result is persisted by this UI.
