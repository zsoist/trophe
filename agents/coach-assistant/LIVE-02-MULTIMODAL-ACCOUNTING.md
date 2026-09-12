# LIVE-02 shared modality accounting

LIVE-02 retains the existing Coach Everywhere and AI task runtimes. Luna text,
Luna vision, and OpenAI transcription reserve against the same
`ASK_TROPHE_SHARED_PILOT_ID` row before provider dispatch. The transaction-level
authority is the durable shared US$3 daily budget on the America/Bogota calendar
day. Historical rows, attempt counts, uncertain charges, and accounting blocks
remain intact and auditable; there is no separate LIVE-02 invocation-count cap.

`runGovernedPilotModality` wraps exactly one existing `photo_analyze` or
transcription invocation. It reserves the task policy maximum ($0.08 photo,
$0.03 STT), claims dispatch once, validates the exact provider/model/prompt with
no fallback, and settles measured token usage using versioned prices. A failed,
timed-out, cancelled, malformed, or accounting-ambiguous dispatched call remains
`unknown` at its reservation. The post-dispatch accounting write uses its own
five-second bound so cancellation of the browser request cannot erase a started
provider attempt.

The existing photo analysis endpoint applies the shared gate only to the Preview
pilot actor and then requires server-validated conversation and turn UUID headers.
This enables a real-image quality evaluation through the existing vision task;
it does not activate photo-derived Food writes. Those still require the durable
private attachment and observation prerequisites described in
`PHOTO-FOOD-INTEGRATION.md`, followed by proposal, explicit confirmation, apply,
and receipt.

The Coach voice PUT route can use the existing OpenAI transcription adapter when
`COACH_ASSISTANT_VOICE_LIVE_ENABLED=1` inside the existing Preview pilot gates.
Its editable transcript remains untrusted until reviewed. The reviewed POST then
uses the same governed Luna engine and therefore consumes a second shared
admission. Synthetic CI transcription remains isolated and costs zero.

Answer playback uses the browser's `window.speechSynthesis`; it makes no provider
request and consumes no shared invocation. It stays opt-in and never autoplays.
