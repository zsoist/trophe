/**
 * Approved Ask Trophē voice renderer (translated from the AG2 final package `wave.js`).
 *
 * Seven continuous SVG traces replace the previous bar rail. This module owns *drawing only*: no
 * microphone access, no playback, no network and no business state. It is fed real measurement
 * events by the owner (`LiveVoiceControl`) and never invents a level.
 *
 * Truthfulness rules carried over from the approved source:
 *  - Input amplitude is used only in `listening`; output amplitude only in `speaking`.
 *  - A measurement expires after 180ms, so a stale level decays to a flat line instead of looping.
 *  - Geometry updates at most every 32ms and never runs a perpetual animation without samples.
 *  - Reduced motion (OS preference or explicit override) cancels the loop and draws a static line.
 */

export const ASK_TROPHE_WAVE_STATES = [
  'idle', 'requesting_input', 'waiting_started', 'closing', 'connecting',
  'listening', 'speaking', 'thinking', 'muted', 'paused', 'error', 'ended',
] as const;

export type AskTropheWaveState = (typeof ASK_TROPHE_WAVE_STATES)[number];

export type AskTropheWaveChannel = 'input' | 'output';

/** Linear normalized RMS 0–1 plus optional normalized bands. Display values, not a loudness meter. */
export interface AskTropheWaveSample {
  rms: number;
  bands?: number[];
  /**
   * Epoch ms of the REAL engine measurement backing `rms` (DS2 `inputLevelUpdatedAtMs` /
   * `outputLevelUpdatedAtMs`). When present the renderer keeps the measurement's true age by
   * mapping it into its own animation clock, so a delayed delivery cannot look fresh. Absent means
   * the sample was pushed at the moment it was measured.
   */
  sampledAtMs?: number;
}

export interface AskTropheWaveHandle {
  setState(next: AskTropheWaveState): void;
  pushSample(channel: AskTropheWaveChannel, sample: AskTropheWaveSample): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
  inspect(): { state: AskTropheWaveState; reducedMotion: boolean; scheduled: boolean; disposed: boolean };
}

const LANES = 7;
const SAMPLES_PER_LANE = 81;
const SAMPLE_HORIZONTAL_STEP = 5;
/** Mirrors DS2's exported `METER_SAMPLE_TTL_MS`; a measurement older than this renders static. */
export const ASK_TROPHE_MEASUREMENT_TTL_MS = 180;
const MEASUREMENT_TTL_MS = ASK_TROPHE_MEASUREMENT_TTL_MS;
const GEOMETRY_INTERVAL_MS = 32;
const DISPLAY_GAIN = 4;
const VIEW_BOX = '0 0 400 96';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Mounts the trace renderer into `host` and returns the presentation handle. The host element is
 * owned by the caller; `destroy()` removes only what this renderer added.
 */
