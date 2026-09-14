import WebSocket from 'ws';
import type { ProviderSessionEvent } from './contracts';

/** A single server-owned sideband. Audio payloads are discarded, never logged. */
export function openLiveSideband(apiKey: string, sessionId: string) {
  if (!sessionId || sessionId.length > 256) throw new Error('invalid_session');
  const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`, {
    headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 5_000, maxPayload: 1_048_576,
  });
  const queue: ProviderSessionEvent[] = [];
  let ended = false;
  let failed = false;
  let notify: (() => void) | undefined;
  let providerClosed = false;
  let onClosed: (() => void) | undefined;
  const closed = new Promise<void>(resolve => { onClosed = resolve; });
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', () => reject(new Error('sideband_connection_failed')));
    socket.once('close', () => reject(new Error('sideband_closed_before_open')));
  });
  void ready.catch(() => {});
  const finish = (error = false) => { ended = true; failed ||= error; notify?.(); };
  socket.on('error', () => finish(true));
  socket.on('close', () => finish(!providerClosed));
  socket.on('message', bytes => {
    try {
      const event = JSON.parse(bytes.toString()) as ProviderSessionEvent;
      if (!event || typeof event.type !== 'string') return;
      if (event.type !== 'session.usage.updated' && event.type !== 'session.closed' && event.type !== 'error') return;
      if (queue.length >= 128) { finish(true); return; }
      queue.push(event);
      if (event.type === 'session.closed') { providerClosed = true; onClosed?.(); }
      if (event.type === 'error') finish(true);
      notify?.();
    } catch { finish(true); }
  });
  return {
    ready,
    events: {
      async *[Symbol.asyncIterator]() {
        await ready;
        while (!ended || queue.length) {
          if (queue.length) { yield queue.shift()!; continue; }
          await new Promise<void>(resolve => { notify = resolve; });
          notify = undefined;
        }
        if (failed) throw new Error('sideband_lost');
      },
    } satisfies AsyncIterable<ProviderSessionEvent>,
    async close(signal: AbortSignal) {
      if (providerClosed) return;
      const aborted = new Promise<never>((_resolve, reject) => {
        if (signal.aborted) reject(new Error('close_timeout'));
        else signal.addEventListener('abort', () => reject(new Error('close_timeout')), { once: true });
      });
      await Promise.race([ready, aborted]);
      if (socket.readyState !== WebSocket.OPEN) throw new Error('sideband_not_open');
      socket.send(JSON.stringify({ type: 'session.close' }));
      await Promise.race([closed, aborted]);
    },
    dispose() { finish(); socket.close(); },
  };
}
