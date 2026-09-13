/**
 * Pure presentation mapping for the live Ask Trophē voice surface
 * (translated from the AG2 final package `bridge.js`).
 *
 * It reads the existing `LiveLifecycleState` presentation fields and produces (a) one visual state
 * for the renderer and (b) *fresh* level samples only. It never mutates the engine, never infers a
 * state from transcript timing, and never re-submits the previous level on an unrelated snapshot.
 *
 * Measurement freshness comes from the engine's own epoch timestamps (`inputLevelUpdatedAtMs` /
 * `outputLevelUpdatedAtMs`, DS2 contract). An amplitude difference is NOT identity: a sustained
 * equal-amplitude sound keeps animating because its timestamps keep advancing, while an unchanged
 * old timestamp is refused even after a visual state change.
 */
import type { AskTropheWaveChannel, AskTropheWaveSample, AskTropheWaveState } from './ask-trophe-wave';

/** The subset of the inspected live snapshot that the visual layer consumes. */
export interface AskTropheVisualSnapshot {
  phase: string;
  error?: string | null;
  busy?: boolean;
  interrupted?: boolean;
  playbackBlocked?: boolean;
  /** True while the microphone TRACK is muted; output keeps playing. Never an output pause. */
  microphoneMuted?: boolean;
  /** True only when a real microphone analyser is attached. `false` means render no input wave. */
  meterSupported?: boolean;
  /** Latest real input amplitude (linear RMS 0–1), when a real analyser published one. */
  inputLevel?: number | null;
  /** Epoch ms of the real sample backing `inputLevel` (DS2 `inputLevelUpdatedAtMs`). */
  inputLevelUpdatedAtMs?: number | null;
  /** True only when a real remote-output analyser is attached (DS2 `outputMeterSupported`). */
  outputMeterSupported?: boolean;
  /** Optional real output amplitude. Absent or `null` keeps the output wave flat. */
  outputLevel?: number | null;
  /** Epoch ms of the real sample backing `outputLevel` (DS2 `outputLevelUpdatedAtMs`). */
  outputLevelUpdatedAtMs?: number | null;
}

export interface AskTropheVisual {
  setState(state: AskTropheWaveState): void;
  pushSample(channel: AskTropheWaveChannel, sample: AskTropheWaveSample): void;
  destroy(): void;
}

const readLevel = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;

const readSampledAt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Mirrors DS2's exported `METER_SAMPLE_TTL_MS` (lib/voice-live/client-types.ts). A level whose real
 * sample is older than this is stale: the engine nulls it, and this consumer refuses it too.
 */
export const ASK_TROPHE_METER_SAMPLE_TTL_MS = 180;

/** A measurement is fresh only while its own timestamp is real and inside the engine TTL. */
const isFresh = (sampledAtMs: number, nowMs: number): boolean =>
  nowMs - sampledAtMs <= ASK_TROPHE_METER_SAMPLE_TTL_MS;

/**
 * Bridge precedence, in order: failure, closed, idle, connect phases, then — only inside `live` —
 * paused/interrupted, real output, thinking (busy), muted, listening. Muting the microphone never
 * silences a real output trace, and `thinking` is driven by `busy`, not by a transcription time.
 */
export function askTropheViewState(snapshot: AskTropheVisualSnapshot, nowMs: number = Date.now()): AskTropheWaveState {
  if (snapshot.phase === 'failed' || (snapshot.error && snapshot.error !== 'playback_blocked')) return 'error';
  if (snapshot.phase === 'closed') return 'ended';
  if (snapshot.phase === 'idle') return 'idle';
  if (snapshot.phase === 'requesting_input' || snapshot.phase === 'waiting_started' || snapshot.phase === 'closing') return snapshot.phase;
  if (snapshot.phase !== 'live') return 'connecting';
  if (snapshot.interrupted || snapshot.playbackBlocked) return 'paused';
  // Speaking needs a real remote-output analyser; without one the truthful state is busy/muted/listening.
  if (snapshot.outputMeterSupported !== false) {
    const output = readLevel(snapshot.outputLevel);
    const outputAt = readSampledAt(snapshot.outputLevelUpdatedAtMs);
    if (output !== null && output > 0.02 && (outputAt === null || isFresh(outputAt, nowMs))) return 'speaking';
  }
  if (snapshot.busy) return 'thinking';
  if (snapshot.microphoneMuted) return 'muted';
  return 'listening';
}

/**
 * Connects a renderer to snapshot-driven presentation. `updateState` is idempotent per state and
 * `pushLevels` forwards a level only when the engine published a NEW real measurement. Measurement
 * identity is the engine's own epoch timestamp, never an amplitude difference: a fresh
 * equal-amplitude sample still animates, and a repeated old timestamp never rejuvenates — including
 * across a visual state change.
 */
export function connectAskTropheVisual(visual: AskTropheVisual, clock: () => number = () => Date.now()) {
  let previousState: AskTropheWaveState | null = null;
  // Last timestamp consumed per channel. Deliberately NOT reset on a state change: a cached sample
  // must not be re-admitted just because the visual state moved on.
  const consumedAt: Record<AskTropheWaveChannel, number | null> = { input: null, output: null };
  return {
    updateState(snapshot: AskTropheVisualSnapshot): AskTropheWaveState {
      const next = askTropheViewState(snapshot, clock());
      if (next !== previousState) {
        visual.setState(next);
        previousState = next;
      }
      return next;
    },
    /**
     * Call on every snapshot. Only a real, fresh, not-yet-consumed measurement reaches the renderer;
     * a level with no measurement timestamp is not forwarded, because a value alone cannot prove
     * freshness and a cached value must never be revived by an unrelated snapshot.
     */
    pushLevels(snapshot: AskTropheVisualSnapshot): void {
      const nowMs = clock();
      const consume = (channel: AskTropheWaveChannel, levelValue: unknown, atValue: unknown): void => {
        const level = readLevel(levelValue);
        const sampledAtMs = readSampledAt(atValue);
        if (level === null || sampledAtMs === null) return;
        const consumed = consumedAt[channel];
        if (consumed !== null && sampledAtMs <= consumed) return; // replay or out-of-order delivery
        consumedAt[channel] = sampledAtMs;
        if (!isFresh(sampledAtMs, nowMs)) return; // expired sample: never rendered, never revived
        visual.pushSample(channel, { rms: level, sampledAtMs });
      };
      consume('input', snapshot.inputLevel, snapshot.inputLevelUpdatedAtMs);
      consume('output', snapshot.outputLevel, snapshot.outputLevelUpdatedAtMs);
    },
    dispose(): void {
      visual.destroy();
    },
  };
}
