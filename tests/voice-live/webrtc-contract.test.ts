/**
 * Literal docs-fixture regression for the WebRTC session create contract.
 *
 * The fixtures below are copied *verbatim* (shape, keys, nesting) from the
 * official Voice WebRTC guide
 * (https://developers.openai.com/api/docs/guides/voice-webrtc?api=live) and the
 * supplied `perf-report/` excerpts — never from our own implementation:
 *
 *   201 create response:
 *     {"session":{"id":"live_123"},"transport":{"type":"webrtc","sdp":"..."}}
 *
 *   POST /v1/live/sessions request (client delegation):
 *     {"session":{"model":"gpt-live-1","delegation":{"type":"client"},
 *                 "instructions":"..."},
 *      "transport":{"type":"webrtc","sdp":"<offer>"}}
 *
 * These fixtures deliberately assert the *documented* shape so a reader/builder
 * that mirrors the old (wrong) `{id, model, sdp, transport}` shape fails here
 * rather than being silently blessed by its own test.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseSessionCreateResponse, buildSessionCreateBody } from '../../lib/voice-live/contracts';

/** Verbatim documented create-response JSON. */
const DOCS_CREATE_RESPONSE = '{"session":{"id":"live_123"},"transport":{"type":"webrtc","sdp":"<SDP answer>"}}';

/** Verbatim documented create-request JSON for client delegation. */
const DOCS_CREATE_REQUEST =
  '{"session":{"model":"gpt-live-1","delegation":{"type":"client"},"instructions":"Help the user."},"transport":{"type":"webrtc","sdp":"<offer>"}}';

/** Documented response with a real (multiline) SDP answer body. */
const DOCS_CREATE_RESPONSE_REAL_SDP = JSON.stringify({
  session: { id: 'live_abc123' },
  transport: { type: 'webrtc', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n' },
});

test('docs fixture: parseSessionCreateResponse reads raw.session.id + raw.transport.sdp', () => {
  const parsed = parseSessionCreateResponse(JSON.parse(DOCS_CREATE_RESPONSE));
  assert.equal(parsed.ok, true);
  assert.equal((parsed as { value: { sessionId: string } }).value.sessionId, 'live_123');
  assert.equal((parsed as { value: { transportSdp: string } }).value.transportSdp, '<SDP answer>');
});

test('docs fixture: parsed session id is preserved verbatim as an opaque string', () => {
  const parsed = parseSessionCreateResponse(JSON.parse(DOCS_CREATE_RESPONSE_REAL_SDP));
  assert.equal(parsed.ok, true);
  // 'live_abc123' is NOT a UUID — the reader must not impose a UUID shape.
  assert.equal((parsed as { value: { sessionId: string } }).value.sessionId, 'live_abc123');
  assert.equal(
    (parsed as { value: { transportSdp: string } }).value.transportSdp,
    'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n',
  );
});

test('docs fixture: the old wrong shape (top-level id + transport.sdp) is rejected', () => {
  // This is exactly what the previous implementation accepted; it must now fail
  // closed rather than fabricate a session id from the wrong key.
  const parsed = parseSessionCreateResponse({ id: 'live_123', transport: { sdp: 'v=0 answer' } });
  assert.equal(parsed.ok, false);
});

test('docs fixture: a top-level sdp/model on the response is never trusted', () => {
  const parsed = parseSessionCreateResponse({ model: 'gpt-live-1', sdp: 'v=0', session: { id: 'live_1' } });
  assert.equal(parsed.ok, false);
});

test('docs fixture: buildSessionCreateBody matches the documented nested request body', () => {
  const body = buildSessionCreateBody({ sdpOffer: '<offer>', instructions: 'Help the user.' });
  assert.deepEqual(body, JSON.parse(DOCS_CREATE_REQUEST));
  // The fixed model lives *inside* `session`; there is no top-level model/sdp.
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'model'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'sdp'), false);
  assert.equal((body.session as Record<string, unknown>).model, 'gpt-live-1');
  assert.deepEqual((body.session as Record<string, unknown>).delegation, { type: 'client' });
});

test('docs fixture: the create body carries the WebRTC offer under transport.sdp', () => {
  const body = buildSessionCreateBody({ sdpOffer: 'v=0 offer' });
  assert.deepEqual(body.transport, { type: 'webrtc', sdp: 'v=0 offer' });
  assert.equal((body.session as Record<string, unknown>).instructions, undefined);
});
