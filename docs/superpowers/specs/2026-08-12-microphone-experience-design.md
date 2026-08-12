# Trophē microphone experience

## Problem

Trophē has three microphone experiences with different reliability levels:

- Food logging uses a guarded Web Speech lifecycle, but unsupported browsers stop at an error and its controls and permission help contain hardcoded English.
- Intake owns a second, weaker Web Speech implementation with no timeout, cancellation, cleanup, recovery guidance, or accessible state model.
- Chat voice notes use `MediaRecorder`, but capability failures, recorder errors, maximum duration, and interruption behavior are incomplete.

This inconsistency is visible to users. A microphone button must react immediately, make its current state obvious, preserve spoken words, release hardware on every exit, and give a useful recovery path when browser-native speech is unavailable.

## Selected design

### Shared lifecycle

All microphone features use shared, dependency-injectable lifecycle helpers under `lib/microphone/`:

1. `speech-recognition.ts` owns browser Web Speech callbacks and exposes exactly one terminal result.
2. `recording-session.ts` owns `getUserMedia`, `MediaRecorder`, timers, chunks, and track cleanup.
3. `transcription-client.ts` uploads a completed fallback recording to Trophē and returns a validated transcript.
4. `languages.ts` maps the eight Trophē locales to speech-recognition language tags.

The user-visible state model is:

```text
idle → requesting permission → listening/recording → stopping/transcribing → ready
  └──────────────────────────────────────────────────────────────→ error
```

Every terminal path detaches callbacks, clears timers, and stops all media tracks. Cancel is silent and never submits partial audio. Stop preserves collected speech.

### Native first, bounded fallback

Food and intake use browser Web Speech first because it is fast and adds no Trophē API charge. When Web Speech is unavailable, throws during startup, or has already proven unreliable for the current retry, Trophē records a completed clip and sends it to `/api/ai/transcribe`.

The fallback uses `gpt-4o-mini-transcribe`, OpenAI's lower-cost specialized speech-to-text model. It reuses the production `OPENAI_API_KEY` already used by Luna; it does not route audio through `gpt-5.6-luna`, because the Audio Transcriptions endpoint has its own model contract.

The recording limit is 30 seconds. The browser stops automatically at the limit and immediately enters a transcribing state. Food transcription is parsed through the existing food review pipeline. Intake transcription appends to the existing answer without erasing typed text.

### Server transcription boundary

`POST /api/ai/transcribe` accepts multipart form data:

- `file`: one `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, or `webm` audio file
- `context`: `food` or `intake`
- `locale`: one of `en`, `es`, `el`, `fr`, `de`, `it`, `pt`, or `nl`
- `durationMs`: the client-observed duration, clamped for telemetry only

Server guarantees:

- authenticated `guardAiRoute()` identity before body processing
- a separate durable limit of 10 transcription requests per user per 15 minutes
- maximum upload size of 2 MiB
- one provider attempt, with a 20-second end-to-end deadline
- stable, non-sensitive error codes
- response validation before returning `{ text, languages }`
- no storage upload, database audio field, provider-body logging, or raw transcript telemetry

The transcription agent is registered as the `transcribe` task and writes one `agent_runs` row. Cost accounting uses the API's returned token usage at the model's published rates ($1.25/M input and $5/M output), with a fail-closed $0.03 hard request ceiling derived from the model's maximum context and output. Existing organization and solo-user daily budget checks remain active.

The food prompt asks for exact dictation and explicitly forbids inventing brands or products. It supplies nutrition vocabulary but no brand-name keyword list, because over-hinting brands can itself create false branded terms.

### Food logging behavior

- Tap target is at least 44×44 CSS pixels.
- The button changes immediately from Voice to Stop and exposes `aria-pressed`.
- Interim native text remains visible in the textarea.
- Fallback recording shows requesting, listening, and transcribing states.
- Successful speech enters the existing parsed-food review; it never bypasses user confirmation.
- Permission denial shows localized iOS, Android, or desktop recovery instructions and a localized retry action.
- Reduced-motion users receive static state feedback instead of an infinite pulse.

### Intake behavior

- Intake reuses the same Web Speech controller and recorded fallback.
- Transcript text is appended with normalized spacing to the current answer.
- Navigating to another question or leaving the page cancels the active session and releases the microphone.
- Stop, requesting, transcribing, unsupported, permission, no-speech, and generic failure states are visible and localized.

### Chat voice-note behavior

- Chat reuses the shared recorder lifecycle but does not transcribe the note.
- Voice notes have requesting, recording, cancel, stop-and-attach, and error states.
- Maximum duration is five minutes; reaching it stops and attaches the recording.
- Recorder errors release every track and show localized recovery copy.
- The pending blob remains local until Send. Existing upload retry behavior remains intact.
- Playback controls have localized accessible names and 44×44 targets.

## Browser and security requirements

- `Permissions-Policy: microphone=(self), camera=(self)` is set on all responses.
- Production remains HTTPS-only, which is required for `getUserMedia`.
- Audio provider calls remain server-only; CSP does not add OpenAI to browser `connect-src`.
- `MediaRecorder` format selection prefers WebM Opus, then MP4, and rejects unsupported environments with actionable copy.
- No paid provider call is possible in local tests because provider transport injection is required outside production unless `TROPHE_ALLOW_PAID_AI=1` is explicitly set.

## Accessibility and responsive behavior

- Verify first at 390×844, then at desktop width.
- Every microphone action is keyboard operable, has a localized accessible name, and meets the 44×44 touch-target minimum.
- Status changes use `aria-live="polite"`; errors use an assertive alert only when user action is required.
- Motion respects the existing reduced-motion preference.
- Visible microphone copy is localized in all eight supported languages.

## Failure contract

Client errors distinguish permission denied, missing device, unsupported recording, no speech, network/provider failure, timeout, oversized recording, rate limiting, and cancellation. Raw provider errors, request bodies, filenames, audio bytes, and transcripts never appear in user copy or server error logs.

## Verification contract

- Unit tests prove exact-once completion, cancellation while permission is pending, timeout auto-stop, recorder-error cleanup, file/type/size validation, rate limiting, provider response validation, transcript append behavior, and actual-cost ceiling enforcement.
- Component-focused tests prove food and intake keep text and expose correct state labels.
- Browser QA covers food, intake, and chat at 390×844 and desktop, including permission denied, unsupported Web Speech, Stop, Cancel, and maximum-duration paths using mocked browser media APIs.
- Required repository gates are typecheck, uncached lint, full Vitest, production build, diff check, security secret scan, reviewed PR, green GitHub CI, Ready Vercel deployment, and production canary.

## Alternatives rejected

- **Browser-native speech only:** keeps cost at zero but cannot provide dependable behavior across iOS WebViews and browsers without Web Speech.
- **Always use server transcription:** simpler, but adds avoidable cost and latency to browsers where native recognition is already responsive.
- **Realtime transcription:** unnecessary for a bounded 30-second dictation and materially more complex and expensive.
- **On-device WASM transcription:** avoids provider processing but adds a large model download, memory pressure, and slow startup on the mobile devices Trophē prioritizes.
