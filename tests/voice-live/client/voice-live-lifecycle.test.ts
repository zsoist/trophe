import type { LiveSessionHandle, LiveMediaStream } from '../../../lib/voice-live/client-types';
/**
 * Lifecycle + transcript node tests.
 *
 * These exercise the injected-port seams of the controller (no provider, auth,
 * budget or network call). A fake adapter stands in for AG1 wiring. Run with:
 *   node --import ./tools/ts-loaders.mjs --test test/*.test.ts
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import { parseLiveEvent } from '../../../lib/voice-live/client-events';

const request = { model: 'gpt-live', delegation: { type: 'client' as const } };

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeChannel {
  label: string;
  closed = false;
  private listeners = new Set<(event: { data: unknown }) => void>();
  constructor(label: string) {
    this.label = label;
  }
  send(_data: string): void {}
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
  channel: FakeChannel;
  connectionState = 'new';
  closed = false;
  remoteSdp: string | null = null;
  track: unknown = null;
  dataChannelCreatedBeforeOffer = false;
  private offerCreated = false;
  private stateListeners = new Set<() => void>();
  constructor(channel: FakeChannel) {
    this.channel = channel;
  }
  createDataChannel(label: string): FakeChannel {
    assert.equal(this.offerCreated, false, 'data channel must be created before the SDP offer');
    this.dataChannelCreatedBeforeOffer = true;
    assert.equal(label, 'oai-events');
    return this.channel;
  }
  async createOffer(): Promise<{ sdp: string }> {
    this.offerCreated = true;
    return { sdp: 'offer-sdp' };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(description: { sdp: string }): Promise<void> {
    this.remoteSdp = description.sdp;
  }
  addTrack(track: unknown): void {
    this.track = track;
  }
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

type Track = { kind: string; stopped: boolean; stop(): void };

function makeHarness(options: {
  acquire?: () => Promise<LiveMediaStream>;
  createSession?: (input: unknown) => Promise<LiveSessionHandle>;
  delegate?: boolean;
} = {}) {
  const channel = new FakeChannel('oai-events');
  const peer = new FakePeer(channel);
  const tracks: Track[] = [
    {
      kind: 'audio',
      stopped: false,
      stop() {
        this.stopped = true;
      },
    },
  ];
  const stream = { getTracks: () => tracks };
  const calls = { createSession: 0, closeSession: 0, createPeerConnection: 0, acquireInput: 0 };
  const adapter = {
    createSession: (input: unknown) => {
      calls.createSession += 1;
      return options.createSession
        ? options.createSession(input)
        : Promise.resolve({ sessionId: 'sess-1', answerSdp: 'answer-sdp' });
    },
    closeSession: () => {
      calls.closeSession += 1;
      return Promise.resolve();
    },
    createPeerConnection: () => {
      calls.createPeerConnection += 1;
      return peer;
    },
    acquireInput: () => {
      calls.acquireInput += 1;
      return options.acquire ? options.acquire() : Promise.resolve(stream);
    },
  };
  const delegation = options.delegate
    ? {
        delegate: (_req: unknown, signal: AbortSignal) =>
          new Promise<{ ok: boolean; summary: string }>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          }),
      }
    : { delegate: async () => ({ ok: true, summary: 'done' }) };
  const reconciler = { reconcile: async () => ({ reconciledSeconds: null, accepted: false }) };
  return { channel, peer, tracks, stream, calls, adapter, delegation, reconciler };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

test('late microphone permission after dispose stops the stream and never builds a peer', async () => {
  const mic = deferred<LiveMediaStream>();
  const h = makeHarness({ acquire: () => mic.promise });
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  const start = controller.startFromGesture();
  controller.dispose('actor_change');
  mic.resolve(h.stream);
  await start;
  await flush();

  assert.equal(h.tracks[0].stopped, true, 'late stream tracks must be stopped');
  assert.equal(h.calls.createPeerConnection, 0, 'no peer connection may be built');
  assert.equal(controller.snapshot().phase, 'idle');
  assert.equal(controller.snapshot().microphoneEnabled, false);
});

test('actor change disposes ports, stops the mic and aborts delegated work', async () => {
  const h = makeHarness({ delegate: true });
  const controller = new VoiceLiveController({ adapter: h.adapter, request, delegation: h.delegation });

  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');
  assert.equal(h.peer.dataChannelCreatedBeforeOffer, true);

  const dispatch = controller.dispatchDelegation({ delegationId: 'd1', tool: 'lookup', arguments: {}, transcript: [] });
  await flush();

  controller.dispose('actor_change');
  await flush();

  const outcome = await dispatch;
  assert.equal(outcome.status, 'cancelled', 'in-flight delegated work is cancelled on actor change');

  const state = controller.snapshot();
  assert.equal(h.channel.closed, true);
  assert.equal(h.peer.closed, true);
  assert.equal(h.tracks[0].stopped, true);
  assert.deepEqual(state.activeActions, []);
  assert.equal(state.microphoneEnabled, false);
  assert.equal(state.phase, 'closed');
});

test('late session create after dispose is ignored and ports stay closed', async () => {
  const created = deferred<{ sessionId: string; answerSdp: string }>();
  const h = makeHarness({ createSession: () => created.promise });
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  const start = controller.startFromGesture();
  await flush();
  assert.equal(h.calls.createSession, 1);

  controller.dispose('unmount');
  created.resolve({ sessionId: 'sess-late', answerSdp: 'answer-sdp' });
  await start;
  await flush();

  const state = controller.snapshot();
  assert.equal(state.sessionId, null);
  assert.equal(state.phase, 'idle');
  assert.equal(h.peer.closed, true);
  assert.equal(h.channel.closed, true);
  assert.equal(h.tracks[0].stopped, true);
});

test('transcript deltas, barge-in rows, usage and session.closed flow through the channel', async () => {
  const h = makeHarness();
  // Barge-in requires a real playback port to be interruptible (no boolean-success without a
  // stop port); this test exercises transcript grouping, so it injects one.
  const playback = { stopOutput: () => {}, resumeOutput: () => {} };
  const controller = new VoiceLiveController({ adapter: h.adapter, request, reconciler: h.reconciler, playback });

  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });

  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'hello', start_ms: 0, end_ms: 100 });
  h.channel.emit({ type: 'session.input_transcript.delta', delta: ' world', start_ms: 100, end_ms: 200 });
  h.channel.emit({ type: 'session.output_transcript.delta', delta: 'hi there', start_ms: 0, end_ms: 60 });

  let state = controller.snapshot();
  assert.equal(state.transcript.length, 2);
  assert.equal(state.transcript[0].speaker, 'user');
  assert.equal(state.transcript[0].text, 'hello world');
  assert.equal(state.transcript[1].speaker, 'assistant');
  assert.equal(state.transcript[1].text, 'hi there');

  controller.interrupt();
  assert.equal(controller.snapshot().interrupted, true);
  h.channel.emit({ type: 'session.output_transcript.delta', delta: 'after barge-in', start_ms: 200, end_ms: 260 });
  state = controller.snapshot();
  assert.equal(state.transcript.length, 3, 'post-interrupt output starts a fresh row');
  assert.equal(state.transcript[2].text, 'after barge-in');
  controller.clearInterruption();
  assert.equal(controller.snapshot().interrupted, false);

  h.channel.emit({ type: 'session.usage.updated', usage: { seconds: 12 } });
  assert.equal(controller.snapshot().usage.observedSeconds, 12);
  assert.equal(controller.snapshot().usage.authoritative, false);

  const lengthBefore = controller.snapshot().transcript.length;
  h.channel.emit('not-json');
  h.channel.emit({ type: 'unknown.event' });
  assert.equal(controller.snapshot().transcript.length, lengthBefore, 'malformed events are ignored');

  h.channel.emit({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 12 } });
  state = controller.snapshot();
  assert.equal(state.phase, 'closed');
  assert.equal(state.lastCloseReason, 'close_requested');
  assert.equal(state.usage.confirmed, true);
  assert.equal(state.usage.finalSeconds, 12);
});

test('parseLiveEvent rejects malformed payloads instead of guessing', () => {
  assert.equal(parseLiveEvent('{not json'), null);
  assert.equal(parseLiveEvent({ type: 'session.started' }), null);
  assert.equal(parseLiveEvent({ type: 'session.closed', reason: 'nonsense' }), null);
  assert.equal(
    parseLiveEvent({ type: 'session.input_transcript.delta', delta: '', start_ms: 0, end_ms: 1 }),
    null,
  );
  assert.deepEqual(parseLiveEvent({ type: 'session.closed', reason: 'expired' }), {
    type: 'session.closed',
    reason: 'expired',
    seconds: null,
  });
});
