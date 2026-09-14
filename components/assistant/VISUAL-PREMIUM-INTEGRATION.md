# Ask Trophē premium visual integration (DS1)

Translates the AG2 final package (`VISUAL-REFERENCE/HANDOFF.md`, `surface.css`, `wave.js`, `bridge.js`,
`icons.js`, `mark-v03.svg`) into the product's TypeScript/CSS-module surface. The reference folder is
read-only evidence and is **not** imported, copied or shipped. `demo.js` handlers were not reused.

## Surface map

| Approved element | Product implementation |
| --- | --- |
| V03 mark (32px, ≥28px only) | `AskTropheMark` at 32px in the launcher (44px hit area) and panel header. |
| Launcher | `GlobalCoach.module.css .launcher` — pill, gold mark, product theme tokens. |
| Full-height mobile surface / desktop card | `.panel` is edge-to-edge and viewport-height on mobile, a readable card on desktop. |
| Desktop history column | `panel[data-history=true]` grid: 248px sidebar + transcript column (≤760px readable), composer ≤800px. |
| Unified transcript | `.turn`, `.question` (right user bubble), `.answer` — one column, no second overlay. |
| Voice dock + 7 traces | `LiveVoiceControl` mounts `ask-trophe-wave.ts`; the dock is in-flow in the composer, never over the thread. One heading (the rail header, with its close control) sits above the dock; the dock head carries only the real status line and start control. Compact head when idle; the visual area + 44px circular controls expand (`data-expanded`) with the approved 340ms grid-row / 220ms opacity tween. Phase/status is derived from the engine snapshot on every render, independent of renderer mount; the renderer stays mounted while EITHER analyser is supported, and a missing input meter is reported as a separate honest notice instead of replacing a valid output trace. |
| Thinking effect | Separate decorative arc + ambient radial; never an audio-level display. |
| Artifact / receipt | `.foodReview` (+`.photoReview`) for estimate/review; `.receipt` only for a server-confirmed result. |
| Compact composer | `.composeRail` 22px radius, 16px textarea, 44px send, safe-area bottom padding. |
| Attachments | 56px bounded preview, `details` enlargement (`.attachmentZoom`/`.attachmentExpanded`) with a local close control + backdrop + Escape that restore focus to the thumbnail, 44px remove, upload status text unchanged. |
| Icons | `ask-trophe-icons.tsx` replaces the mixed lucide glyphs for voice/send/close/history/plus/image/edit/pause/play/output/end. `Camera` and `Sparkles` keep their existing lucide glyphs (not in the approved family). |
| Light/dark | Tokens map to the product theme pair (`--bg-primary`, `--bg-input`, `--text-primary`, `--text-secondary`, `--border-default`, `--gold-300`/`--performance-gold`), with the approved values as fallbacks. No new theme switch. |

## Voice seam (no engine change)

- Levels come from the **snapshot fields** the DS2 contract publishes (`inputLevel`/`inputLevelUpdatedAtMs`,
  `outputLevel`/`outputLevelUpdatedAtMs`, `outputMeterSupported`), not from a private subscribe seam.
  `meterSupported`/`outputMeterSupported === false` renders static, never a fake wave.
- `connectAskTropheVisual.pushLevels` treats the engine's epoch timestamp as the measurement identity:
  a fresh equal-amplitude sample still animates, an expired sample (`now - updatedAtMs > 180ms`) is
  never rendered, and a repeated/older timestamp is refused **without** being reset by a visual state
  change. A level with no measurement timestamp is not forwarded at all (a value cannot prove freshness).
- The renderer keeps the measurement's real age: `pushSample({ sampledAtMs })` maps the epoch age onto
  the animation clock, so a late delivery cannot look fresh.
- Microphone mute is presentation-independent of output: `muted` is only reached when nothing real is
  speaking, so mic mute never flattens a real output trace.
- Controls stay bound to the existing controller (`startFromGesture`, `stop`, `setMicrophoneMuted`,
  `interrupt`, `clearInterruption`, `resumePlayback`) and the timer keeps using the admitted deadline.

## Integration dependency (explicit)

`lib/voice-live/client-lifecycle.ts` in this snapshot does not yet publish `inputLevelUpdatedAtMs`,
`outputLevel`, `outputMeterSupported` or `outputLevelUpdatedAtMs`, so until DS2 lands the trace stays
flat (truthful, never fabricated). No engine file was edited here.

## Lifecycle handling

Destroyed on unmount/state rebind (`mountAskTropheWave().destroy()` removes the SVG and listeners);
samples clear at state transitions; `visibilitychange` flattens and cancels; reduced motion (OS or
override) cancels the animation frame; `stop()`/`hidden` never schedule new work. Stale session rows
keep being rejected by the owning controller before reaching the renderer.

## Verification gap

No real-browser screenshot was possible in this environment (no bundled Playwright browser; the managed
sandbox aborts system Chrome at launch). Verification is: full Vitest suites, `tsc --noEmit`, ESLint
0 errors, and an offline esbuild+jsdom harness that runs the real built modules/CSS end-to-end. Screens
for 320/390/430/desktop and short viewport, physical iOS keyboard behaviour, real audio analyser and
touch performance remain integration-owner checks.
