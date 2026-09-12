# Voice-Live real level contract (input + output) — 2026-09-12

Owner: DS2 (`lib/voice-live`). Consumers: AG2 waveform, DS1 rail visuals.
No provider/auth/budget/network change; this is the client contract only.

## Fields on `VoiceLiveController.snapshot()` (`LiveLifecycleState`)

| field | type | meaning |
| --- | --- | --- |
| `meterSupported` | `boolean` | a real analyser is attached to the **microphone** stream |
| `inputLevel` | `number \| null` | measured mic RMS, 0..1; `0` while mic-muted; `null` when unsupported/stale |
| `inputLevelUpdatedAtMs` | `number \| null` | epoch ms of the last real input sample backing `inputLevel` |
| `outputMeterSupported` | `boolean` | a real analyser is attached to the **remote output** stream |
| `outputLevel` | `number \| null` | measured remote RMS 0..1 **while output is actually playing**; `null` otherwise |
| `outputLevelUpdatedAtMs` | `number \| null` | epoch ms of the last real output sample backing `outputLevel` |

`METER_SAMPLE_TTL_MS = 180` (exported from `client-types.ts`).
`METER_FRESHNESS_NOTIFY_MS = 90` (exported from `client-types.ts`).

## Rules the engine guarantees

1. **Measured only.** `inputLevel`/`outputLevel` come from a real `AnalyserNode` on a real
   `MediaStream`. No oscillator, no synthetic/random amplitude. If no analyser can be created
   the level is `null` and the `*Supported` flag is `false` (render static, never a fake wave).
2. **Output is gated on real playback.** `outputLevel` is non-null only while the playback
   owner reports status `playing` from `LivePlaybackEvent`. A paused/interrupted/blocked
   output — and any sample arriving before `play()` resolves — reads `null`. A `play()` that
   resolves after an interrupt never flips the status back to playing.
   A **replacement** stream never inherits the previous stream's `playing`: the playback owner
   invalidates audibility before announcing the new binding, so samples from the replacing
   stream read `null` until that stream's own `play()` resolves. A late success or failure of a
   replaced `play()` is inert (it can neither claim `playing` nor raise a spurious block).
3. **Remote media only.** The output analyser taps the remote WebRTC track the playback owner
   bound. It is never connected to the audio destination, so there is no second audible path
   and no echo/feedback loop.
4. **Freshness / no stale replay.** The engine owns a 180 ms watchdog per channel. If no real
   sample arrives within the TTL (hidden tab, ended track), the level and its timestamp go
   `null`. A consumer that also checks `now - updatedAtMs <= METER_SAMPLE_TTL_MS` is safe; the
   engine already nulls stale values so a naive consumer cannot replay an old level as fresh.
   While real samples keep arriving at an **identical** amplitude the timestamps still advance,
   and `subscribe()` is notified at a bounded rate (`METER_FRESHNESS_NOTIFY_MS`): a held
   `snapshot()` stays fresh during sustained identical levels, expires once real samples stop,
   and a 60 fps analyser does not become 60 full React notifications per second. The timestamp
   is always the real `Date.now()` of a real sample — never fabricated.
5. **Session isolation.** Callbacks from a detached/replaced analyser or an old session are
   dropped (generation guard). A remote-track replacement detaches the previous analyser.
6. **Cleanup.** `stop`, `dispose`, failure, session close and mic teardown all release both
   analysers (AudioContext + RAF) and clear the levels before/while notifying.
7. **Mute ≠ pause.** Mic mute toggles `MediaStreamTrack.enabled` and reports `inputLevel = 0`;
   it never touches output and never stops the track. `interrupt()` pauses/mutes output only;
   it never mutes or stops the microphone. Neither is triggered by transcript captions.

## Consumer guidance

- "Speaking": `live && outputLevel !== null && outputLevel > 0.02`.
  Do **not** infer speaking from transcript deltas — transcript arrival is not playback.
  Do **NOT** include `!microphoneMuted`: `microphoneMuted` gates ONLY the input, and remote
  output (plus its metering) keeps running while the user mutes the microphone. Muting the mic
  must never hide assistant speech.
- Input wave: `muted ? 0 : inputLevel`, live only while `meterSupported`.
- If a sample's age is `> METER_SAMPLE_TTL_MS`, render static — do not extrapolate.
- Read the level through `subscribe()` + `snapshot()` (or poll `snapshot()`); do not memoize one
  snapshot forever. Freshness-only updates are delivered as bounded notifications, so a value
  captured once will age past the TTL even while real samples keep flowing.

## Physical holdouts (not provable offline)

- Real acoustic barge-in while the microphone stays live: confirm whether GPT-Live natively
  stops model audio on user speech, and whether residual browser buffering delays it. The
  offline suite only proves the local player obeys `stopOutput`/`resumeOutput` and that the
  meter follows real playback status.
- True output RMS on device (echo cancellation / speaker loudness) — must be eyeballed against
  the real remote track; the offline tests use injected analyser seams.
- Autoplay/gesture resume on iOS Safari where `AudioContext.resume()` and `audio.play()` are
  both gesture-gated.
