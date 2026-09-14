/**
 * Focused regression for the consumed-fragment cursor defect.
 *
 * Root cause: delegation could only see "already consumed user caption groups". Two deltas
 * (A then B) that arrive close together merge into ONE display group, so once a delegation
 * consumed that group, the next delegation sliced it away and lost B entirely.
 *
 * Fix: delegations consume RAW user fragments by monotonic sequence + provider event_id,
 * which is independent of display caption grouping. Each actual delegation id consumes the
 * exact unseen fragments; an unseen overlapping (late) fragment is retained; a redelivered
 * event_id is ignored; a repeated delegation id never dispatches twice; a dispatched failure
 * is never retried or replayed.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import { LiveTranscript } from '../../../lib/voice-live/client-transcript';
import { reservationFor } from '../../../lib/voice-live/delegation-fragments';
import type {
  LiveDelegationAdapter,
  LiveDelegationRequest,
  LiveMediaStream,
  LiveSessionHandle,
  LiveTranscriptCursor,
} from '../../../lib/voice-live/client-types';

const request = { model: 'gpt-live', delegation: { type: 'client' as const } };

class FakeChannel {
  label = 'oai-events';
  closed = false;
  readyState = 'open';
  private listeners = new Set<(event: { data: unknown }) => void>();
  sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
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

function harness() {
  const channel = new FakeChannel();
  const peer = new FakePeer(channel);
  const tracks = [{ kind: 'audio', enabled: true, stop(): void {} }];
  const stream: LiveMediaStream = { getTracks: () => tracks };
  const adapter = {
    async createSession(): Promise<LiveSessionHandle> {
      return { sessionId: 'sess-1', answerSdp: 'answer-sdp' };
    },
    async closeSession(): Promise<void> {},
    createPeerConnection: () => peer,
    async acquireInput(): Promise<LiveMediaStream> {
      return stream;
    },
  };
  return { channel, peer, stream, adapter };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

async function live(delegation?: LiveDelegationAdapter) {
  const h = harness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request, delegation: delegation ?? null });
  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');
  return { h, controller };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

// --- raw fragment cursor (transcript level) ----------------------------------------------

test('A then B merge into one display group, yet each delegation consumes its own raw fragment', async () => {
  const transcript = new LiveTranscript();
  transcript.append('user', 'I ate two', 0, 200, { eventId: 'e1' });
  const first = reservationFor(transcript.pendingUserFragments(null));
  assert.equal(first?.text, 'I ate two');
  assert.equal(first?.cursor.sequence, 1);

  // B arrives later but overlaps the open group: display still shows a single row.
  transcript.append('user', ' eggs', 200, 400, { eventId: 'e2' });
  assert.equal(transcript.captions('user').length, 1, 'display grouping merges A and B into one row');
  assert.equal(transcript.captions('user')[0].text, 'I ate two eggs');

  // The whole point: the second delegation must send B only, not the merged row again.
  const second = reservationFor(transcript.pendingUserFragments(first!.cursor));
  assert.equal(second?.text, ' eggs', 'only the unseen fragment is delegated');
  assert.equal(second?.cursor.sequence, 2);
  assert.equal(second?.cursor.lastEventId, 'e2');

  // Nothing unseen remains: a third delegation would send nothing rather than replay A+B.
  assert.equal(reservationFor(transcript.pendingUserFragments(second!.cursor)), null);
});

test('an unseen late overlapping fragment (new event_id) is retained for the next delegation', () => {
  const transcript = new LiveTranscript();
  transcript.append('user', 'two eggs', 200, 400, { eventId: 'p1' });
  const first = reservationFor(transcript.pendingUserFragments(null));
  transcript.append('user', 'I ate ', 0, 200, { eventId: 'p2' });
  assert.equal(transcript.captions('user').length, 1, 'late fragment revises the open row');
  assert.equal(transcript.captions('user')[0].revision, true);
  const second = reservationFor(transcript.pendingUserFragments(first!.cursor));
  assert.equal(second?.text, 'I ate ', 'the unseen late fragment is not lost');
  assert.equal(second?.cursor.lastEventId, 'p2');
});

test('a redelivered event_id is ignored and never re-delegated', () => {
  const transcript = new LiveTranscript();
  transcript.append('user', 'eggs', 0, 200, { eventId: 'e1' });
  const cursor: LiveTranscriptCursor = { sequence: 1, lastEventId: 'e1' };
  transcript.append('user', 'eggs', 0, 200, { eventId: 'e1' });
  assert.equal(transcript.captions('user').length, 1, 'a repeated event_id never double-counts');
  assert.equal(reservationFor(transcript.pendingUserFragments(cursor)), null, 'nothing unseen to delegate');
});

test('the finite fragment store reports truncation explicitly instead of silently losing speech', () => {
  const transcript = new LiveTranscript();
  for (let i = 0; i < 257; i += 1) {
    transcript.append('user', 'x', i * 10, i * 10 + 5, { eventId: `f${i}` });
  }
  const batch = transcript.pendingUserFragments(null);
  assert.equal(batch.truncated, true, 'capacity eviction of unconsumed fragments is flagged');
  assert.equal(batch.fragments.length, 256);
  assert.equal(batch.fragments[0].seq, 2, 'oldest fragment was evicted');
  // Consuming the retained window clears the flag: loss is reported once, not repeated.
  const next = transcript.pendingUserFragments(batch.cursor);
  assert.equal(next.truncated, false);
  assert.equal(next.fragments.length, 0);
});

// --- actual delegation dispatch (controller level) ---------------------------------------

test('host wiring sends only the unseen fragment for a delegation on a merged caption group', async () => {
  const delegated: LiveDelegationRequest[] = [];
  const adapter: LiveDelegationAdapter = {
    async delegate(dispatchRequest) {
      delegated.push(dispatchRequest);
      return { ok: true, summary: 'ok' };
    },
  };
  const { h, controller } = await live(adapter);
  let cursor: LiveTranscriptCursor | null = null;

  h.channel.emit({ type: 'session.input_transcript.delta', delta: 'I ate two', start_ms: 0, end_ms: 200, event_id: 'e1' });
  const first = reservationFor(controller.userFragmentBatch(cursor));
  assert.equal(first?.text, 'I ate two');
  cursor = first!.cursor;
  await controller.dispatchDelegation({
    delegationId: 'd1',
    sessionId: 'sess-1',
    tool: 'ask_trophe',
    arguments: { text: first!.text },
    transcript: controller.snapshot().transcript,
    transcriptCursor: first!.cursor,
  });

  h.channel.emit({ type: 'session.input_transcript.delta', delta: ' eggs', start_ms: 200, end_ms: 400, event_id: 'e2' });
  assert.equal(controller.snapshot().transcript.length, 1, 'A and B share one display group');

  const second = reservationFor(controller.userFragmentBatch(cursor));
  assert.equal(second?.text, ' eggs', 'the second delegation sends B only');
  cursor = second!.cursor;
  await controller.dispatchDelegation({
    delegationId: 'd2',
    sessionId: 'sess-1',
    tool: 'ask_trophe',
    arguments: { text: second!.text },
    transcript: controller.snapshot().transcript,
    transcriptCursor: second!.cursor,
  });

  assert.deepEqual(delegated.map(item => (item.arguments as { text: string }).text), ['I ate two', ' eggs']);
  assert.deepEqual(delegated.map(item => item.transcriptCursor?.sequence), [1, 2]);
});

test('a repeated delegation id is refused and never dispatches the backend twice', async () => {
  const gate = deferred<void>();
  let calls = 0;
  const adapter: LiveDelegationAdapter = {
    async delegate() {
      calls += 1;
      await gate.promise;
      return { ok: true, summary: 'ok' };
    },
  };
  const { controller } = await live(adapter);

  const first = controller.dispatchDelegation({ delegationId: 'd1', sessionId: 'sess-1', tool: 'ask_trophe', arguments: {}, transcript: [] });
  await flush();
  assert.equal(calls, 1);

  const duplicate = await controller.dispatchDelegation({ delegationId: 'd1', sessionId: 'sess-1', tool: 'ask_trophe', arguments: {}, transcript: [] });
  assert.equal(duplicate.status, 'failed');
  assert.equal(duplicate.summary, 'duplicate_delegation');
  assert.equal(duplicate.dispatched, false, 'a duplicate must not be reported as dispatched');
  assert.equal(calls, 1, 'the backend is invoked exactly once for one delegation id');

  gate.resolve();
  assert.equal((await first).status, 'completed');
});

test('a dispatched failure is attempted once and never silently retried', async () => {
  let calls = 0;
  const adapter: LiveDelegationAdapter = {
    async delegate() {
      calls += 1;
      return { ok: false, summary: 'backend_unavailable' };
    },
  };
  const { controller } = await live(adapter);
  const result = await controller.dispatchDelegation({ delegationId: 'd9', sessionId: 'sess-1', tool: 'ask_trophe', arguments: {}, transcript: [] });
  assert.equal(result.status, 'failed');
  assert.equal(result.dispatched, true, 'it reached the backend once');
  assert.equal(calls, 1, 'no hidden retry after a dispatched failure');
  await flush();
  assert.equal(calls, 1, 'still no retry after settling');
});
