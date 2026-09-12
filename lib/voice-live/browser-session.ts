import { VoiceLiveController } from './client-lifecycle';
import { createBrowserLivePlayback } from './browser-playback';
import { reservationFor } from './delegation-fragments';
import type { LiveConnectionAdapter, LiveInputMeterPort, LiveMediaStream, LiveOutputMeterPort, LivePeerConnection, LiveTranscriptCursor } from './client-types';

const endpoint = '/api/coach-assistant/live';

/**
 * Real RMS meter over the browser `WebAudio` analyser. The analyser taps the stream only
 * (source -> analyser, nothing routed to `destination`), so it can never create a second
 * audible path or an echo/feedback loop. Returns `null` (never a fabricated wave) when a
 * real meter is unavailable, so the UI can show an explicit "no level feedback" state.
 * The detach callback releases the AudioContext and its RAF.
 */
function createStreamLevelMeter(): LiveInputMeterPort {
  return {
    attach(stream: LiveMediaStream, onLevel: (level: number | null) => void) {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor || typeof globalThis.AnalyserNode !== 'function') return null;
      let context: AudioContext;
      try {
        context = new Ctor();
      } catch {
        return null;
      }
      let source: MediaStreamAudioSourceNode | null = null;
      let raf = 0;
      let disposed = false;
      try {
        source = context.createMediaStreamSource(stream as unknown as MediaStream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const buffer = new Float32Array(analyser.fftSize);
        void Promise.resolve(context.resume?.()).catch(() => {});
        const sample = () => {
          if (disposed) return;
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
          onLevel(Math.sqrt(sum / buffer.length));
          raf = globalThis.requestAnimationFrame(sample);
        };
        raf = globalThis.requestAnimationFrame(sample);
      } catch {
        void Promise.resolve(context.close?.()).catch(() => {});
        return null;
      }
      return () => {
        disposed = true;
        if (raf) globalThis.cancelAnimationFrame?.(raf);
        try {
          source?.disconnect();
        } catch {
          // Analyser graph may already be torn down by the browser.
        }
        void Promise.resolve(context.close?.()).catch(() => {});
      };
    },
  };
}

/** Real microphone-input meter (see {@link createStreamLevelMeter}). */
export function createBrowserInputMeter(): LiveInputMeterPort {
  return createStreamLevelMeter();
}

/**
 * Real remote-output meter. The lifecycle attaches it to the remote WebRTC media track the
 * playback owner bound (never a synthetic oscillator) and gates it on actual playback status.
 */
export function createBrowserOutputMeter(): LiveOutputMeterPort {
  return createStreamLevelMeter();
}

