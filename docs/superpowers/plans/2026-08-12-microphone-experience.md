# Trophē Microphone Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make food dictation, intake answers, and chat voice notes responsive, recoverable, accessible, and safe across Trophē's supported browsers.

**Architecture:** Shared microphone lifecycle helpers own Web Speech and MediaRecorder resources. Food and intake select native Web Speech first and use a bounded `gpt-4o-mini-transcribe` file-upload fallback; chat uses the same recorder lifecycle without transcription. The server route is authenticated, separately rate-limited, validated, cost-capped, and recorded in `agent_runs` without retaining audio or transcript content.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19, TypeScript strict, Web Speech API, MediaRecorder/getUserMedia, OpenAI Audio Transcriptions, Drizzle/Postgres rate limits and telemetry, Vitest 4, Testing Library, Playwright browser QA.

## Global Constraints

- Native speech remains the first path; server transcription is fallback-only.
- Fallback clips stop at 30,000 ms and uploads stop at 2 MiB.
- One fallback is capped at $0.03 and one provider attempt; actual charges are recorded from returned token usage.
- Audio is processed in memory and is never stored by Trophē.
- Chat voice notes stop at 300,000 ms and remain local until Send.
- All visible microphone copy ships in EN, ES, EL, FR, DE, IT, PT, and NL.
- Every interactive microphone target is at least 44×44 CSS pixels.
- No dependency, schema migration, or client-exposed provider credential is added.
- Production verification starts at 390×844.

---

### Task 1: Shared microphone lifecycles

**Files:**
- Create: `lib/microphone/speech-recognition.ts`
- Create: `lib/microphone/recording-session.ts`
- Create: `lib/microphone/languages.ts`
- Create: `lib/microphone/transcript.ts`
- Delete: `components/food/voice-input.ts`
- Modify: `tests/components/voice-input.test.ts`
- Create: `tests/lib/microphone-recording-session.test.ts`
- Create: `tests/lib/microphone-transcript.test.ts`

**Interfaces:**
- Produces: `startSpeechRecognitionSession(options): MicrophoneSession`.
- Produces: `startAudioRecordingSession(options): MicrophoneSession` with `stop()` and `cancel()`.
- Produces: `speechLanguageTag(locale)` and `appendTranscript(existing, transcript)`.
- `MicrophoneSession` exposes a live `active` getter and idempotent `stop()`/`cancel()` methods.

- [ ] **Step 1: Write failing recorder lifecycle tests**

Use fake stream tracks and a fake recorder to prove callbacks are attached before `start()`, Stop produces one blob, Cancel produces none, all tracks stop, a late permission result is released after cancellation, recorder errors terminate once, and 30,000 ms automatically stops.

```ts
const session = startAudioRecordingSession({
  acquireStream: () => permission.promise,
  createRecorder: stream => new FakeRecorder(stream),
  maxDurationMs: 30_000,
  onRecording: states.onRecording,
  onComplete: states.onComplete,
  onError: states.onError,
});
session.cancel();
permission.resolve(stream);
await Promise.resolve();
expect(track.stop).toHaveBeenCalledOnce();
expect(states.onComplete).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the new tests and verify RED**

```bash
npx vitest run tests/lib/microphone-recording-session.test.ts tests/lib/microphone-transcript.test.ts tests/components/voice-input.test.ts
```

Expected: imports fail because the shared modules do not exist.

- [ ] **Step 3: Implement the minimal shared helpers**

Define browser-independent interfaces for streams and recorders, select `audio/webm;codecs=opus` then `audio/mp4`, attach `ondataavailable`, `onstop`, and `onerror` before `start()`, measure duration with `performance.now()`, and centralize exact-once cleanup.

```ts
export interface MicrophoneSession {
  readonly active: boolean;
  stop(): void;
  cancel(): void;
}

