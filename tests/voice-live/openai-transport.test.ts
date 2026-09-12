import { test } from 'vitest';
import assert from 'node:assert/strict';
import { OPENAI_API_ORIGIN, createOpenAiLiveSessionTransport, LiveTransportError } from '../../lib/voice-live/openai-live-transport';

const SIGNAL = new AbortController().signal;

function okResponse(): Response {
  // Documented 201 shape: session.id + transport.sdp.
  return new Response(JSON.stringify({ session: { id: 'live_123' }, transport: { type: 'webrtc', sdp: 'v=0 answer' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('create posts to the fixed canonical path with a client-delegation gpt-live-1 body', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = createOpenAiLiveSessionTransport({
    apiKey: 'sk-test-should-never-leak',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return okResponse();
    },
  });
  const opened = await transport.openSession({ sdpOffer: 'v=0 offer' }, SIGNAL);
  assert.equal(opened.sessionId, 'live_123');
  assert.equal(opened.transportSdp, 'v=0 answer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${OPENAI_API_ORIGIN}/v1/live/sessions`);
  const body = JSON.parse(String(calls[0].init.body));
  // The fixed model lives inside `session`; there is no top-level model/sdp.
  assert.equal(body.model, undefined);
  assert.equal(body.sdp, undefined);
  assert.equal(body.session.model, 'gpt-live-1');
  assert.deepEqual(body.session.delegation, { type: 'client' });
  assert.deepEqual(body.transport, { type: 'webrtc', sdp: 'v=0 offer' });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer sk-test-should-never-leak');
});

test('no automatic retry: a failed create calls fetch exactly once', async () => {
  let count = 0;
  const transport = createOpenAiLiveSessionTransport({
    apiKey: 'sk-test',
    fetchImpl: async () => {
      count += 1;
      return new Response('nope', { status: 500 });
    },
  });
  await assert.rejects(() => transport.openSession({ sdpOffer: 'v=0' }, SIGNAL), (err: unknown) => {
    return err instanceof LiveTransportError && err.code === 'provider_http_error';
  });
  assert.equal(count, 1);
});

test('arbitrary API origin is refused', () => {
  assert.throws(
    () => createOpenAiLiveSessionTransport({ apiKey: 'sk-test', apiOrigin: 'https://evil.example.com' }),
    (err: unknown) => err instanceof LiveTransportError && err.code === 'origin_not_allowed',
  );
});

test('close requires the injected sideband close port rather than an invented HTTP endpoint', async () => {
  const transport = createOpenAiLiveSessionTransport({ apiKey: 'sk-test', fetchImpl: async () => okResponse() });
  await assert.rejects(() => transport.closeSession('live_123', SIGNAL), (err: unknown) => {
    return err instanceof LiveTransportError && err.code === 'close_port_not_configured';
  });
});

test('close delegates to the injected sideband port and never issues an HTTP hangup', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const closed: string[] = [];
  const transport = createOpenAiLiveSessionTransport({
    apiKey: 'sk-test',
    sendSessionClose: async (sessionId) => {
      closed.push(sessionId);
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: String((init as RequestInit).method) });
      return okResponse();
    },
  });
  await transport.closeSession('live_123', SIGNAL);
  assert.deepEqual(closed, ['live_123']);
  assert.equal(calls.length, 0, 'close must not perform any HTTP request');
});

test('unexpected create response shape is rejected (no fabricated session id)', async () => {
  const transport = createOpenAiLiveSessionTransport({
    apiKey: 'sk-test',
    fetchImpl: async () => new Response(JSON.stringify({ no_id: true }), { status: 200 }),
  });
  await assert.rejects(() => transport.openSession({ sdpOffer: 'v=0' }, SIGNAL), (err: unknown) => {
    return err instanceof LiveTransportError && err.code === 'create_response_missing_id';
  });
});

test('the old top-level id/sdp response shape is rejected', async () => {
  const transport = createOpenAiLiveSessionTransport({
    apiKey: 'sk-test',
    fetchImpl: async () => new Response(JSON.stringify({ id: 'live_123', transport: { sdp: 'v=0' } }), { status: 200 }),
  });
  await assert.rejects(() => transport.openSession({ sdpOffer: 'v=0' }, SIGNAL), (err: unknown) => {
    return err instanceof LiveTransportError && err.code === 'create_response_missing_id';
  });
});
