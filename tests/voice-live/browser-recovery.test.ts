import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBrowserLiveSession } from '../../lib/voice-live/browser-session';

class Channel extends EventTarget {
  label = 'oai-events'; readyState = 'open'; send = vi.fn();
  close() { this.readyState = 'closed'; }
}
class Peer extends EventTarget {
  channel = new Channel(); connectionState = 'new'; iceGatheringState = 'complete'; localDescription: { sdp: string } | null = null;
  createDataChannel() { return this.channel; }
  async createOffer() { return { sdp: 'original-offer' }; }
  async setLocalDescription(description: { sdp: string }) { this.localDescription = description; }
  async setRemoteDescription() {
    this.channel.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({ type: 'session.started', session: { id: 'live_recovered' } }) }));
  }
  addTrack() {}
  close() { this.connectionState = 'closed'; }
}
let session: ReturnType<typeof createBrowserLiveSession> | undefined;
beforeEach(() => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }] }) } });
});
afterEach(() => { session?.dispose(); session = undefined; vi.unstubAllGlobals(); });
const build = () => createBrowserLiveSession({ audio: { srcObject: null, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() } as unknown as HTMLAudioElement, prepareConversation: async () => '00000000-0000-4000-8000-000000000001', query: async () => 'answer' });

it('recovers a lost create response by request identity without a second create POST', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (_url.includes('outstanding=1')) return Response.json({ state: 'absent' });
    if (init?.method === 'POST' && JSON.parse(String(init.body)).operation === 'create') throw new TypeError('response lost');
    return Response.json({ state: 'active', sessionId: 'live_recovered', answerSdp: 'original-answer' });
  });
  vi.stubGlobal('fetch', fetcher);
  session = build();
  await session.controller.startFromGesture();
  expect(session.controller.snapshot()).toMatchObject({ phase: 'live', sessionId: 'live_recovered' });
  const creates = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST' && JSON.parse(String(init.body)).operation === 'create');
  expect(creates).toHaveLength(1);
  const requestId = JSON.parse(String(creates[0][1]?.body)).requestId;
  expect(fetcher.mock.calls.some(([url]) => url.includes(`requestId=${requestId}`))).toBe(true);
});

it('refuses a new paid create while the previous request is still unresolved', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (_url.includes('outstanding=1')) return Response.json({ state: 'absent' });
    if (init?.method === 'POST') throw new TypeError('response lost');
    return Response.json({ state: 'pending' });
  });
  vi.stubGlobal('fetch', fetcher);
  session = build();
  await session.controller.startFromGesture();
  expect(session.controller.snapshot().phase).toBe('failed');
  await session.controller.startFromGesture();
  expect(session.controller.snapshot().phase).toBe('failed');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('a remounted panel recovers and closes a committed lost-response session without another create', async () => {
  let committed = false;
  let canRecover = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('outstanding=1')) return Response.json(committed ? { state: 'pending', sessionId: 'live_orphan' } : { state: 'absent' });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (body.operation === 'create') { committed = true; throw new TypeError('response lost'); }
      expect(body).toEqual({ operation: 'close', sessionId: 'live_orphan' });
      return Response.json({ ok: true });
    }
    if (!canRecover) throw new TypeError('network unavailable');
    return Response.json({ state: 'pending' });
  });
  vi.stubGlobal('fetch', fetcher);
  session = build();
  await session.controller.startFromGesture();
  session.dispose();
  canRecover = true;
  session = build();
  await session.controller.startFromGesture();
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)));
  expect(posts.filter(body => body.operation === 'create')).toHaveLength(1);
  expect(posts.filter(body => body.operation === 'close')).toEqual([{ operation: 'close', sessionId: 'live_orphan' }]);
});
