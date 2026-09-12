import { VoiceLiveController } from './client-lifecycle';
import { createBrowserLivePlayback } from './browser-playback';
import type { LiveConnectionAdapter, LivePeerConnection } from './client-types';

const endpoint = '/api/coach-assistant/live';

export function createBrowserLiveSession(input: {
  audio: HTMLAudioElement;
  prepareConversation(): Promise<string | null>;
  query(text: string, signal: AbortSignal): Promise<string>;
}) {
  let peer: RTCPeerConnection | undefined;
  let disposed = false;
  const playback = createBrowserLivePlayback(input.audio, () => controller.reportPlaybackBlocked());
  const adapter: LiveConnectionAdapter = {
    async acquireInput() {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) throw new Error('unsupported');
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    },
    createPeerConnection() {
      const current = new RTCPeerConnection();
      peer = current;
      const seen = new Set<string>();
      current.addEventListener('track', event => {
        if (disposed || current !== peer) return;
        playback.attach(event.streams[0] ?? new MediaStream([event.track]));
      });
      return {
        createDataChannel(label) {
          const channel = current.createDataChannel(label);
          channel.addEventListener('message', event => {
            if (disposed || current !== peer) return;
            let raw: { type?: string; delegation?: { id?: string; target?: string } };
            try { raw = JSON.parse(String(event.data)); } catch { return; }
            const id = raw.delegation?.id;
            if (raw.type !== 'session.delegation.created' || raw.delegation?.target !== 'client' || typeof id !== 'string' || !id || id.length > 256 || seen.has(id)) return;
            seen.add(id);
            const state = controller.snapshot();
            const text = state.transcript.filter(row => row.speaker === 'user').slice(-4).map(row => row.text).join(' ').slice(-2000);
            if (!text || !state.sessionId) return;
            void controller.dispatchDelegation({ delegationId: id, sessionId: state.sessionId, tool: 'ask_trophe', arguments: { text }, transcript: state.transcript }).then(result => {
              if (disposed || current !== peer || channel.readyState !== 'open') return;
              channel.send(JSON.stringify({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: id, content: result.summary.slice(0, 1000) }));
            });
          });
          return channel;
        },
        async createOffer() { const offer = await current.createOffer(); if (!offer.sdp) throw new Error('missing_sdp'); return { sdp: offer.sdp }; },
        setLocalDescription: description => current.setLocalDescription(description),
        setRemoteDescription: description => current.setRemoteDescription(description),
        addTrack: (track, stream) => { current.addTrack(track as MediaStreamTrack, stream as MediaStream); },
        addEventListener: (type, listener) => current.addEventListener(type, listener),
        removeEventListener: (type, listener) => current.removeEventListener(type, listener),
        get connectionState() { return current.connectionState; },
        close() { current.close(); if (peer === current) { peer = undefined; playback.stopOutput(); } },
      } satisfies LivePeerConnection;
    },
    async createSession({ signal }) {
      const current = peer;
      if (!current || disposed) throw new Error('cancelled');
      const conversationId = await input.prepareConversation();
      signal.throwIfAborted();
      if (!conversationId) throw new Error('conversation_unavailable');
      if (current.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => { clearTimeout(timer); current.removeEventListener('icegatheringstatechange', changed); signal.removeEventListener('abort', abort); };
          const changed = () => { if (current.iceGatheringState === 'complete') { cleanup(); resolve(); } };
          const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
          const timer = setTimeout(() => { cleanup(); reject(new Error('ice_timeout')); }, 5_000);
          current.addEventListener('icegatheringstatechange', changed);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort(); else changed();
        });
      }
      signal.throwIfAborted();
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ operation: 'create', conversationId, requestId: crypto.randomUUID(), offerSdp: current.localDescription?.sdp }) });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== 'object' || !('sessionId' in body) || typeof body.sessionId !== 'string' || !('answerSdp' in body) || typeof body.answerSdp !== 'string') throw new Error('session_unavailable');
      return { sessionId: body.sessionId, answerSdp: body.answerSdp };
    },
    async closeSession({ sessionId, signal }) {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ operation: 'close', sessionId }) });
      if (!response.ok) throw new Error('close_unconfirmed');
    },
  };
  const controller = new VoiceLiveController({
    adapter, request: { model: 'gpt-live-1', delegation: { type: 'client' } }, playback,
    iceTimeoutMs: 20_000, startTimeoutMs: 20_000,
    delegation: { async delegate(request, signal) {
      const text = (request.arguments as { text?: unknown })?.text;
      if (typeof text !== 'string' || !text.trim()) return { ok: false, summary: 'Ask the user to repeat their request.' };
      return { ok: true, summary: await input.query(text, signal) };
    } },
    reconciler: { async reconcile({ sessionId }) {
      const response = await fetch(`${endpoint}?sessionId=${encodeURIComponent(sessionId)}`, { credentials: 'same-origin', signal: AbortSignal.timeout(5_000) });
      const body = await response.json();
      return { accepted: response.ok && body.state === 'settled', reconciledSeconds: typeof body.reconciledSeconds === 'number' ? body.reconciledSeconds : null };
    } },
  });
  return { controller, dispose() { disposed = true; controller.dispose('unmount'); playback.dispose(); } };
}
