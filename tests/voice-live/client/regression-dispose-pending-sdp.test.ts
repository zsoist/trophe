/**
 * Residual P1 regression: dispose(logout/actor_change) must release a remote session whose
 * create returned but whose answer SDP is still pending.
 *
 * In that window `state.sessionId` was never published (it is null) while the trusted handle
 * lives only in the private `createdSessionId`. Teardown erases that handle, so `dispose` must
 * read `state.sessionId ?? createdSessionId` BEFORE teardown or the remote session leaks.
 * Every boundary below is an injected fake: no provider, auth, budget or network call.
 * Run with:
 *   node --import ./tools/ts-loaders.mjs --test test/*.test.ts
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';

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
  async setRemoteDescription(): Promise<void> {
    if (this.sdpDeferred) return this.sdpDeferred.promise;
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

function makeHarness(peer: FakePeer) {
  const streams: Stream[] = [];
  const closedSessions: CloseCall[] = [];
  const reconciles: ReconcileCall[] = [];
  const adapter = {
    createSession: () => Promise.resolve({ sessionId: 'sess-pending', answerSdp: 'answer-sdp' }),
    closeSession: (input: { sessionId: string; reason: string }) => {
      closedSessions.push({ sessionId: input.sessionId, reason: input.reason });
      return Promise.resolve();
    },
    createPeerConnection: () => peer,
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
  return { closedSessions, reconciles, adapter, reconciler, currentTracks: () => streams[streams.length - 1].tracks };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

// P1 - dispose(logout) during a pending answer-SDP apply must still release the retained
// remote session, once, and leave uncertain usage for the reconciler. A later SDP settle
// (success or failure) must not revive the session or double-close.
test('P1r2: dispose(logout) during a pending SDP apply closes the retained remote session once', async () => {
  const peer = new FakePeer(new FakeChannel('oai-events'));
  peer.sdpDeferred = deferred<void>();
  const h = makeHarness(peer);
  const controller = new VoiceLiveController({ adapter: h.adapter, request, reconciler: h.reconciler });

  const start = controller.startFromGesture();
  await flush();
  // The create returned (handle retained) but the answer SDP has not been applied/published.
  assert.equal(controller.snapshot().sessionId, null, 'the id is never published while the SDP is pending');

  controller.dispose('logout');
  await flush();

  assert.deepEqual(
    h.closedSessions.map(call => call.sessionId),
    ['sess-pending'],
    'the retained remote handle is released on logout even before the UI publish',
  );
  assert.equal(h.currentTracks()[0].stopped, true, 'the microphone is released');
  assert.equal(h.reconciles.length, 1, 'uncertain usage is still reported to the reconciler');
  assert.equal(h.reconciles[0].sessionId, 'sess-pending');
  assert.equal(h.reconciles[0].confirmed, false, 'usage stays unconfirmed on the client');
  assert.equal(controller.snapshot().usage.authoritative, false);

  // A stale completion of the pending apply must not revive the session or close it again.
  peer.sdpDeferred.resolve();
  await start;
  await flush();
  const state = controller.snapshot();
  assert.notEqual(state.phase, 'waiting_started', 'a stale SDP completion cannot promote the session');
  assert.notEqual(state.phase, 'live');
  assert.equal(state.sessionId, null, 'no session id is adopted after dispose');
  assert.deepEqual(h.closedSessions.map(call => call.sessionId), ['sess-pending'], 'closed exactly once');
  assert.equal(h.reconciles.length, 1, 'accounting is not re-reported');
});

// P1 - the same pending-SDP window on an actor change: remote close once, mic released,
// accounting preserved, and a later SDP rejection must not revive or double-close.
test('P1r2: dispose(actor_change) during a pending SDP apply closes the retained remote session once', async () => {
  const peer = new FakePeer(new FakeChannel('oai-events'));
  peer.sdpDeferred = deferred<void>();
  const h = makeHarness(peer);
  const controller = new VoiceLiveController({ adapter: h.adapter, request, reconciler: h.reconciler });

  const start = controller.startFromGesture();
  await flush();
  assert.equal(controller.snapshot().sessionId, null);

  controller.dispose('actor_change');
  await flush();

  assert.deepEqual(
    h.closedSessions.map(call => call.sessionId),
    ['sess-pending'],
    'the retained remote handle is released on actor change even before the UI publish',
  );
  assert.equal(h.currentTracks()[0].stopped, true, 'the microphone is released');
  assert.equal(h.reconciles.length, 1, 'uncertain usage is still reported to the reconciler');
  assert.equal(h.reconciles[0].sessionId, 'sess-pending');
  assert.equal(h.reconciles[0].confirmed, false);

  // A stale rejection of the pending apply must not revive the session or close it again.
  peer.sdpDeferred.reject(new Error('aborted answer'));
  await start;
  await flush();
  const state = controller.snapshot();
  assert.notEqual(state.phase, 'waiting_started');
  assert.notEqual(state.phase, 'live');
  assert.notEqual(state.phase, 'failed', 'the stale rejection must not surface as a fresh failure');
  assert.equal(state.sessionId, null);
  assert.deepEqual(h.closedSessions.map(call => call.sessionId), ['sess-pending'], 'closed exactly once');
  assert.equal(h.reconciles.length, 1, 'accounting is not re-reported');
});
