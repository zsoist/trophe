/**
 * Physical voice feedback regressions: real mic mute, real analyser meter, admitted
 * server deadline, and partial->final transcript dedup. Node-only seams; no provider,
 * auth, budget or network call.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import type { LiveInputMeterPort, LiveMediaStream, LiveSessionHandle } from '../../../lib/voice-live/client-types';

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

function harness(options: { meter?: LiveInputMeterPort | null; handle?: LiveSessionHandle } = {}) {
  const channel = new FakeChannel();
  const peer = new FakePeer(channel);
  const tracks: Track[] = [{ kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } }];
  const stream: LiveMediaStream = { getTracks: () => tracks };
  const adapter = {
    createSession: async (): Promise<LiveSessionHandle> => options.handle ?? { sessionId: 'sess-1', answerSdp: 'answer-sdp' },
    closeSession: async () => {},
    createPeerConnection: () => peer,
    acquireInput: async () => stream,
  };
  return { channel, peer, tracks, stream, adapter };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

async function live(options: Parameters<typeof harness>[0] = {}, deps: Record<string, unknown> = {}) {
  const h = harness(options);
  const controller = new VoiceLiveController({ adapter: h.adapter, request, ...deps });
  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');
  return { h, controller };
}

test('microphone mute toggles track.enabled without stopping the track or ending the session', async () => {
  const { h, controller } = await live();
  assert.equal(h.tracks[0].enabled, true);
  controller.setMicrophoneMuted(true);
  assert.equal(controller.snapshot().microphoneMuted, true);
  assert.equal(h.tracks[0].enabled, false, 'mute toggles enabled, never stops the track');
  assert.equal(h.tracks[0].stopped, false);
  assert.equal(controller.snapshot().phase, 'live', 'mute must not end the session');
  controller.setMicrophoneMuted(false);
  assert.equal(controller.snapshot().microphoneMuted, false);
  assert.equal(h.tracks[0].enabled, true);
});

test('mic mute is distinct from output pause and end-of-session teardown', async () => {
  const playback = { stopOutput: () => {}, resumeOutput: () => {} };
  const { h, controller } = await live({}, { playback });
  controller.setMicrophoneMuted(true);
  controller.interrupt();
  assert.equal(controller.snapshot().microphoneMuted, true, 'output pause does not change mic mute');
  assert.equal(controller.snapshot().interrupted, true);
  assert.equal(h.tracks[0].enabled, false);
  controller.stop();
  assert.equal(controller.snapshot().microphoneMuted, false, 'teardown clears mute');
  assert.equal(h.tracks[0].stopped, true);
});

test('mute is ignored (never a false claim) before a live mic track exists', async () => {
  const h = harness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request });
  controller.setMicrophoneMuted(true);
  assert.equal(controller.snapshot().microphoneMuted, false);
});

test('input level comes only from the injected real analyser; missing meter is unsupported, not faked', async () => {
  const levels: Array<(level: number | null) => void> = [];
  let attached: LiveMediaStream | null = null;
  let detached = false;
  const meter: LiveInputMeterPort = {
    attach(stream, onLevel) {
      attached = stream;
      levels.push(onLevel);
      return () => {
        detached = true;
      };
    },
  };
  const { h, controller } = await live({}, { inputMeter: meter });
  assert.equal(attached, h.stream);
  assert.equal(controller.snapshot().meterSupported, true);
  levels[0](0.42);
  assert.equal(controller.snapshot().inputLevel, 0.42);
  levels[0](2.5);
  assert.equal(controller.snapshot().inputLevel, 1, 'amplitude is bounded to 0..1');
  controller.dispose('unmount');
  assert.equal(detached, true, 'dispose releases the analyser');
  assert.equal(h.tracks[0].stopped, true);
});

test('a host that cannot provide a real meter reports meterSupported=false with null level', async () => {
  const meter: LiveInputMeterPort = { attach: () => null };
  const { controller } = await live({}, { inputMeter: meter });
  assert.equal(controller.snapshot().meterSupported, false);
  assert.equal(controller.snapshot().inputLevel, null);
});

test('input level reads 0 while muted and restores the last measured level on unmute', async () => {
  const levels: Array<(level: number | null) => void> = [];
  const meter: LiveInputMeterPort = { attach: (_s, onLevel) => { levels.push(onLevel); return () => {}; } };
  const { controller } = await live({}, { inputMeter: meter });
  levels[0](0.3);
  controller.setMicrophoneMuted(true);
  assert.equal(controller.snapshot().inputLevel, 0);
  controller.setMicrophoneMuted(false);
  assert.equal(controller.snapshot().inputLevel, 0.3);
});

test('admitted server deadline from the create handle is surfaced; a missing deadline stays null', async () => {
  const deadline = Date.now() + 60_000;
  const withDeadline = await live({ handle: { sessionId: 'sess-1', answerSdp: 'answer-sdp', admittedDeadlineMs: deadline } });
  assert.equal(withDeadline.controller.snapshot().admittedDeadlineMs, deadline);
  const without = await live({ handle: { sessionId: 'sess-1', answerSdp: 'answer-sdp' } });
  assert.equal(without.controller.snapshot().admittedDeadlineMs, null, 'no deadline is never invented');
});

test('local caption groups dedup by provider event_id and settle on the next group', async () => {
  const { h, controller } = await live();
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'I ate two', start_ms: 0, end_ms: 200, event_id: 'e1' });
  h.channel.emit({ type: 'session.input_transcript.delta', delta: ' eggs', start_ms: 200, end_ms: 400, event_id: 'e2' });
  let rows = controller.snapshot().transcript;
  assert.equal(rows.length, 1, 'contiguous deltas of one speaker form one local caption group');
  assert.equal(rows[0].text, 'I ate two eggs');
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[0].eventId, 'e2');
  assert.equal(rows[0].id, 'row-1', 'group identity is local, never a provider utterance id');
  // A re-delivered event id is ignored (dedup) so it can never double-count.
  h.channel.emit({ type: 'session.input_transcript.delta', delta: ' eggs', start_ms: 200, end_ms: 400, event_id: 'e2' });
  assert.equal(controller.snapshot().transcript[0].text, 'I ate two eggs', 'a repeated event_id never double-counts');
  // A long gap opens a fresh local group and settles the previous one (display-only boundary).
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'and water', start_ms: 5000, end_ms: 5200, event_id: 'e3' });
  rows = controller.snapshot().transcript;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'settled');
  assert.equal(rows[1].status, 'open');
});

test('a nonexistent provider final transcript event is never honoured or invented', async () => {
  const { h, controller } = await live();
  h.channel.emit({ type: 'session.input_transcript.final', text: 'I ate two eggs', start_ms: 0, end_ms: 400, utterance_id: 'u1' });
  assert.equal(controller.snapshot().transcript.length, 0, 'no provider final event exists; it must not create a row');
});

test('a late out-of-order fragment revises the open group instead of duplicating it', async () => {
  const { h, controller } = await live();
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'two eggs', start_ms: 200, end_ms: 400, event_id: 'p1' });
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'I ate ', start_ms: 0, end_ms: 200, event_id: 'p2' });
  const rows = controller.snapshot().transcript;
  assert.equal(rows.length, 1, 'a late fragment revises the open group, never opens a second row');
  assert.equal(rows[0].revision, true);
  assert.equal(rows[0].startMs, 0);
});

test('closing the session settles any still-open caption group', async () => {
  const { h, controller } = await live();
  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'hello', start_ms: 0, end_ms: 100, event_id: 'c1' });
  assert.equal(controller.snapshot().transcript[0].status, 'open');
  controller.interrupt();
  controller.stop();
  assert.equal(controller.snapshot().transcript[0].status, 'settled');
});
