/**
 * Causal regressions for real OUTPUT metering: the speaking level must come from the remote
 * WebRTC media (injected output meter) and be gated by actual playback status, never inferred
 * from transcript timing. Covers track replacement, hidden-document sample staleness,
 * interrupt/resume, dispose and the "no permanent mute on every input caption" contract.
 *
 * All seams are injected doubles: no provider, auth, budget, network, WebAudio or DOM call.
 */
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import { createBrowserLivePlayback } from '../../../lib/voice-live/browser-playback';
import { METER_SAMPLE_TTL_MS } from '../../../lib/voice-live/client-types';
import type {
  LiveInputMeterPort,
  LiveMediaStream,
  LiveOutputMeterPort,
  LivePlaybackEvent,
  LiveSessionHandle,
} from '../../../lib/voice-live/client-types';

const request = { model: 'gpt-live', delegation: { type: 'client' as const } };

class FakeChannel {
  label = 'oai-events';
  closed = false;
  private listeners = new Set<(event: { data: unknown }) => void>();
  send(): void {}
  close(): void {
    this.closed = true;
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  emit(data: unknown): void {
    for (const listener of [...this.listeners]) listener({ data });
  }
}

class FakePeer {
  connectionState = 'new';
  closed = false;
  private stateListeners = new Set<() => void>();
  constructor(private readonly channel: FakeChannel) {}
  createDataChannel(): FakeChannel {
    return this.channel;
  }
  async createOffer(): Promise<{ sdp: string }> {
    return { sdp: 'offer' };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(): Promise<void> {}
  addTrack(): void {}
  addEventListener(_type: string, listener: () => void): void {
    this.stateListeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void): void {
    this.stateListeners.delete(listener);
  }
  close(): void {
    this.closed = true;
  }
}

type Track = { kind: string; enabled: boolean; stopped: boolean; stop(): void };

/** Records real playback status/stream events and lets a test drive them like the browser owner. */
class FakePlayback {
  stopped = 0;
  resumed = 0;
  private listeners = new Set<(event: LivePlaybackEvent) => void>();
  observe(listener: (event: LivePlaybackEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'status', status: 'detached' });
    return () => this.listeners.delete(listener);
  }
  stopOutput(): void {
    this.stopped += 1;
    this.emit({ type: 'status', status: 'paused' });
  }
  resumeOutput(): void {
    this.resumed += 1;
    this.emit({ type: 'status', status: 'playing' });
  }
  attach(stream: LiveMediaStream): void {
    this.emit({ type: 'stream', stream });
  }
  detach(): void {
    this.emit({ type: 'stream', stream: null });
  }
  status(status: 'detached' | 'playing' | 'paused' | 'blocked'): void {
    this.emit({ type: 'status', status });
  }
  private emit(event: LivePlaybackEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

interface FakeMeter {
  port: LiveInputMeterPort | LiveOutputMeterPort;
  samples: Array<(level: number | null) => void>;
  detached: number;
}

function fakeMeter(): FakeMeter {
  const meter: FakeMeter = { samples: [], detached: 0, port: { attach: () => null } };
  meter.port = {
    attach(_stream, onLevel) {
      meter.samples.push(onLevel);
      return () => {
        meter.detached += 1;
      };
    },
  };
  return meter;
}

function fakeTimers() {
  const timers: Array<{ cb: () => void; cleared: boolean }> = [];
  return {
    timers,
    setTimeout: (cb: () => void, ms: number) => {
      void ms;
      const handle = { cb, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout: (handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
}

function harness(options: { handle?: LiveSessionHandle } = {}) {
  const channel = new FakeChannel();
  const peer = new FakePeer(channel);
  const tracks: Track[] = [{ kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } }];
  const micStream: LiveMediaStream = { getTracks: () => tracks };
  const remoteStream: LiveMediaStream = { getTracks: () => [{ kind: 'audio', stop() {} }] };
  const adapter = {
    createSession: async (): Promise<LiveSessionHandle> => options.handle ?? { sessionId: 'sess-1', answerSdp: 'answer-sdp' },
    closeSession: async () => {},
    createPeerConnection: () => peer,
    acquireInput: async () => micStream,
  };
  return { channel, peer, tracks, micStream, remoteStream, adapter };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

async function live(deps: Record<string, unknown>, options: Parameters<typeof harness>[0] = {}) {
  const h = harness(options);
  const controller = new VoiceLiveController({ adapter: h.adapter, request, ...deps });
  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');
  return { h, controller };
}

test('output level is measured only from the remote stream while playback is actually playing', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });

  // No remote track yet: nothing is supported and no level is fabricated.
  assert.equal(controller.snapshot().outputMeterSupported, false);
  assert.equal(controller.snapshot().outputLevel, null);

  playback.attach(h.remoteStream);
  assert.equal(controller.snapshot().outputMeterSupported, true, 'the remote track is metered');
  assert.equal(controller.snapshot().outputLevel, null, 'a bound stream is not yet "speaking"');

  // Samples before the audio really plays must not be reported as audible output.
  meter.samples[0](0.7);
  assert.equal(controller.snapshot().outputLevel, null);

  playback.status('playing');
  meter.samples[0](0.42);
  assert.equal(controller.snapshot().outputLevel, 0.42);
  assert.equal(typeof controller.snapshot().outputLevelUpdatedAtMs, 'number', 'freshness timestamp is published');

  // Silencing the output drops the level immediately — it is never replayed as "speaking".
  playback.status('paused');
  assert.equal(controller.snapshot().outputLevel, null);
  assert.equal(controller.snapshot().outputLevelUpdatedAtMs, null);

  playback.status('playing');
  meter.samples[0](0.9);
  assert.equal(controller.snapshot().outputLevel, 0.9, 'recovery re-enables the real level');
});

test('an unavailable output meter is unsupported, not faked', async () => {
  const playback = new FakePlayback();
  const { h, controller } = await live({ playback, outputMeter: { attach: () => null } as LiveOutputMeterPort });
  playback.attach(h.remoteStream);
  playback.status('playing');
  assert.equal(controller.snapshot().outputMeterSupported, false);
  assert.equal(controller.snapshot().outputLevel, null);
});

test('interrupt stops output metering without touching the microphone or the session', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });
  playback.attach(h.remoteStream);
  playback.status('playing');
  meter.samples[0](0.5);
  assert.equal(controller.snapshot().outputLevel, 0.5);

  controller.interrupt();
  assert.equal(playback.stopped, 1);
  assert.equal(controller.snapshot().outputLevel, null, 'interrupted output is not "speaking"');
  assert.equal(h.tracks[0].enabled, true, 'the microphone track stays live (native duplex)');
  assert.equal(h.tracks[0].stopped, false);
  assert.equal(controller.snapshot().phase, 'live');

  controller.clearInterruption();
  assert.equal(playback.resumed, 1);
  meter.samples[0](0.6);
  assert.equal(controller.snapshot().outputLevel, 0.6, 'resume recovers real output measurement');
});

test('a stale sample expires after the TTL instead of replaying as fresh (hidden document)', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const timers = fakeTimers();
  const { h, controller } = await live({ playback, outputMeter: meter.port, timers });
  playback.attach(h.remoteStream);
  playback.status('playing');
  meter.samples[0](0.8);
  assert.equal(controller.snapshot().outputLevel, 0.8);

  const pending = timers.timers.find(timer => !timer.cleared);
  assert.ok(pending, 'a freshness watchdog is armed for the real sample');
  pending.cb();
  assert.equal(controller.snapshot().outputLevel, null, `no sample for ${METER_SAMPLE_TTL_MS}ms => stale, not fresh`);
  assert.equal(controller.snapshot().outputLevelUpdatedAtMs, null);
});

