import type { LiveSessionHandle } from '../../../lib/voice-live/client-types';
/**
 * Residual P1 regressions (3 findings) on the voice-live lifecycle controller.
 *
 * These are the follow-ups AG4 left open after the first 7+5 P1 fixes. Every boundary
 * below is an injected fake: no provider, auth, budget or network call is made.
 * Run with:
 *   node --import ./tools/ts-loaders.mjs --test test/*.test.ts
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import type { LivePlaybackPort } from '../../../lib/voice-live/client-types';

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
  readonly listeners = new Set<(event: { data: unknown }) => void>();
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
  sdpError: unknown = null;
  sdpDeferred: Deferred<void> | null = null;
  private offerCreated = false;
  private stateListeners = new Set<() => void>();
  constructor(channel: FakeChannel) {
    this.channel = channel;
  }
  createDataChannel(label: string): FakeChannel {
    assert.equal(this.offerCreated, false, 'data channel must be created before the SDP offer');
    assert.equal(label, 'oai-events');
    return this.channel;
  }
  async createOffer(): Promise<{ sdp: string }> {
    this.offerCreated = true;
    return { sdp: 'offer-sdp' };
  }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(description: { sdp: string }): Promise<void> {
    if (this.sdpDeferred) return this.sdpDeferred.promise;
    if (this.sdpError) throw this.sdpError;
    this.remoteSdp = description.sdp;
  }
  addTrack(_track: unknown): void {}
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
type Stream = { getTracks: () => Track[]; tracks: Track[] };
const makeStream = (): Stream => {
  const tracks: Track[] = [{ kind: 'audio', stopped: false, stop() { this.stopped = true; } }];
  return { getTracks: () => tracks, tracks };
};

interface CloseCall {
  sessionId: string;
  reason: string;
}
interface ReconcileCall {
  sessionId: string;
  confirmed: boolean;
  finalSeconds: number | null;
}

function makeHarness(options: {
  createSession?: (input: unknown) => Promise<LiveSessionHandle>;
  peers?: FakePeer[];
  playback?: LivePlaybackPort | null;
} = {}) {
  const peers = options.peers ?? [new FakePeer(new FakeChannel('oai-events'))];
  let peerIndex = 0;
  const streams: Stream[] = [];
  const calls = { createSession: 0, createPeerConnection: 0 };
  const closedSessions: CloseCall[] = [];
  const reconciles: ReconcileCall[] = [];
  let sessionSeq = 0;
  const adapter = {
    createSession: (input: unknown) => {
      calls.createSession += 1;
      if (options.createSession) return options.createSession(input);
      sessionSeq += 1;
      return Promise.resolve({ sessionId: `sess-${sessionSeq}`, answerSdp: 'answer-sdp' });
    },
    closeSession: (input: { sessionId: string; reason: string }) => {
      closedSessions.push({ sessionId: input.sessionId, reason: input.reason });
      return Promise.resolve();
    },
    createPeerConnection: () => {
      calls.createPeerConnection += 1;
      const peer = peers[Math.min(peerIndex, peers.length - 1)];
      peerIndex += 1;
      return peer;
    },
    acquireInput: () => {
      const stream = makeStream();
      streams.push(stream);
      return Promise.resolve(stream);
    },
  };
  const reconciler = {
    reconcile: async (input: ReconcileCall) => {
      reconciles.push({ sessionId: input.sessionId, confirmed: input.confirmed, finalSeconds: input.finalSeconds });
      return { reconciledSeconds: null, accepted: false };
    },
  };
  return {
    peers,
    calls,
    closedSessions,
    reconciles,
    adapter,
    reconciler,
    currentTracks: () => streams[streams.length - 1].tracks,
  };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

// Residual P1#1 - a missing playback port must not yield a boolean "interrupted" success.
// The capability is exposed so the UI can disable the control, and `interrupt()` is inert.
test('P1r: interrupt without a playback port is inert and reports canInterrupt=false', async () => {
  const h = makeHarness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  await controller.startFromGesture();
  await flush();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');

  assert.equal(controller.snapshot().canInterrupt, false, 'no real stop port => no interrupt capability');
  controller.interrupt();
  const state = controller.snapshot();
  assert.equal(state.interrupted, false, 'interrupt must not claim success without a stop port');
  assert.equal(state.canInterrupt, false);
  assert.equal(state.phase, 'live', 'an empty interrupt must not disturb the session');

  // A real port flips the capability on (positive control for the same seam).
  const played: string[] = [];
  const playback: LivePlaybackPort = {
    stopOutput: () => played.push('stop'),
    resumeOutput: () => played.push('resume'),
  };
  const h2 = makeHarness({ playback });
  const controller2 = new VoiceLiveController({ adapter: h2.adapter, request, playback });
  await controller2.startFromGesture();
  await flush();
  h2.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller2.snapshot().canInterrupt, true);
  controller2.interrupt();
  assert.deepEqual(played, ['stop']);
  assert.equal(controller2.snapshot().interrupted, true);
});

// Residual P1#2 - the trusted handle must be retained immediately so an SDP-apply failure
// BEFORE the session id is published still releases the remote session exactly once,
// stops the microphone and reports unknown usage to the reconciler.
test('P1r: setRemoteDescription failure closes the retained remote session once and reconciles', async () => {
  const peer = new FakePeer(new FakeChannel('oai-events'));
  peer.sdpError = new Error('bad answer sdp');
  const h = makeHarness({
    peers: [peer],
    createSession: () => Promise.resolve({ sessionId: 'sess-sdp', answerSdp: 'answer-sdp' }),
  });
  const controller = new VoiceLiveController({ adapter: h.adapter, request, reconciler: h.reconciler });

  await controller.startFromGesture();
  await flush();

  const state = controller.snapshot();
  assert.equal(state.phase, 'failed');
  assert.equal(state.error, 'create_failed');
  assert.equal(state.sessionId, null, 'the id is never published on the local state');
  assert.deepEqual(
    h.closedSessions.map(call => call.sessionId),
    ['sess-sdp'],
    'the retained remote handle is released exactly once',
  );
  assert.equal(h.currentTracks()[0].stopped, true, 'the microphone is stopped');
  assert.equal(h.reconciles.length, 1, 'unknown usage is still reported to the reconciler');
  assert.equal(h.reconciles[0].sessionId, 'sess-sdp');
  assert.equal(h.reconciles[0].confirmed, false);
  assert.equal(state.usage.confirmed, false);
  assert.equal(state.usage.authoritative, false);
});

// Residual P1#2 (companion) - a stop racing the pending answer-SDP apply must also release the
// retained handle: the id was never published, so it can only come from the create result.
test('P1r: stop during a pending SDP apply still closes the retained remote session', async () => {
  const peer = new FakePeer(new FakeChannel('oai-events'));
  peer.sdpDeferred = deferred<void>();
  const h = makeHarness({
    peers: [peer],
    createSession: () => Promise.resolve({ sessionId: 'sess-race', answerSdp: 'answer-sdp' }),
  });
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  const start = controller.startFromGesture();
  await flush();
  // The create has returned (id known) but the answer SDP has not been applied or published.
  assert.equal(controller.snapshot().sessionId, null);

  controller.stop('close_requested');
  assert.deepEqual(
    h.closedSessions.map(call => call.sessionId),
    ['sess-race'],
    'the retained handle is released even before the UI publish',
  );
  assert.equal(h.currentTracks()[0].stopped, true);

  peer.sdpDeferred.reject(new Error('aborted answer'));
  await start;
  await flush();
  assert.deepEqual(h.closedSessions.map(call => call.sessionId), ['sess-race'], 'closed exactly once');
  assert.notEqual(controller.snapshot().phase, 'waiting_started');
  controller.dispose('unmount');
});

// Residual P1#3 - session.started / session.closed must be bound to a created handle.
// Events seen before the create response cannot adopt an arbitrary session or settle usage.
test('P1r: early/wrong/stale channel events cannot change phase or settle', async () => {
  const created = deferred<{ sessionId: string; answerSdp: string }>();
  const h = makeHarness({ createSession: () => created.promise });
  const controller = new VoiceLiveController({ adapter: h.adapter, request, reconciler: h.reconciler });

  const start = controller.startFromGesture();
  await flush();
  assert.equal(controller.snapshot().phase, 'connecting');

  // Early, wrong-id started and an id-less close arrive before the create response.
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-other' } });
  h.peers[0].channel.emit({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 42 } });

  let state = controller.snapshot();
  assert.equal(state.phase, 'connecting', 'early events cannot promote or close the session');
  assert.equal(state.sessionId, null, 'no arbitrary session is adopted');
  assert.equal(state.lastCloseReason, null);
  assert.equal(state.usage.confirmed, false, 'early close cannot settle usage');
  assert.equal(state.usage.finalSeconds, null);
  assert.equal(h.reconciles.length, 0);

  created.resolve({ sessionId: 'sess-1', answerSdp: 'answer-sdp' });
  await start;
  await flush();

  state = controller.snapshot();
  assert.equal(state.phase, 'waiting_started', 'the queued wrong-id started is dropped after validation');
  assert.equal(state.sessionId, 'sess-1');

  // Only the id we actually created may promote the connection.
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-other' } });
  assert.equal(controller.snapshot().phase, 'waiting_started');
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');

  // Stale channel from a replaced connection must not close/settle the new session.
  const staleListener = [...h.peers[0].channel.listeners][0];
  controller.dispose('replacement');
  await flush();
  const h2 = makeHarness();
  const controller2 = new VoiceLiveController({ adapter: h2.adapter, request, reconciler: h2.reconciler });
  await controller2.startFromGesture();
  await flush();
  h2.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller2.snapshot().phase, 'live');

  staleListener({ data: { type: 'session.closed', reason: 'close_requested', usage: { seconds: 9 } } });
  assert.equal(controller2.snapshot().phase, 'live', 'stale close is ignored');
  assert.equal(controller2.snapshot().usage.confirmed, false);
});

test('AG1: resume audio calls the real output port and stays inert after logout', async () => {
  let resumes = 0;
  const playback: LivePlaybackPort = { stopOutput() {}, resumeOutput() { resumes++; } };
  const h = makeHarness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request, playback });
  await controller.startFromGesture();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  controller.reportPlaybackBlocked();
  controller.resumePlayback();
  assert.equal(resumes, 1);
  assert.equal(controller.snapshot().playbackBlocked, false);
  assert.equal(controller.snapshot().serverError, null);
  controller.dispose('logout');
  controller.resumePlayback();
  assert.equal(resumes, 1);
});
