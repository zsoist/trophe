import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), gate: vi.fn(), execute: vi.fn(), open: vi.fn() }));
vi.mock('@/db/client', () => ({ db: { execute: mocks.execute }, pool: {} }));
vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guard }));
vi.mock('@/lib/workout/shared-pilot-budget', () => ({ sharedPilotRuntimeGate: mocks.gate, createSharedPilotBudgetRuntime: vi.fn(), ASK_TROPHE_SHARED_PILOT_ID: 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229' }));
vi.mock('@/lib/voice-live/server-session', () => ({ openLiveSession: mocks.open, consumeProviderEvents: vi.fn() }));
vi.mock('@/agents/coach-assistant/server-repository', () => ({ createServerRepository: () => ({ authorize: async (actorId: string) => ({ actorId, subjectId: actorId, organizationId: '00000000-0000-4000-8000-000000000006', actorRole: 'client' }) }) }));
vi.mock('@/agents/coach-assistant/chat-service', () => ({ createCoachChatService: () => ({ execute: async () => ({ ok: true }) }) }));
import { GET, POST } from '@/app/api/coach-assistant/live/route';
const request = (body: unknown, headers = {}) => new NextRequest('http://local/api/coach-assistant/live', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('COACH_ASSISTANT_GPT_LIVE_ENABLED', '1'); mocks.guard.mockResolvedValue({ ok: true, userId: '00000000-0000-4000-8000-000000000002' }); mocks.gate.mockReturnValue({ ok: true }); });
afterEach(() => vi.unstubAllEnvs());
it('refuses creation when disabled before identity or provider access', async () => {
  vi.stubEnv('COACH_ASSISTANT_GPT_LIVE_ENABLED', '0');
  expect((await POST(request({ operation: 'create' }))).status).toBe(404);
  expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
});
it('refuses cross-origin creation', async () => {
  expect((await POST(request({}, { origin: 'https://foreign.example' }))).status).toBe(403);
  expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
});
it('refuses an unauthorized user and does not expose availability', async () => {
  mocks.guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await GET(new NextRequest('http://local/api/coach-assistant/live'))).status).toBe(401);
  expect(mocks.open).not.toHaveBeenCalled();
});
it('refuses spoofed session fields and oversized offers before provider access', async () => {
  expect((await POST(request({ operation: 'create', actorId: 'someone' }))).status).toBe(400);
  expect((await POST(request({ operation: 'create', offerSdp: 'x'.repeat(70_001) }))).status).toBe(413);
  expect(mocks.open).not.toHaveBeenCalled();
});
it('does not close a session that is absent from the authenticated actor records', async () => {
  mocks.execute.mockResolvedValue({ rows: [] });
  expect((await POST(request({ operation: 'close', sessionId: 'live_foreign' }))).status).toBe(404);
  expect(mocks.open).not.toHaveBeenCalled();
});

it('recovers an exact lost-response receipt without dispatching a second session', async () => {
  const body = { operation: 'create', requestId: '00000000-0000-4000-8000-000000000003', conversationId: '00000000-0000-4000-8000-000000000004', offerSdp: 'original-offer' };
  const hash = createHash('sha256').update(JSON.stringify([body.conversationId, body.offerSdp])).digest('hex');
  const receipt = { conversationId: body.conversationId, sessionId: 'live_committed', answerSdp: 'same-answer', deadlineMs: Date.now() + 60_000 };
  mocks.execute.mockResolvedValue({ rows: [{ hash, state: 'dispatched', receipt }] });
  for (let replay = 0; replay < 2; replay++) {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, replayed: true, sessionId: 'live_committed', answerSdp: 'same-answer' });
  }
  expect(mocks.open).not.toHaveBeenCalled();
  const recovered = await GET(new NextRequest(`http://local/api/coach-assistant/live?requestId=${body.requestId}`));
  expect(await recovered.json()).toMatchObject({ ok: true, sessionId: 'live_committed', answerSdp: 'same-answer' });
  const conflict = await POST(request({ ...body, offerSdp: 'changed-offer' }));
  expect(conflict.status).toBe(409);
  expect(mocks.open).not.toHaveBeenCalled();
});

it('does not expose a create receipt to another actor', async () => {
  const owner = '00000000-0000-4000-8000-000000000002';
  mocks.execute.mockImplementation(async query => {
    const rendered = new PgDialect().sqlToQuery(query);
    expect(rendered.sql).toContain('user_id=');
    return { rows: rendered.params.includes(owner) ? [{ hash: 'a'.repeat(64), state: 'dispatched', receipt: null }] : [] };
  });
  mocks.guard.mockResolvedValue({ ok: true, userId: '00000000-0000-4000-8000-000000000099' });
  const response = await GET(new NextRequest('http://local/api/coach-assistant/live?requestId=00000000-0000-4000-8000-000000000003'));
  expect(await response.json()).toEqual({ ok: true, state: 'absent' });
  expect(mocks.open).not.toHaveBeenCalled();
});

it('outstanding recovery is server scoped and does not expose SDP or another actor', async () => {
  const owner = '00000000-0000-4000-8000-000000000002';
  mocks.execute.mockImplementation(async query => {
    const rendered = new PgDialect().sqlToQuery(query);
    expect(rendered.sql).toContain('user_id=');
    expect(rendered.sql).toContain("NOT IN ('settled', 'released')");
    return { rows: rendered.params.includes(owner) ? [{ receipt: { sessionId: 'live_owned', conversationId: '00000000-0000-4000-8000-000000000004', answerSdp: 'private', deadlineMs: Date.now() + 60000 } }] : [] };
  });
  const url = 'http://local/api/coach-assistant/live?outstanding=1';
  expect(await (await GET(new NextRequest(url))).json()).toEqual({ ok: true, state: 'pending', sessionId: 'live_owned' });
  mocks.guard.mockResolvedValue({ ok: true, userId: '00000000-0000-4000-8000-000000000099' });
  expect(await (await GET(new NextRequest(url))).json()).toEqual({ ok: true, state: 'absent' });
});