test('callbacks from a replaced remote stream are ignored (track replacement)', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });
  playback.attach(h.remoteStream);
  playback.status('playing');
  const first = meter.samples[0];
  first(0.3);
  assert.equal(controller.snapshot().outputLevel, 0.3);

  // A replacement track arrives: a NEW analyser is attached and the old one is released.
  const replacement: LiveMediaStream = { getTracks: () => [{ kind: 'audio', stop() {} }] };
  playback.attach(replacement);
  assert.equal(meter.detached, 1, 'the previous analyser is detached on replacement');
  const second = meter.samples[1];
  assert.notEqual(second, first);
  first(0.99);
  assert.notEqual(controller.snapshot().outputLevel, 0.99, 'an old-session callback can never publish');
  second(0.55);
  assert.equal(controller.snapshot().outputLevel, 0.55);
});

test('dispose releases the output analyser and ignores later samples', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });
  playback.attach(h.remoteStream);
  playback.status('playing');
  const onLevel = meter.samples[0];
  onLevel(0.4);
  controller.dispose('unmount');
  assert.equal(meter.detached, 1);
  assert.equal(controller.snapshot().outputLevel, null);
  onLevel(0.9);
  assert.equal(controller.snapshot().outputLevel, null, 'no callback from the old session publishes');
});

