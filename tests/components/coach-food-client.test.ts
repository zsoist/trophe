import { afterEach, expect, it, vi } from 'vitest';
import { requestFoodQuantity } from '@/components/assistant/food-client';
import type { FoodQuantityOperation } from '@/agents/coach-assistant/food-contracts';

const operation: FoodQuantityOperation = {
  version: 'coach-assistant.v2', operation: 'food.read',
  conversationId: '11111111-1111-4111-8111-111111111111',
  turnId: '22222222-2222-4222-8222-222222222222',
  entryId: '33333333-3333-4333-8333-333333333333',
};
const denied = { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'forbidden' };
afterEach(() => vi.unstubAllGlobals());

it('preserves authenticated transport and returns a validated typed rejection', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(denied), { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await requestFoodQuantity(operation, signal)).toEqual(denied);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/coach-assistant', {
    method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(operation),
  });
});

it('rejects malformed or contradictory successful bodies without retrying the request', async () => {
  const receipt = { version: 'coach-assistant.v2', storage: 'database', ok: true,
    receipt: { id: operation.turnId, actionId: operation.entryId, proposalId: operation.conversationId,
      status: 'applied', resourceVersion: '2', recordedAt: '2026-09-07T00:00:00Z' } };
  for (const [body, status] of [[receipt, 500], [{ ...denied, error: 'invented' }, 200],
    [{ ...receipt, receipt: { ...receipt.receipt, actionId: 'invalid' } }, 200]] as const) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestFoodQuantity(operation, new AbortController().signal)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