export function mountAskTropheWave(host: HTMLElement, options: { reducedMotion?: boolean } = {}): AskTropheWaveHandle {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('at-wave');
  const paths: SVGPathElement[] = [];
  for (let lane = 0; lane < LANES; lane += 1) {
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', lane === 3 ? '1.6' : '.8');
    path.setAttribute('opacity', String(lane === 3 ? 0.95 : 0.18 + lane * 0.07));
    svg.append(path);
    paths.push(path);
  }
  host.append(svg);

  // jsdom and non-browser environments may not implement matchMedia; the renderer then falls back
  // to the explicit override only instead of throwing.
  const motionQuery = typeof win?.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const now = () => (win?.performance?.now ? win.performance.now() : Date.now());
  /** Coherent-clock bridge: engine timestamps are epoch ms, animation frames are monotonic. */
  const epochNow = () => Date.now();

  let state: AskTropheWaveState = 'idle';
  let disposed = false;
  let frame = 0;
  let lastGeometryAt = 0;
  let level = 0;
  let manualReduced = options.reducedMotion === true;
  let samples: { input: { rms: number; bands: number[]; at: number } | null; output: { rms: number; bands: number[]; at: number } | null } = { input: null, output: null };

  const reduced = () => manualReduced || motionQuery?.matches === true;
  const audioActive = () => state === 'listening' || state === 'speaking';
  const draw = (at: number, sample: { rms: number; bands: number[] } | null) => {
    const audible = audioActive() && !reduced() && sample !== null;
    const target = audible && sample ? Math.min(1, Math.max(0, sample.rms) * DISPLAY_GAIN) : 0;
    level = audible ? level + (target - level) * (target > level ? 0.5 : 0.22) : 0;
    host.dataset.signal = audible && target > 0.01 ? 'present' : 'absent';
    paths.forEach((path, lane) => {
      const points: string[] = [];
      for (let index = 0; index <= SAMPLES_PER_LANE - 1; index += 1) {
        const u = index / (SAMPLES_PER_LANE - 1);
        const x = index * SAMPLE_HORIZONTAL_STEP;
        const envelope = Math.pow(Math.sin(Math.PI * u), 1.8);
        const bands = sample?.bands ?? [];
        const band = bands.length
          ? bands[Math.min(bands.length - 1, Math.floor(u * bands.length))] ?? 0.5
          : 0.5;
        const phase = at / (state === 'speaking' ? 670 : 520);
        const carrier = Math.sin(u * Math.PI * 4.2 - phase + lane * 0.34) * 0.72
          + Math.sin(u * Math.PI * 7.4 + phase * 0.55) * 0.28;
        const y = 48 + envelope * level * (22 + lane * 2) * (0.7 + band * 0.3) * carrier;
        points.push(`${index ? 'L' : 'M'}${x} ${y.toFixed(2)}`);
      }
      path.setAttribute('d', points.join(' '));
    });
  };
  const stop = () => { if (frame && win) win.cancelAnimationFrame(frame); frame = 0; };
  /** The freshest sample for the channel this state actually consumes, or null once it expires. */
  const freshSample = (at: number) => {
    const sample = state === 'listening' ? samples.input : samples.output;
    if (!sample || at - sample.at >= MEASUREMENT_TTL_MS) return null;
    return sample;
  };
  const tick = (at: number) => {
    frame = 0;
    if (disposed || doc.hidden || reduced() || !audioActive()) return;
    const sample = freshSample(at);
    if (!sample) { draw(at, null); return; }
    if (at - lastGeometryAt >= GEOMETRY_INTERVAL_MS) { draw(at, sample); lastGeometryAt = at; }
    if (win) frame = win.requestAnimationFrame(tick);
  };
  const wake = () => {
    if (disposed || doc.hidden || reduced() || !audioActive() || frame || !win) return;
    if (!freshSample(now())) return;
    frame = win.requestAnimationFrame(tick);
  };
  const reconcile = () => { stop(); draw(now(), null); wake(); };
  const onMotionChange = () => reconcile();
  const onVisibilityChange = () => reconcile();

  motionQuery?.addEventListener('change', onMotionChange);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  host.dataset.state = state;
  draw(0, null);

  return {
    setState(next: AskTropheWaveState) {
      if (!ASK_TROPHE_WAVE_STATES.includes(next)) throw new TypeError(`Unknown voice visual state: ${next}`);
      if (disposed) return;
      // Samples belong to the state that produced them; a transition never replays an old level.
      if (state !== next) samples = { input: null, output: null };
      state = next;
      host.dataset.state = state;
      reconcile();
    },
    pushSample(channel: AskTropheWaveChannel, sample: AskTropheWaveSample) {
      if (disposed || !isFiniteNumber(sample?.rms)) return;
      const bands = Array.isArray(sample.bands)
        ? sample.bands.slice(0, 32).map(value => (isFiniteNumber(value) ? Math.max(0, Math.min(1, value)) : 0))
        : [];
      // Preserve the real measurement age across the epoch->monotonic clock change instead of
      // stamping arrival time, so a late/duplicated sample decays immediately rather than looping.
      const age = isFiniteNumber(sample.sampledAtMs) ? Math.max(0, epochNow() - sample.sampledAtMs) : 0;
      samples[channel] = { rms: Math.max(0, Math.min(1, sample.rms)), bands, at: now() - age };
      wake();
    },
    setReducedMotion(value: boolean) {
      manualReduced = value === true;
      reconcile();
    },
    destroy() {
      disposed = true;
      stop();
      motionQuery?.removeEventListener('change', onMotionChange);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      svg.remove();
      samples = { input: null, output: null };
    },
    inspect() {
      return { state, reducedMotion: reduced(), scheduled: frame !== 0, disposed };
    },
  };
}