test('incoming input captions never mute output or the microphone (no permanent mute)', async () => {
  const playback = new FakePlayback();
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });
  playback.attach(h.remoteStream);
  playback.status('playing');
  meter.samples[0](0.5);

  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'what is ', start_ms: 0, end_ms: 100, event_id: 'i1' });
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'for lunch', start_ms: 100, end_ms: 300, event_id: 'i2' });
  assert.equal(playback.stopped, 0, 'a caption group must never stop output');
  assert.equal(h.tracks[0].enabled, true, 'a caption group must never mute the microphone');
  assert.equal(controller.snapshot().outputLevel, 0.5, 'assistant output keeps playing while the user speaks');
  assert.equal(controller.snapshot().transcript.length, 1, 'real fragments stay intact');
  assert.equal(controller.snapshot().transcript[0].text, 'what is for lunch');
});

test('input metering stays gated to the real analyser and its own freshness TTL', async () => {
  const meter = fakeMeter();
  const timers = fakeTimers();
  const { controller } = await live({ inputMeter: meter.port, timers });
  assert.equal(controller.snapshot().meterSupported, true);
  meter.samples[0](0.3);
  assert.equal(controller.snapshot().inputLevel, 0.3);
  assert.equal(typeof controller.snapshot().inputLevelUpdatedAtMs, 'number');
  const pending = timers.timers.find(timer => !timer.cleared);
  assert.ok(pending);
  pending.cb();
  assert.equal(controller.snapshot().inputLevel, null, 'a hidden/stopped meter must not replay its last sample');
});

test('mute reports 0 without a stale measured level and unmute restores the real sample', async () => {
  const meter = fakeMeter();
  const { h, controller } = await live({ inputMeter: meter.port });
  meter.samples[0](0.3);
  controller.setMicrophoneMuted(true);
  assert.equal(controller.snapshot().inputLevel, 0);
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'still talking', start_ms: 0, end_ms: 100, event_id: 'm1' });
  assert.equal(controller.snapshot().inputLevel, 0, 'muted input never reports a measured level');
  controller.setMicrophoneMuted(false);
  assert.equal(controller.snapshot().inputLevel, 0.3, 'unmute restores the last real measured level');
});

test('mic mute while the assistant speaks keeps output metered and the track live', async () => {
  const playback = new FakePlayback();
  const input = fakeMeter();
  const output = fakeMeter();
  const { h, controller } = await live({ playback, inputMeter: input.port, outputMeter: output.port });
  playback.attach(h.remoteStream);
  playback.status('playing');
  input.samples[0](0.1);
  output.samples[0](0.5);
  assert.equal(controller.snapshot().outputLevel, 0.5);

  controller.setMicrophoneMuted(true);
  assert.equal(controller.snapshot().inputLevel, 0, 'muted mic reports no level');
  assert.equal(controller.snapshot().outputLevel, 0.5, 'muting the mic never stops output');
  assert.equal(h.tracks[0].enabled, false, 'mute only toggles track.enabled');
  assert.equal(h.tracks[0].stopped, false);
  output.samples[0](0.8);
  assert.equal(controller.snapshot().outputLevel, 0.8, 'output keeps measuring while the mic is muted');
});