export function appendTranscript(existing: string, transcript: string): string {
  return [existing.trim(), transcript.replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ');
}
```

Move the current food Web Speech controller into `speech-recognition.ts`, preserve its 30-second watchdog and 1.5-second Stop fallback, and update its test import.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npx vitest run tests/lib/microphone-recording-session.test.ts tests/lib/microphone-transcript.test.ts tests/components/voice-input.test.ts
```

- [ ] **Step 5: Commit the shared core**

```bash
git add lib/microphone tests/components/voice-input.test.ts tests/lib/microphone-recording-session.test.ts tests/lib/microphone-transcript.test.ts components/food/voice-input.ts
git diff --cached --stat
git commit -m "feat(microphone): unify browser recording lifecycles"
```

### Task 2: Governed transcription fallback

**Files:**
- Create: `agents/prompts/transcribe.v1.md`
- Create: `agents/schemas/transcribe.ts`
- Create: `agents/runtime/providers/openai-transcription.ts`
- Create: `agents/transcribe/index.ts`
- Modify: `agents/router/policies.ts`
- Modify: `agents/runtime/cost.ts`
- Create: `app/api/ai/transcribe/route.ts`
- Create: `lib/microphone/transcription-client.ts`
- Create: `tests/agents/openai-transcription.test.ts`
- Create: `tests/agents/transcribe.test.ts`
- Create: `tests/api/transcribe.test.ts`
- Create: `tests/lib/microphone-transcription-client.test.ts`
- Modify: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Adds routing task `transcribe` with model `gpt-4o-mini-transcribe`, timeout `20_000`, and `maxCostUsd: 0.03`.
- Produces: `runTranscription({ file, locale, context, durationMs }, aiContext, deps?)`.
- Produces: `transcribeRecording(blob, { locale, context, durationMs }, fetchImpl?)`.
- Route returns `{ text: string, languages: string[] }` or `{ code, message }`.

- [ ] **Step 1: Write failing provider and route tests**

Assert that an injected transport receives one multipart request with `model=gpt-4o-mini-transcribe`, the extension-bearing audio file, singular `language`, an English-only anti-hallucination prompt, and no client-supplied model. Assert 401 before form parsing, 413 above 2 MiB, 415 for unsupported media, 429 after the dedicated limiter rejects, and 502 for malformed provider output.

```ts
const response = await POST(requestWithAudio({ type: 'audio/webm', size: 512 }));
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ text: 'two eggs and toast', languages: ['en'] });
```

- [ ] **Step 2: Write the failing actual-cost precedence test**

```ts
expect(estimateUsageCost('gpt-4o-mini-transcribe', {
  inputTokens: 100,
  outputTokens: 25,
})).toBe(0.00025);
```

- [ ] **Step 3: Run server tests and verify RED**

```bash
npx vitest run tests/agents/openai-transcription.test.ts tests/agents/transcribe.test.ts tests/api/transcribe.test.ts tests/lib/microphone-transcription-client.test.ts tests/agents/runtime-execute.test.ts
```

- [ ] **Step 4: Implement provider, agent, route, and client**

The provider calls only `https://api.openai.com/v1/audio/transcriptions`, invokes `assertPaidProviderAccess`, performs one fetch with the runtime AbortSignal, validates the JSON schema and billable usage, and returns exact token-priced cost under the `$0.03` hard ceiling.

The route calls `guardAiRoute()` first, then `consumeRateLimit('transcribe:' + userId, 10, 900)`, then validates the multipart file and enum fields before invoking the agent. It logs only safe error metadata.

```ts
const form = await request.formData();
const file = form.get('file');
if (!(file instanceof File) || file.size > 2 * 1024 * 1024) {
  return NextResponse.json({ code: 'invalid_audio', message: 'Recording is too large.' }, { status: 413 });
}
```

- [ ] **Step 5: Run server tests and verify GREEN**

```bash
npx vitest run tests/agents/openai-transcription.test.ts tests/agents/transcribe.test.ts tests/api/transcribe.test.ts tests/lib/microphone-transcription-client.test.ts tests/agents/runtime-execute.test.ts
```

- [ ] **Step 6: Commit the governed fallback**

```bash
git add agents app/api/ai/transcribe lib/microphone/transcription-client.ts tests/agents tests/api/transcribe.test.ts tests/lib/microphone-transcription-client.test.ts
git diff --cached --stat
git commit -m "feat(microphone): add governed transcription fallback"
```

### Task 3: Food dictation integration

**Files:**
- Modify: `components/food/QuickFoodInput.tsx`
- Modify: `tests/components/food-logging-nik-feedback.test.ts`
- Create: `tests/components/quick-food-voice.test.ts`

**Interfaces:**
- Consumes the shared speech, recorder, language, and transcription-client modules.
- Produces native-first dictation with recorded fallback and existing `handleParseText(transcript)` review behavior.

- [ ] **Step 1: Write failing food behavior tests**

Render the real input with mocked browser media dependencies. Prove unsupported Web Speech starts recorded fallback, Stop uploads once, the returned transcript becomes the parse input, permission denial exposes help, and unmount cancels pending permission without a provider call.

- [ ] **Step 2: Run food tests and verify RED**

```bash
npx vitest run tests/components/quick-food-voice.test.ts tests/components/food-logging-nik-feedback.test.ts tests/components/voice-input.test.ts
```

- [ ] **Step 3: Implement native-first food dictation**

Track `requesting`, `listening`, and `transcribing` without disabling Stop. Native interim text updates the textarea. Unsupported or synchronous startup failure begins `startAudioRecordingSession`; its completion calls `transcribeRecording`, then the existing parse review. Retry after a native network/timeout error selects fallback for that attempt.

- [ ] **Step 4: Make the interaction accessible and responsive**

Give Voice/Stop a `min-h-11 min-w-11` target, localized `aria-label`, `aria-pressed`, and `aria-live="polite"` status. Use the existing reduced-motion flag to disable infinite microphone scaling.

- [ ] **Step 5: Run food tests and verify GREEN**

```bash
npx vitest run tests/components/quick-food-voice.test.ts tests/components/food-logging-nik-feedback.test.ts tests/components/voice-input.test.ts
```

- [ ] **Step 6: Commit food integration**

```bash
git add components/food/QuickFoodInput.tsx tests/components/quick-food-voice.test.ts tests/components/food-logging-nik-feedback.test.ts
git diff --cached --stat
git commit -m "feat(food): make voice logging recover across browsers"
```

### Task 4: Intake dictation integration

**Files:**
- Modify: `app/dashboard/intake/page.tsx`
- Create: `tests/components/intake-voice.test.ts`

**Interfaces:**
- Consumes the same shared native and recorded dictation paths as food.
- Produces transcript append behavior for the active question and cancels on navigation or unmount.

- [ ] **Step 1: Write failing intake behavior tests**

Prove `"I sleep poorly"` plus `"after late training"` becomes the literal `"I sleep poorly after late training"`; Stop preserves interim native text; unsupported speech uses fallback; moving questions cancels active media; and transcribing does not erase the typed answer.

- [ ] **Step 2: Run the intake tests and verify RED**

```bash
npx vitest run tests/components/intake-voice.test.ts tests/lib/microphone-transcript.test.ts
```

- [ ] **Step 3: Replace the local Web Speech implementation**

Use refs for the current microphone session and question ID. Call `appendTranscript` inside functional `setAnswers`, expose Stop while active, and cancel before `go()`, exit, and unmount.

- [ ] **Step 4: Run the intake tests and verify GREEN**

```bash
npx vitest run tests/components/intake-voice.test.ts tests/lib/microphone-transcript.test.ts
```

- [ ] **Step 5: Commit intake integration**

```bash
git add app/dashboard/intake/page.tsx tests/components/intake-voice.test.ts
git diff --cached --stat
git commit -m "feat(intake): add reliable voice answers"
```

### Task 5: Chat voice-note hardening

**Files:**
- Modify: `components/shared/ChatThread.tsx`
- Modify: `lib/chat/media-recorder-lifecycle.ts`
- Modify: `tests/components/chat-media-lifecycle.test.ts`
- Create: `tests/components/chat-voice-note.test.ts`

**Interfaces:**
- Reuses `startAudioRecordingSession` with `maxDurationMs: 300_000` and no transcription.
- Preserves the existing `Pending` blob, local preview, upload-on-send, and retry contracts.

- [ ] **Step 1: Replace source-text assertions with failing behavior tests**

Use the real shared lifecycle to prove permission-pending cancellation, recorder-error cleanup, Stop attachment, Cancel discard, five-minute auto-attachment, and no upload before Send. The production change that each test catches is a leaked track, lost note, duplicated note, or premature storage write.

- [ ] **Step 2: Run chat tests and verify RED**

```bash
npx vitest run tests/components/chat-media-lifecycle.test.ts tests/components/chat-voice-note.test.ts tests/lib/microphone-recording-session.test.ts
```

- [ ] **Step 3: Integrate the shared recorder**

Replace direct `getUserMedia` and `MediaRecorder` callbacks with the shared session. Keep preview URL cleanup and send retry logic. Show localized errors for permission, unavailable recorder, empty audio, and recorder failure.

- [ ] **Step 4: Run chat tests and verify GREEN**

```bash
npx vitest run tests/components/chat-media-lifecycle.test.ts tests/components/chat-voice-note.test.ts tests/lib/microphone-recording-session.test.ts
```

- [ ] **Step 5: Commit chat hardening**

```bash
git add components/shared/ChatThread.tsx lib/chat/media-recorder-lifecycle.ts tests/components/chat-media-lifecycle.test.ts tests/components/chat-voice-note.test.ts
git diff --cached --stat
git commit -m "fix(chat): harden voice note recording lifecycle"
```

### Task 6: Localization, permissions policy, and release notes

**Files:**
- Modify: `lib/i18n.tsx`
- Modify: `lib/locales/de.ts`
- Modify: `lib/locales/fr.ts`
- Modify: `lib/locales/it.ts`
- Modify: `lib/locales/nl.ts`
- Modify: `lib/locales/pt.ts`
- Modify: `next.config.ts`
- Modify: `CHANGELOG.md`
- Create: `tests/config/microphone-permissions-policy.test.ts`
- Create: `tests/i18n/microphone-copy.test.ts`

**Interfaces:**
- Produces identical microphone key coverage across all eight locales.
- Produces `Permissions-Policy: microphone=(self), camera=(self)` from `nextConfig.headers()`.

- [ ] **Step 1: Write failing header and locale tests**

Import the resolved Next config, call `headers()`, and assert the global rule contains the exact Permissions-Policy value. Enumerate microphone keys and assert every overlay supplies a non-empty translation.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run tests/config/microphone-permissions-policy.test.ts tests/i18n/microphone-copy.test.ts
```

- [ ] **Step 3: Add localized copy and the response header**

Add requesting, listening, stop, cancel, transcribing, permission recovery, retry, unsupported, no-speech, recording-failed, limit-reached, play, and pause copy. Preserve all interpolation fields across locales.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
npx vitest run tests/config/microphone-permissions-policy.test.ts tests/i18n/microphone-copy.test.ts
```

- [ ] **Step 5: Commit policy and copy**

```bash
git add CHANGELOG.md next.config.ts lib/i18n.tsx lib/locales tests/config/microphone-permissions-policy.test.ts tests/i18n/microphone-copy.test.ts
git diff --cached --stat
git commit -m "feat(microphone): localize states and declare permissions"
```

### Task 7: Verification, review, deployment, and canary

**Files:**
- Verify: all changed files
- Create during release: `.gstack/deploy-reports/2026-08-12-pr<NUMBER>-deploy.md`

**Interfaces:**
- Produces a reviewed PR, green GitHub checks, a Ready Vercel production deployment, and live microphone-canary evidence.

- [ ] **Step 1: Run all local gates**

```bash
npm run typecheck
npm run lint -- --no-cache
npm test
npm run build
npm audit --omit=dev --audit-level=high
git diff --check origin/main...HEAD
git diff --cached | grep -E '(sk-ant-|sbp_|AIza|pa-)' && exit 1 || true
```

- [ ] **Step 2: Run browser QA at 390×844 and desktop**

Use mocked Web Speech, MediaRecorder, getUserMedia, and transcription responses against the local app. Verify food native success, food recorded fallback, intake append, chat Stop/Cancel, permission denial, unsupported recording, error recovery, keyboard operation, localized labels, zero leaked tracks, zero console errors, and layout without clipping.

- [ ] **Step 3: Review the full diff**

Run the repository review workflow against `origin/main...HEAD`. Resolve every Critical and Important finding, repeat focused tests for touched code, then repeat typecheck.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin codex/microphone-10x
gh pr create --base main --head codex/microphone-10x --title "feat: make microphone experiences production ready"
```

- [ ] **Step 5: Merge only after readiness and CI are green**

Run the land-and-deploy readiness gate, inspect the exact PR diff and CI checks, then merge through GitHub. Do not deploy a local working tree.

- [ ] **Step 6: Verify Vercel and production**

Wait for the `main` deployment to become Ready. Verify `https://trophe.app/api/health`, security headers, authenticated UI loading, and the three microphone surfaces at 390×844. Make at most one short live transcription canary, record its measured charge, and keep total live validation below the user's $3 daily authorization.

- [ ] **Step 7: Run extended canary and save the deploy report**

Monitor HTTP health, console errors, failed requests, latency, and the new transcription task's `agent_runs` outcome. Save the PR number, merge SHA, deploy ID, canary result, and paid-call total in the deployment report.
