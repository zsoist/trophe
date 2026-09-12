import type { LiveSessionHandle } from '../../../lib/voice-live/client-types';
/**
 * AG4 change-request regressions (5 x P1).
 *
 * Each test targets one review finding on the injected-port lifecycle controller.
 * No provider, auth, budget or network call: every boundary is a fake adapter.
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
  remoteSdp: string | null = null;
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
  simulateState(state: string): void {
    this.connectionState = state;
    for (const listener of [...this.stateListeners]) listener();
  }
}

type Track = { kind: string; stopped: boolean; stop(): void };
type Stream = { getTracks: () => Track[]; tracks: Track[] };
const makeStream = (): Stream => {
  const tracks: Track[] = [
    { kind: 'audio', stopped: false, stop() { this.stopped = true; } },
  ];
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
} = {}) {
  const peers = options.peers ?? [new FakePeer(new FakeChannel('oai-events'))];
  let peerIndex = 0;
  const streams: Stream[] = [];
  const calls = { createSession: 0, createPeerConnection: 0 };
  const closedSessions: CloseCall[] = [];
  const reconciles: ReconcileCall[] = [];
  let sessionSeq = 0;
  let lastCreateSignal: AbortSignal | null = null;
  const playbackCounts = { stop: 0, resume: 0 };
  const playback = {
    stopOutput: () => {
      playbackCounts.stop += 1;
    },
    resumeOutput: () => {
      playbackCounts.resume += 1;
    },
  };

  const adapter = {
    createSession: (input: unknown) => {
      calls.createSession += 1;
      lastCreateSignal = (input as { signal: AbortSignal }).signal;
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
  const delegation = {
    delegate: (_req: unknown, signal: AbortSignal) =>
      new Promise<{ ok: boolean; summary: string }>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
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
    playback,
    playbackCounts,
    adapter,
    delegation,
    reconciler,
    currentTracks: () => streams[streams.length - 1].tracks,
    lastCreateSignal: () => lastCreateSignal,
  };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

// P1#1 - stop during an in-flight create must invalidate the epoch, close the late remote
// session and never resurrect `waiting_started`.
test('P1: stop during in-flight create closes the late remote session without resurrecting waiting_started', async () => {
  const created = deferred<{ sessionId: string; answerSdp: string }>();
  const h = makeHarness({ createSession: () => created.promise });
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  const start = controller.startFromGesture();
  await flush();
  assert.equal(h.calls.createSession, 1);

  controller.stop('close_requested');
  created.resolve({ sessionId: 'sess-late', answerSdp: 'answer-sdp' });
  await start;
  await flush();

  const state = controller.snapshot();
  assert.notEqual(state.phase, 'waiting_started', 'late create must not resurrect waiting_started');
  assert.equal(state.sessionId, null);
  assert.ok(
    h.closedSessions.some(call => call.sessionId === 'sess-late'),
    'the late remote session must be closed on the wire',
  );
});

// P1#1 - a connect timeout must abort the in-flight create and invalidate the epoch so a
// subsequent session.started is ignored.
test('P1: ice timeout aborts the create signal, closes the remote session and ignores late started', async () => {
  const timers: Array<{ cb: () => void; cleared: boolean }> = [];
  const fakeTimers = {
    setTimeout: (cb: () => void, _ms: number) => {
      const handle = { cb, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout: (handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
  const h = makeHarness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request, timers: fakeTimers });

  await controller.startFromGesture();
  await flush();
  assert.equal(controller.snapshot().phase, 'waiting_started');

  const ice = timers.find(timer => !timer.cleared);
  assert.ok(ice, 'the ice timeout timer must be pending');
  ice.cb();
  await flush();

  assert.equal(controller.snapshot().phase, 'failed');
  assert.equal(h.lastCreateSignal()?.aborted, true, 'the create signal must be aborted on fail');
  assert.ok(h.closedSessions.some(call => call.sessionId === 'sess-1'), 'remote session closed on timeout');

  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'failed');
});

// P1#2 - a transport/network failure must close the existing remote session, stop the mic
// immediately and still report unknown usage to the reconciler.
test('P1: network failure closes the remote session, stops the mic and reconciles unconfirmed usage', async () => {
  const h = makeHarness();
  const controller = new VoiceLiveController({
    adapter: h.adapter,
    request,
    delegation: h.delegation,
    reconciler: h.reconciler,
  });

  await controller.startFromGesture();
  await flush();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');

  h.peers[0].simulateState('failed');
  await flush();

  assert.equal(controller.snapshot().phase, 'failed');
  assert.equal(h.currentTracks()[0].stopped, true, 'microphone stops immediately');
  assert.deepEqual(
    h.closedSessions.map(call => call.sessionId),
    ['sess-1'],
    'the existing remote session must be closed on the wire',
  );
  assert.equal(h.closedSessions[0].reason, 'connection_lost');
  assert.equal(controller.snapshot().usage.confirmed, false);
  assert.equal(h.reconciles.length, 1, 'unconfirmed usage is still reported to the reconciler');
  assert.equal(h.reconciles[0].confirmed, false);
  assert.equal(controller.snapshot().usage.authoritative, false);
});

// P1#2 - dispose (logout/actor change) must close the existing remote session and reconcile
// unconfirmed usage, not just tear down local ports. `closeSession` stays idempotent.
test('P1: dispose(logout) closes the remote session and reconciles without double-closing', async () => {
  const h = makeHarness();
  const controller = new VoiceLiveController({
    adapter: h.adapter,
    request,
    delegation: h.delegation,
    reconciler: h.reconciler,
  });

  await controller.startFromGesture();
  await flush();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });

  controller.dispose('logout');
  controller.dispose('actor_change');
  await flush();

  assert.deepEqual(h.closedSessions.map(call => call.sessionId), ['sess-1'], 'idempotent remote close');
  assert.equal(h.currentTracks()[0].stopped, true);
  assert.equal(h.reconciles.length, 1);
  assert.equal(controller.snapshot().phase, 'closed');
});

// P1#3 - barge-in stops/mutes the real playback port and must NOT cancel delegated work.
test('P1: interrupt stops playback output while delegated backend work continues', async () => {
  const h = makeHarness();
  const controller = new VoiceLiveController({
    adapter: h.adapter,
    request,
    delegation: h.delegation,
    playback: h.playback,
  });

  await controller.startFromGesture();
  await flush();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });

  const dispatch = controller.dispatchDelegation({ delegationId: 'd1', tool: 'lookup', arguments: {}, transcript: [] });
  await flush();
  assert.deepEqual(controller.snapshot().activeActions, ['d1']);

  controller.interrupt();
  assert.equal(h.playbackCounts.stop, 1, 'output must be muted through the playback port');
  assert.equal(controller.snapshot().interrupted, true);
  assert.deepEqual(controller.snapshot().activeActions, ['d1'], 'speech interruption must not cancel backend work');

  controller.clearInterruption();
  assert.equal(h.playbackCounts.resume, 1);
  assert.equal(controller.snapshot().interrupted, false);

  controller.dispose('unmount');
  await flush();
  await dispatch;
});

// P1#4 - channel events are bound to the owning session+epoch: wrong-id `session.started` is
// rejected, stale channels from a replaced session are ignored, and events after dispose are
// ignored (usage/closed without an id bind via the connection epoch).
test('P1: channel events bind to owning session/epoch (stale A to B and wrong id)', async () => {
  const peerA = new FakePeer(new FakeChannel('oai-events'));
  const peerB = new FakePeer(new FakeChannel('oai-events'));
  const h = makeHarness({ peers: [peerA, peerB] });
  const controller = new VoiceLiveController({ adapter: h.adapter, request });

  await controller.startFromGesture();
  await flush();
  const listenerA = [...peerA.channel.listeners][0];
  peerA.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');

  // Replace A with B under a fresh epoch.
  controller.dispose('replacement');
  await flush();
  await controller.startFromGesture();
  await flush();

  // Wrong session id must not promote the new connection.
  peerB.channel.emit({ type: 'session.started', session: { id: 'sess-other' } });
  assert.equal(controller.snapshot().phase, 'waiting_started', 'wrong-id session.started is rejected');
  peerB.channel.emit({ type: 'session.started', session: { id: 'sess-2' } });
  assert.equal(controller.snapshot().phase, 'live');

  // Stale A listener delivered directly must be ignored (epoch no longer matches).
  assert.ok(listenerA, 'previous channel listener was registered');
  listenerA({ data: { type: 'session.usage.updated', usage: { seconds: 99 } } });
  assert.equal(controller.snapshot().usage.observedSeconds, null, 'stale channel events are ignored');

  // Events after dispose are ignored too.
  controller.dispose('unmount');
  peerB.channel.emit({ type: 'session.usage.updated', usage: { seconds: 5 } });
  assert.equal(controller.snapshot().usage.observedSeconds, null);
  assert.equal(controller.snapshot().phase, 'closed');
});

// P1#5 - delegation must refuse before touching the backend when not in a live owned session,
// including a retained controller reference after logout.
test('P1: dispatchDelegation refuses idle/closing/disposed and session mismatch', async () => {
  const h = makeHarness();
  let delegateCalls = 0;
  const delegation = {
    delegate: async () => {
      delegateCalls += 1;
      return { ok: true, summary: 'done' };
    },
  };
  const controller = new VoiceLiveController({ adapter: h.adapter, request, delegation });

  // idle
  let result = await controller.dispatchDelegation({ delegationId: 'd0', tool: 't', arguments: {}, transcript: [] });
  assert.equal(result.status, 'failed');
  assert.equal(result.summary, 'not_dispatchable');

  await controller.startFromGesture();
  await flush();
  h.peers[0].channel.emit({ type: 'session.started', session: { id: 'sess-1' } });

  // session mismatch
  result = await controller.dispatchDelegation({
    delegationId: 'd1',
    tool: 't',
    arguments: {},
    transcript: [],
    sessionId: 'sess-other',
  });
  assert.equal(result.summary, 'session_mismatch');

  controller.stop('close_requested');
  result = await controller.dispatchDelegation({ delegationId: 'd2', tool: 't', arguments: {}, transcript: [] });
  assert.equal(result.summary, 'not_dispatchable', 'closing controller refuses dispatch');

  controller.dispose('logout');
  result = await controller.dispatchDelegation({ delegationId: 'd3', tool: 't', arguments: {}, transcript: [] });
  assert.equal(result.summary, 'not_dispatchable', 'retained reference after logout refuses dispatch');

  assert.equal(delegateCalls, 0, 'the backend is never invoked for a refused dispatch');
});
