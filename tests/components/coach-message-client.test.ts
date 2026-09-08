import { afterEach, expect, it, vi } from 'vitest';
import { requestCoachMessage } from '@/components/assistant/message-client';

afterEach(() => vi.unstubAllGlobals());

it('posts to the existing coach endpoint and rejects malformed success output', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, recipient: {
      coachId: '11111111-1111-4111-8111-111111111111', name: null, version: '1', extra: true,
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'not_connected' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const operation = {
    version: 'coach-assistant.v2' as const,
    conversationId: '22222222-2222-4222-8222-222222222222',
    turnId: '33333333-3333-4333-8333-333333333333',
    operation: 'message.recipient' as const,
  };

  await expect(requestCoachMessage(operation, new AbortController().signal)).rejects.toThrow('invalid_result');
  await expect(requestCoachMessage(operation, new AbortController().signal)).resolves.toEqual({ ok: false, error: 'not_connected' });
  expect(fetch).toHaveBeenCalledWith('/api/coach-assistant', expect.objectContaining({ method: 'POST', credentials: 'same-origin', redirect: 'error' }));
});