/** Audio element whose `play()` promises the test settles manually, per call (browser owner). */
function controllableAudio() {
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const audio = {
    srcObject: null as MediaStream | null,
    muted: false,
    play: () => new Promise<void>((resolve, reject) => { pending.push({ resolve, reject }); }),
    pause() {},
  };
  return { audio, pending };
}

test('integrated: a replaced remote stream is not metered as speaking before its own play() succeeds', async () => {
  const { audio, pending } = controllableAudio();
  const blocked = vi.fn();
  const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, blocked);
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });

  playback.attach(h.remoteStream as unknown as MediaStream);
  const firstMeter = meter.samples[0];
  firstMeter(0.7);
  assert.equal(controller.snapshot().outputLevel, null, 'samples before play() resolves are not audible');
  pending[0].resolve();
  await flush();
  firstMeter(0.4);
  assert.equal(controller.snapshot().outputLevel, 0.4, 'confirmed playback meters the remote stream');

  // Replacement arrives: the old level must be dropped BEFORE the new stream's play() resolves.
  const replacement: LiveMediaStream = { getTracks: () => [{ kind: 'audio', stop() {} }] };
  playback.attach(replacement as unknown as MediaStream);
  assert.equal(meter.detached, 1, 'the previous analyser is detached on replacement');
  assert.equal(controller.snapshot().outputLevel, null, 'the replacing stream is not audible yet');
  const secondMeter = meter.samples[1];
  secondMeter(0.9);
  assert.equal(controller.snapshot().outputLevel, null, 'new samples stay nonaudible until current play succeeds');
  firstMeter(0.99);
  assert.equal(controller.snapshot().outputLevel, null, 'the replaced analyser can never publish again');

  // A refused replacement never reads as speaking, and reports the autoplay block.
  pending[1].reject(new Error('NotAllowedError'));
  await flush();
  assert.equal(blocked.mock.calls.length, 1, 'the refused replacement surfaces the autoplay block');
  secondMeter(0.8);
  assert.equal(controller.snapshot().outputLevel, null, 'a blocked replacement never reports speaking');

  // An explicit gesture resume confirms the CURRENT stream and metering recovers.
  playback.resumeOutput();
  pending[2].resolve();
  await flush();
  secondMeter(0.6);
  assert.equal(controller.snapshot().outputLevel, 0.6, 'resume re-enables real output metering');
});

test('integrated: a late old play() resolution cannot restore the replaced stream', async () => {
  const { audio, pending } = controllableAudio();
  const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, vi.fn());
  const meter = fakeMeter();
  const { h, controller } = await live({ playback, outputMeter: meter.port });

  playback.attach(h.remoteStream as unknown as MediaStream);
  playback.attach({ getTracks: () => [{ kind: 'audio', stop() {} }] } as unknown as MediaStream);
  const secondMeter = meter.samples[1];
  secondMeter(0.9);
  assert.equal(controller.snapshot().outputLevel, null);

  pending[0].resolve();
  await flush();
  assert.equal(controller.snapshot().outputLevel, null, 'the replaced play() success is inert');

  pending[1].resolve();
  await flush();
  secondMeter(0.6);
  assert.equal(controller.snapshot().outputLevel, 0.6, 'only the current play() enables metering');
});

