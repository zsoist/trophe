/**
 * Barge-in / paused-state lifecycle regressions on the injected-port controller.
 *
 * The honest "paused" presentation must exist ONLY while the session is live, and resuming
 * output is a live-session playback gesture — exactly like `resumePlayback` (which is already
 * inert after logout). A stale Resume control/frame that arrives after the session left `live`
 * (End, provider close, logout/actor change) must never call the real output port and re-open
 * audio for a session the user already ended.
 *
 * No provider, auth, budget or network call: every boundary is a fake adapter.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { VoiceLiveController } from '../../../lib/voice-live/client-lifecycle';
import { createBrowserLivePlayback } from '../../../lib/voice-live/browser-playback';
import type { LiveMediaStream, LivePlaybackPort, LiveSessionHandle } from '../../../lib/voice-live/client-types';

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

function harness() {
  const channel = new FakeChannel();
  const peer = new FakePeer(channel);
  const tracks = [{ kind: 'audio', enabled: true, stop(): void {} }];
  const stream: LiveMediaStream = { getTracks: () => tracks };
  const playback = { stops: 0, resumes: 0 };
  const port: LivePlaybackPort = {
    stopOutput: () => { playback.stops += 1; },
    resumeOutput: () => { playback.resumes += 1; },
  };
  const adapter = {
    createSession: async (): Promise<LiveSessionHandle> => ({ sessionId: 'sess-1', answerSdp: 'answer-sdp' }),
    closeSession: async () => {},
    createPeerConnection: () => peer,
    acquireInput: async () => stream,
  };
  return { channel, peer, port, playback, adapter };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

async function live() {
  const h = harness();
  const controller = new VoiceLiveController({ adapter: h.adapter, request, playback: h.port });
  await controller.startFromGesture();
  await flush();
  h.channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  assert.equal(controller.snapshot().phase, 'live');
  return { h, controller };
}

test('repeated barge-in is idempotent: one output stop, one paused state', async () => {
  const { h, controller } = await live();
  controller.interrupt();
  controller.interrupt();
  assert.equal(h.playback.stops, 1, 'a second barge-in must not stop the output again');
  assert.equal(h.playback.resumes, 0);
  assert.equal(controller.snapshot().interrupted, true);
  assert.equal(controller.snapshot().canInterrupt, false);
});

test('ending the session clears the paused state and resume is inert afterwards', async () => {
  const { h, controller } = await live();
  controller.interrupt();
  assert.equal(controller.snapshot().interrupted, true);

  controller.stop();
  assert.equal(controller.snapshot().phase, 'closing');
  assert.equal(controller.snapshot().interrupted, false, 'the paused state must not outlive the live phase');

  // A stale Resume frame/control that lands after End must not re-open audio.
  controller.clearInterruption();
  assert.equal(h.playback.resumes, 0, 'resume is inert once the session is no longer live');
});

test('a provider close clears the paused state and resume is inert afterwards', async () => {
  const { h, controller } = await live();
  controller.interrupt();
  h.channel.emit({ type: 'session.closed', reason: 'remote_hangup', usage: { seconds: 4 } });
  assert.equal(controller.snapshot().phase, 'closed');
  assert.equal(controller.snapshot().interrupted, false);
  controller.clearInterruption();
  assert.equal(h.playback.resumes, 0);
});

test('resume is inert (and cleared) after logout/actor change, mirroring resumePlayback', async () => {
  const { h, controller } = await live();
  controller.interrupt();
  controller.dispose('logout');
  assert.equal(controller.snapshot().interrupted, false);
  controller.clearInterruption();
  assert.equal(h.playback.resumes, 0, 'clearInterruption must stay inert after logout like resumePlayback');
});

test('a live barge-in still resumes exactly once through the real output port', async () => {
  const { h, controller } = await live();
  controller.interrupt();
  controller.clearInterruption();
  assert.equal(h.playback.resumes, 1);
  assert.equal(controller.snapshot().interrupted, false);
  assert.equal(controller.snapshot().canInterrupt, true);
  // Clearing again is a no-op (never resumes a second time).
  controller.clearInterruption();
  assert.equal(h.playback.resumes, 1);
});

// User-visible counterexample through the REAL playback owner: after the user ends a barged-in
// session, the audio element must stay paused/muted — a stale Resume frame must not restart it.
test('a barged-in session that ends never restarts the real audio element', async () => {
  const channel = new FakeChannel();
  const peer = new FakePeer(channel);
  const tracks = [{ kind: 'audio', enabled: true, stop(): void {} }];
  const stream: LiveMediaStream = { getTracks: () => tracks };
  const audio = { srcObject: null as unknown, muted: false, pause: () => {}, play: () => Promise.resolve() };
  let plays = 0;
  audio.play = () => { plays += 1; return Promise.resolve(); };
  const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, () => {});
  const adapter = {
    createSession: async (): Promise<LiveSessionHandle> => ({ sessionId: 'sess-1', answerSdp: 'answer-sdp' }),
    closeSession: async () => {},
    createPeerConnection: () => peer,
    acquireInput: async () => stream,
  };
  const controller = new VoiceLiveController({ adapter, request, playback });
  await controller.startFromGesture();
  await flush();
  channel.emit({ type: 'session.started', session: { id: 'sess-1' } });
  playback.attach({ getTracks: () => [] } as unknown as MediaStream);
  await flush(); // resolves the attach play()
  const playsBefore = plays;
  controller.interrupt();
  assert.equal(audio.muted, true);
  controller.stop();
  controller.clearInterruption();
  await flush();
  assert.equal(plays, playsBefore, 'a stale resume after End must not call play() again');
  assert.equal(audio.muted, true, 'output stays muted once the session is ending');
});
