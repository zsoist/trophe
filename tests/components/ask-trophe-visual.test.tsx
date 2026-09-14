// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { ASK_TROPHE_WAVE_STATES, mountAskTropheWave, type AskTropheWaveSample } from '@/components/assistant/ask-trophe-wave';
import { ASK_TROPHE_METER_SAMPLE_TTL_MS, askTropheViewState, connectAskTropheVisual, type AskTropheVisualSnapshot } from '@/components/assistant/ask-trophe-visual';

afterEach(() => { vi.unstubAllGlobals(); });

const snapshot = (patch: Partial<AskTropheVisualSnapshot> = {}): AskTropheVisualSnapshot => ({ phase: 'live', ...patch });

it('maps the eight admitted live phases without inventing states', () => {
  expect(askTropheViewState({ phase: 'idle' })).toBe('idle');
  expect(askTropheViewState({ phase: 'requesting_input' })).toBe('requesting_input');
  expect(askTropheViewState({ phase: 'connecting' })).toBe('connecting');
  expect(askTropheViewState({ phase: 'waiting_started' })).toBe('waiting_started');
  expect(askTropheViewState({ phase: 'live' })).toBe('listening');
  expect(askTropheViewState({ phase: 'closing' })).toBe('closing');
  expect(askTropheViewState({ phase: 'closed' })).toBe('ended');
  expect(askTropheViewState({ phase: 'failed' })).toBe('error');
  // A recording phase belongs to the separate voice-note workflow and never becomes a live state.
  expect(ASK_TROPHE_WAVE_STATES).not.toContain('recording');
  expect(ASK_TROPHE_WAVE_STATES).not.toContain('stopping');
});

it('keeps paused precedence over real output and never silences output for a muted microphone', () => {
  expect(askTropheViewState(snapshot({ outputLevel: 0.7 }))).toBe('speaking');
  // Muting the microphone track must not suppress a genuinely speaking model.
  expect(askTropheViewState(snapshot({ microphoneMuted: true, outputLevel: 0.7 }))).toBe('speaking');
  expect(askTropheViewState(snapshot({ microphoneMuted: true }))).toBe('muted');
  // Paused/interrupted output wins over any level, and playback blocking is not an error.
  expect(askTropheViewState(snapshot({ interrupted: true, outputLevel: 0.7 }))).toBe('paused');
  expect(askTropheViewState(snapshot({ playbackBlocked: true, error: 'playback_blocked', outputLevel: 0.7 }))).toBe('paused');
});

it('drives thinking from the real busy flag and keeps errors ahead of live states', () => {
  expect(askTropheViewState(snapshot({ busy: true }))).toBe('thinking');
  // Busy is not a speaking claim: a real output level still wins.
  expect(askTropheViewState(snapshot({ busy: true, outputLevel: 0.4 }))).toBe('speaking');
  expect(askTropheViewState({ phase: 'live', error: 'permission' })).toBe('error');
  expect(askTropheViewState({ phase: 'live', error: 'playback_blocked' })).toBe('listening');
});

it('keeps a sustained equal-amplitude sound alive while the engine timestamps advance', () => {
  const pushed: Array<{ channel: string; sample: AskTropheWaveSample }> = [];
  let state: string | null = null;
  let clock = 1_000_000;
  const connection = connectAskTropheVisual({ setState: next => { state = next; }, pushSample: (channel, sample) => pushed.push({ channel, sample }), destroy: () => {} }, () => clock);
  connection.updateState({ phase: 'live' });
  // Seven DISTINCT timestamps at an identical 0.3 RMS across ~300ms: every real sample arrives,
  // because identity is the timestamp, not an amplitude delta.
  for (let index = 0; index < 7; index += 1) {
    clock += 50;
    connection.pushLevels({ phase: 'live', inputLevel: 0.3, inputLevelUpdatedAtMs: clock });
  }
  expect(pushed).toHaveLength(7);
  expect(pushed.every(entry => entry.channel === 'input' && entry.sample.rms === 0.3)).toBe(true);
  expect(pushed[6].sample.sampledAtMs).toBe(clock);
  expect(state).toBe('listening');
});

