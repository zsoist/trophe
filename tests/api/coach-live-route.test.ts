import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), gate: vi.fn(), execute: vi.fn(), open: vi.fn() }));
vi.mock('@/db/client', () => ({ db: { execute: mocks.execute }, pool: {} }));
vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guard }));
vi.mock('@/lib/workout/shared-pilot-budget', () => ({ sharedPilotRuntimeGate: mocks.gate, createSharedPilotBudgetRuntime: vi.fn(), ASK_TROPHE_SHARED_PILOT_ID: 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229' }));
vi.mock('@/lib/voice-live/server-session', () => ({ openLiveSession: mocks.open, consumeProviderEvents: vi.fn() }));
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
