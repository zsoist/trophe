import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserLiveSession } from '@/lib/voice-live/browser-session';
class Channel extends EventTarget {
  label = 'oai-events'; readyState = 'open'; send = vi.fn();
  emit(data: unknown) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) })); }
  close() { this.readyState = 'closed'; }
}
class Peer extends EventTarget {
  static latest: Peer;
  channel = new Channel(); connectionState = 'new'; iceGatheringState = 'complete'; localDescription: { sdp: string } | null = null;
  constructor() { super(); Peer.latest = this; }
  createDataChannel() { return this.channel; }
  async createOffer() { return { sdp: 'offer' }; }
  async setLocalDescription(value: { sdp: string }) { this.localDescription = value; }
  async setRemoteDescription() { this.channel.emit({ type: 'session.started', session: { id: 'live_fragments' } }); }
  addTrack() {}
  close() { this.connectionState = 'closed'; }
}
let session: ReturnType<typeof createBrowserLiveSession> | undefined;
afterEach(() => { session?.dispose(); session = undefined; vi.unstubAllGlobals(); });
it('delegates unseen user fragments after an earlier delegation without replaying old meal statements', async () => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }] }) } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('outstanding') ? { state: 'absent' } : { sessionId: 'live_fragments', answerSdp: 'answer', deadlineMs: Date.now() + 120000 })));
  const query = vi.fn(async (_text: string, _signal: AbortSignal) => 'Review the proposal before saving.');
  session = createBrowserLiveSession({ audio: { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null } as unknown as HTMLAudioElement, prepareConversation: async () => '00000000-0000-4000-8000-000000000001', query });
  await session.controller.startFromGesture();
  const channel = Peer.latest.channel;
  channel.emit({ type: 'session.input_transcript.delta', event_id: 'fragment-a', delta: 'I ate two hot dogs.', start_ms: 0, end_ms: 800 });
  channel.emit({ type: 'session.delegation.created', delegation: { id: 'delegation-a', target: 'client' } });
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
  channel.emit({ type: 'session.input_transcript.delta', event_id: 'fragment-b', delta: 'And 30 ml of cola.', start_ms: 800, end_ms: 1400 });
  channel.emit({ type: 'session.delegation.created', delegation: { id: 'delegation-b', target: 'client' } });
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(query.mock.calls.map(args => args[0])).toEqual(['I ate two hot dogs.', 'And 30 ml of cola.']);
});

it.each(["length", "capacity"])("refuses incomplete %s-limited speech before a backend action", async (limit) => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }] }) } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('outstanding') ? { state: 'absent' } : { sessionId: 'live_fragments', answerSdp: 'answer', deadlineMs: Date.now() + 120000 })));
  const query = vi.fn(async (_text: string, _signal: AbortSignal) => 'Review the proposal before saving.');
  session = createBrowserLiveSession({ audio: { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null } as unknown as HTMLAudioElement, prepareConversation: async () => '00000000-0000-4000-8000-000000000001', query });
  await session.controller.startFromGesture();
  const channel = Peer.latest.channel;
  const fragments = limit === 'capacity' ? 257 : 1;
  for (let i = 0; i < fragments; i++) channel.emit({ type: 'session.input_transcript.delta', event_id: `overflow-${i}`, delta: limit === 'length' ? 'Do not log ' + 'food '.repeat(450) : i === 0 ? 'Do not log ' : 'food ', start_ms: i * 100, end_ms: i * 100 + 100 });
  channel.emit({ type: 'session.delegation.created', delegation: { id: 'overflow-delegation', target: 'client' } });
  await vi.waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
  expect(query).not.toHaveBeenCalled();
  expect(JSON.parse(channel.send.mock.calls[0][0]).content).toContain('repeat');
});

it("resets fragment consumption when a new peer session starts", async () => {
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }] }) } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('outstanding') ? { state: 'absent' } : { sessionId: 'live_fragments', answerSdp: 'answer', deadlineMs: Date.now() + 120000 })));
  const query = vi.fn(async (_text: string, _signal: AbortSignal) => 'Review the proposal before saving.');
  session = createBrowserLiveSession({ audio: { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null } as unknown as HTMLAudioElement, prepareConversation: async () => '00000000-0000-4000-8000-000000000001', query });
  await session.controller.startFromGesture();
  const channel = Peer.latest.channel;
  channel.emit({ type: 'session.input_transcript.delta', event_id: 'first', delta: 'first', start_ms: 0, end_ms: 100 });
  channel.emit({ type: 'session.delegation.created', delegation: { id: 'first-call', target: 'client' } });
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  channel.emit({ type: 'session.closed', session: { id: 'live_fragments' }, reason: 'close_requested', usage: { seconds: 1 } });
  await vi.waitFor(() => expect(session!.controller.snapshot().phase).toBe('closed'));
  await session!.controller.startFromGesture();
  const next = Peer.latest.channel;
  next.emit({ type: 'session.input_transcript.delta', event_id: 'second', delta: 'second', start_ms: 0, end_ms: 100 });
  next.emit({ type: 'session.delegation.created', delegation: { id: 'second-call', target: 'client' } });
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(query.mock.calls.map(args => args[0])).toEqual(['first', 'second']);
});
