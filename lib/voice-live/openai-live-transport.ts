/**
 * Concrete GPT-Live transport. FIXED OpenAI path (`/v1/live/sessions`), fixed
 * model (`gpt-live-1`) inside `session`, fixed client-delegation body, and the
 * WebRTC offer under `transport.sdp`. No arbitrary endpoint, model, or browser
 * credential is accepted. `maxRetry = 0`: exactly one fetch.
 *
 * The API key is server-only, injected by AG1. This module never reads env or
 * credentials itself.
 *
 * Known gaps (see docs/voice-live/INTEGRATION-NOTES.md):
 *   - there is NO documented HTTP hangup endpoint. Closure is driven over the
 *     session's sideband WebSocket
 *     (`wss://api.openai.com/v1/live/sessions/{sessionId}/attach`) with a
 *     `session.close` command; the provider then emits `session.closed` (the
 *     only finalization signal). The concrete close port is AG1's and is
 *     injected here rather than invented;
 *   - server-side provider event delivery uses that same sideband WebSocket,
 *     injected via `openEventStream` (AG1 transport wiring).
 */
import {
  LIVE_SESSIONS_PATH,
  buildSessionCreateBody,
  parseSessionCreateResponse,
  type ProviderSessionEvent,
} from './contracts';
import type { LiveSessionTransport, OpenSessionRequest, OpenSessionResult } from './server-session';

export interface OpenAiLiveTransportConfig {
  /** Server-only key injected by AG1. Never logged, never returned to clients. */
  readonly apiKey: string;
  /** Fixed API origin. Defaults to the canonical OpenAI origin. */
  readonly apiOrigin?: string;
  /**
   * Injected sideband close port (AG1 wiring). Sends `session.close` over the
   * session's sideband WebSocket; the provider's `session.closed` event (on
   * `openEventStream`) is the finalization signal. No HTTP hangup is invented.
   */
  readonly sendSessionClose?: (sessionId: string, signal: AbortSignal) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
  /** Sideband event stream factory (AG1 wiring). */
  readonly openEventStream?: (sessionId: string, signal: AbortSignal) => AsyncIterable<ProviderSessionEvent>;
}

export const OPENAI_API_ORIGIN = 'https://api.openai.com';

export class LiveTransportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LiveTransportError';
    this.code = code;
  }
}

export function createOpenAiLiveSessionTransport(config: OpenAiLiveTransportConfig): LiveSessionTransport {
  const origin = config.apiOrigin ?? OPENAI_API_ORIGIN;
  if (origin !== OPENAI_API_ORIGIN) {
    // Only the canonical origin is permitted; refuse any other host/path.
    throw new LiveTransportError('origin_not_allowed', 'apiOrigin must be the canonical OpenAI origin');
  }
  const doFetch = config.fetchImpl ?? fetch;
  const deploymentSignal = new AbortController();
  // Build-time guard: no retry loops anywhere. maxRetry is structurally 0.
  const MAX_RETRY = 0;

  return {
    async openSession(request: OpenSessionRequest, deadlineSignal: AbortSignal): Promise<OpenSessionResult> {
      const signal = mergeSignals(deploymentSignal.signal, deadlineSignal);
      const body = buildSessionCreateBody({
        sdpOffer: request.sdpOffer,
        instructions: request.instructions,
        voice: request.voice,
        store: request.store,
      });
      let response: Response | null = null;
      for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
        response = await doFetch(`${origin}${LIVE_SESSIONS_PATH}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
      }
      if (!response) throw new LiveTransportError('no_response', 'no response from provider');
      if (!response.ok) {
        throw new LiveTransportError('provider_http_error', `session create failed with status ${response.status}`);
      }
      const raw: unknown = await response.json();
      const parsed = parseSessionCreateResponse(raw);
      if (!parsed.ok) throw new LiveTransportError(parsed.error, 'unexpected session create response');
      const sessionId = parsed.value.sessionId;
      const events = config.openEventStream
        ? config.openEventStream(sessionId, signal)
        : emptyEventStream();
      return { sessionId, transportSdp: parsed.value.transportSdp, events };
    },

    async closeSession(sessionId: string, signal: AbortSignal): Promise<void> {
      // Closure is a sideband control command (`session.close`), NOT an HTTP
      // request: the docs define no hangup endpoint. Without the injected port
      // we fail closed rather than invent one.
      const sendClose = config.sendSessionClose;
      if (!sendClose) {
        throw new LiveTransportError(
          'close_port_not_configured',
          'sendSessionClose (sideband session.close) must be supplied by AG1; no HTTP hangup is invented',
        );
      }
      await sendClose(sessionId, mergeSignals(deploymentSignal.signal, signal));
    },
  };
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  return a.aborted ? a : b;
}

/** No sideband configured -> no provider events delivered (never fabricated). */
function emptyEventStream(): AsyncIterable<ProviderSessionEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      // Deliberately yields nothing until AG1 wires a real sideband stream.
    },
  };
}