test('a subscribed consumer stays fresh during sustained identical levels and expires when samples stop', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(1000);
    const meter = fakeMeter();
    const timers = fakeTimers();
    const { controller } = await live({ inputMeter: meter.port, timers });
    let consumer = controller.snapshot();
    let notify = 0;
    const unsubscribe = controller.subscribe(() => {
      notify += 1;
      consumer = controller.snapshot();
    });

    meter.samples[0](0.3);
    const afterFirst = notify;
    assert.equal(afterFirst, 1, 'the first real sample notifies');
    // Six identical-amplitude samples 50ms apart: the visible level never changes.
    for (let i = 1; i <= 6; i += 1) {
      vi.setSystemTime(1000 + i * 50);
      meter.samples[0](0.3);
    }
    assert.ok(notify > afterFirst, 'real identical samples still refresh subscribers');
    assert.ok(notify - afterFirst <= 6, `freshness notifications stay bounded, got ${notify - afterFirst}`);
    assert.equal(consumer.inputLevelUpdatedAtMs, 1300, 'the held consumer snapshot is fresh');
    assert.equal(controller.snapshot().inputLevelUpdatedAtMs, 1300, 'the engine snapshot is fresh too');
    assert.ok(1300 - consumer.inputLevelUpdatedAtMs! <= METER_SAMPLE_TTL_MS);

    // Real samples stop: the watchdog expires the level rather than replaying the last sample.
    const watchdog = timers.timers.filter(timer => !timer.cleared).pop();
    assert.ok(watchdog, 'a freshness watchdog is armed');
    vi.setSystemTime(1300 + METER_SAMPLE_TTL_MS);
    watchdog.cb();
    assert.equal(consumer.inputLevel, null, 'the held consumer snapshot expires after the TTL');
    assert.equal(consumer.inputLevelUpdatedAtMs, null);
    assert.equal(controller.snapshot().inputLevel, null);
    unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});

test('session cleanup cancels trailing freshness notifications from a detached analyser', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(1000);
    const meter = fakeMeter();
    const timers = fakeTimers();
    const { controller } = await live({ inputMeter: meter.port, timers });
    let notify = 0;
    controller.subscribe(() => { notify += 1; });
    const onLevel = meter.samples[0];
    onLevel(0.3);
    const before = notify;
    vi.setSystemTime(1200);
    onLevel(0.3);
    assert.ok(notify > before, 'samples keep the subscriber fresh while live');

    const watchdog = timers.timers.filter(timer => !timer.cleared).pop();
    assert.ok(watchdog);
    controller.stop();
    assert.equal(watchdog.cleared, true, 'teardown cancels the freshness watchdog');
    const afterStop = notify;
    vi.setSystemTime(1400);
    onLevel(0.3);
    assert.equal(notify, afterStop, 'a late sample from the detached analyser never notifies');
  } finally {
    vi.useRealTimers();
  }
});

test('mic mute gates only the input: remote output samples stay consumed and fresh', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(1000);
    const playback = new FakePlayback();
    const input = fakeMeter();
    const output = fakeMeter();
    const timers = fakeTimers();
    const { h, controller } = await live({ playback, inputMeter: input.port, outputMeter: output.port, timers });
    playback.attach(h.remoteStream);
    playback.status('playing');
    input.samples[0](0.1);
    output.samples[0](0.5);
    controller.setMicrophoneMuted(true);
    assert.equal(controller.snapshot().inputLevel, 0, 'the muted mic reports no level');

    let consumer = controller.snapshot();
    let notify = 0;
    controller.subscribe(() => {
      notify += 1;
      consumer = controller.snapshot();
    });
    vi.setSystemTime(1250);
    output.samples[0](0.5); // identical remote amplitude while the mic is muted
    assert.equal(controller.snapshot().outputLevel, 0.5, 'remote speech is still measured while mic muted');
    assert.equal(consumer.outputLevel, 0.5);
    assert.equal(consumer.outputLevelUpdatedAtMs, 1250, 'output freshness keeps advancing while mic muted');
    assert.ok(notify >= 1, 'speaking consumers keep being refreshed while mic muted');
  } finally {
    vi.useRealTimers();
  }
});