export function createBrowserLiveSession(input: {
  audio: HTMLAudioElement;
  prepareConversation(): Promise<string | null>;
  query(text: string, signal: AbortSignal): Promise<string>;
}) {
  let peer: RTCPeerConnection | undefined;
  let disposed = false;
  let unresolvedRequestId: string | null = null;
  // Bounded RAW-fragment cursor: the monotonic sequence (and last event_id) of the user
  // fragments earlier delegations already consumed. Deliberately separate from the display
  // caption groups, which merge fragments: a fragment that arrives after its row was
  // consumed must still be delegated, not stranded.
  const recover = async (requestId: string) => {
    const response = await fetch(`${endpoint}?requestId=${encodeURIComponent(requestId)}`, { credentials: 'same-origin', signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('recovery_unavailable');
    return response.json() as Promise<{ state?: string; sessionId?: string; answerSdp?: string }>;
  };
  const playback = createBrowserLivePlayback(input.audio, () => controller.reportPlaybackBlocked());
  const adapter: LiveConnectionAdapter = {
    async acquireInput() {
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) throw new Error('unsupported');
      // Capture defaults tuned for a hands-free coaching conversation: cancel speaker echo,
      // suppress steady noise, level the far/near mic and keep a single channel for the meter.
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    },
    createPeerConnection() {
      let userCursor: LiveTranscriptCursor | null = null;
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
            if (!state.sessionId) return;
            // The provider gives no utterance id and no final transcript event, so the delegated
            // text is exactly the unseen RAW user fragments. The actual provider delegation id is
            // preserved, and a redelivered event_id / repeated delegation id yields no fragments
            // and therefore never re-sends an old utterance.
            const reservation = reservationFor(controller.userFragmentBatch(userCursor));
            if (!reservation) return;
            const previousCursor = userCursor;
            // Reserve synchronously so a redelivered delegation cannot replay these fragments
            // while the backend call is still in flight.
            userCursor = reservation.cursor;
            void controller.dispatchDelegation({
              delegationId: id,
              sessionId: state.sessionId,
              tool: 'ask_trophe',
              arguments: { text: reservation.text },
              transcript: state.transcript,
              transcriptCursor: reservation.cursor,
              transcriptTruncated: reservation.truncated,
            }).then(result => {
              if (result.dispatched === false) {
                // Refused before any backend attempt (duplicate id, not dispatchable, session
                // mismatch): release the reservation so the fragments are not silently lost,
                // but only if no later delegation has already advanced the cursor.
                if (userCursor === reservation.cursor) userCursor = previousCursor;
                return;
              }
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
      if (unresolvedRequestId) {
        const prior = await recover(unresolvedRequestId);
        if (prior.state === 'active' && typeof prior.sessionId === 'string') {
          await adapter.closeSession({ sessionId: prior.sessionId, reason: 'close_requested', signal });
        } else if (prior.state !== 'ended') throw new Error('create_recovery_required');
        unresolvedRequestId = null;
      }
      // No client identity cache: the authenticated server locates outstanding
      // sessions even after remount, reload, or an account change.
      const outstandingResponse = await fetch(`${endpoint}?outstanding=1`, { credentials: 'same-origin', signal });
      if (!outstandingResponse.ok) throw new Error('recovery_unavailable');
      const outstanding = await outstandingResponse.json() as { state?: string; sessionId?: string };
      if (outstanding.state !== 'absent') {
        if (typeof outstanding.sessionId === 'string') await adapter.closeSession({ sessionId: outstanding.sessionId, reason: 'close_requested', signal });
        // End this gesture after recovery; never silently create another paid session.
        throw new Error('create_recovery_required');
      }
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
      const requestId = crypto.randomUUID();
      unresolvedRequestId = requestId;
      try {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ operation: 'create', conversationId, requestId, offerSdp: current.localDescription?.sdp }) });
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== 'object' || !('sessionId' in body) || typeof body.sessionId !== 'string' || !('answerSdp' in body) || typeof body.answerSdp !== 'string') throw new Error('session_unavailable');
        unresolvedRequestId = null;
        // Propagate the server-admitted deadline exactly as the create receipt returned it
        // (`deadlineMs`). When the receipt carries none we report null and NEVER invent one.
        return { sessionId: body.sessionId, answerSdp: body.answerSdp, admittedDeadlineMs: readAdmittedDeadline(body) };
      } catch {
        // Read-only recovery, not a second provider request. The controller closes
        // a recovered late handle if cancellation invalidated its epoch.
        const recovered = await recover(requestId);
        if (recovered.state === 'active' && typeof recovered.sessionId === 'string' && typeof recovered.answerSdp === 'string') {
          unresolvedRequestId = null;
          return { sessionId: recovered.sessionId, answerSdp: recovered.answerSdp, admittedDeadlineMs: readAdmittedDeadline(recovered) };
        }
        throw new Error('create_recovery_required');
      }
    },
    async closeSession({ sessionId, signal }) {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ operation: 'close', sessionId }) });
      if (!response.ok) throw new Error('close_unconfirmed');
    },
  };
  const controller = new VoiceLiveController({
    adapter, request: { model: 'gpt-live-1', delegation: { type: 'client' } }, playback,
    inputMeter: createBrowserInputMeter(),
    outputMeter: createBrowserOutputMeter(),
    iceTimeoutMs: 20_000, startTimeoutMs: 20_000,
    delegation: { async delegate(request, signal) {
      // Never execute a suffix after capacity loss: it may have lost a negation.
      if (request.transcriptTruncated) return { ok: false, summary: 'The request was incomplete. Ask the user to repeat it in a shorter phrase before taking any action.' };
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

/** Read the server-admitted deadline (epoch ms) only when it is a positive finite number. */
function readAdmittedDeadline(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { deadlineMs?: unknown }).deadlineMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