it('never re-admits a consumed or expired measurement, including across a state transition', () => {
  const pushed: Array<{ channel: string; sample: AskTropheWaveSample }> = [];
  let clock = 2_000_000;
  const connection = connectAskTropheVisual({ setState: () => {}, pushSample: (channel, sample) => pushed.push({ channel, sample }), destroy: () => {} }, () => clock);
  connection.updateState({ phase: 'live' });
  const sampleAt = clock;
  connection.pushLevels({ phase: 'live', inputLevel: 0.5, inputLevelUpdatedAtMs: sampleAt });
  expect(pushed).toHaveLength(1);
  // The same old timestamp on an unrelated snapshot (and after a visual state change) is a replay.
  connection.updateState({ phase: 'live', microphoneMuted: true });
  connection.pushLevels({ phase: 'live', microphoneMuted: true, inputLevel: 0.5, inputLevelUpdatedAtMs: sampleAt });
  expect(pushed).toHaveLength(1);
  // A new value with no real measurement timestamp is not a measurement either: it cannot prove freshness.
  connection.pushLevels({ phase: 'live', inputLevel: 0.62 });
  expect(pushed).toHaveLength(1);
  // An out-of-order older timestamp is refused.
  connection.pushLevels({ phase: 'live', inputLevel: 0.62, inputLevelUpdatedAtMs: sampleAt - 10 });
  expect(pushed).toHaveLength(1);
  // A timestamp older than the engine TTL is expired: rendered static, never revived.
  clock = sampleAt + ASK_TROPHE_METER_SAMPLE_TTL_MS + 20;
  connection.pushLevels({ phase: 'live', inputLevel: 0.9, inputLevelUpdatedAtMs: clock - ASK_TROPHE_METER_SAMPLE_TTL_MS - 10 });
  expect(pushed).toHaveLength(1);
  // A genuinely new, fresh output measurement is forwarded once.
  clock += 10;
  connection.pushLevels({ phase: 'live', outputLevel: 0.9, outputLevelUpdatedAtMs: clock });
  connection.pushLevels({ phase: 'live', outputLevel: 0.9, outputLevelUpdatedAtMs: clock });
  expect(pushed).toHaveLength(2);
  expect(pushed[1]).toEqual({ channel: 'output', sample: { rms: 0.9, sampledAtMs: clock } });
});

it('never invents a level when the engine publishes no real measurement', () => {
  const pushed: Array<{ channel: string; sample: AskTropheWaveSample }> = [];
  const connection = connectAskTropheVisual({ setState: () => {}, pushSample: (channel, sample) => pushed.push({ channel, sample }), destroy: () => {} });
  connection.updateState({ phase: 'live' });
  // No analyser, no level, and no timestamp: nothing is pushed, so the wave stays flat.
  connection.pushLevels({ phase: 'live', inputLevel: null, outputLevel: undefined });
  connection.pushLevels({ phase: 'live', outputLevel: null });
  expect(pushed).toEqual([]);
});

it('does not claim speaking without a real output analyser or with an expired output sample', () => {
  const now = 3_000_000;
  expect(askTropheViewState(snapshot({ outputMeterSupported: false, outputLevel: 0.7 }), now)).toBe('listening');
  expect(askTropheViewState(snapshot({ outputLevel: 0.7, outputLevelUpdatedAtMs: now - ASK_TROPHE_METER_SAMPLE_TTL_MS - 1 }), now)).toBe('listening');
  expect(askTropheViewState(snapshot({ outputLevel: 0.7, outputLevelUpdatedAtMs: now - 40 }), now)).toBe('speaking');
});

it('clears the renderer on a state change and draws a static line under reduced motion', () => {
  const host = document.createElement('div');
  const handle = mountAskTropheWave(host);
  handle.setState('listening');
  expect(host.dataset.state).toBe('listening');
  expect(host.querySelectorAll('path')).toHaveLength(7);
  // Amplitudes for the other channel never drive the listening trace.
  handle.pushSample('output', { rms: 0.9 });
  expect(handle.inspect().scheduled).toBe(false);
  expect(() => handle.setState('recording' as never)).toThrow(TypeError);
  handle.destroy();
  expect(host.querySelectorAll('svg')).toHaveLength(0);
  expect(handle.inspect()).toMatchObject({ disposed: true, scheduled: false });
});

it('preserves the real measurement age instead of the renderer arrival time', () => {
  const raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  const handle = mountAskTropheWave(host);
  handle.setState('listening');
  // A sample measured 400ms ago (beyond the 180ms TTL) must not start a trace at push time.
  handle.pushSample('input', { rms: 0.8, sampledAtMs: Date.now() - 400 });
  expect(raf).not.toHaveBeenCalled();
  expect(handle.inspect().scheduled).toBe(false);
  // A genuinely fresh measurement still animates.
  handle.pushSample('input', { rms: 0.8, sampledAtMs: Date.now() });
  expect(raf).toHaveBeenCalled();
  handle.destroy();
});

it('schedules no animation frame under reduced motion and stops on destroy', () => {
  const raf = vi.fn(() => 1);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const host = document.createElement('div');
  const handle = mountAskTropheWave(host);
  handle.setState('listening');
  handle.pushSample('input', { rms: 0.8 });
  expect(raf).not.toHaveBeenCalled();
  expect(handle.inspect().reducedMotion).toBe(true);
  handle.destroy();
  expect(handle.inspect()).toMatchObject({ disposed: true, scheduled: false });
});
