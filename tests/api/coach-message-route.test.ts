import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(async (_request: Request, dependencies: unknown) => Response.json({ dependencies })),
  create: vi.fn(() => ({ execute: vi.fn() })),
  db: { transaction: vi.fn() },
  consume: vi.fn(),
}));

vi.mock('@/agents/coach-assistant/handler', () => ({ handleCoachRequest: mocks.handle }));
vi.mock('@/agents/coach-assistant/message-service', () => ({ createCoachMessageService: mocks.create }));
vi.mock('@/db/client', () => ({ db: mocks.db }));
vi.mock('@/lib/security/durable-rate-limit', () => ({ consumeRateLimit: mocks.consume }));

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.handle.mockClear();
  mocks.create.mockClear();
});

it.each(['0', '1'])('injects the message service only when its server flag is %s', async value => {
  vi.stubEnv('COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED', value);
  vi.resetModules();
  const { POST } = await import('@/app/api/coach-assistant/route');
  await POST(new Request('https://preview.invalid/api/coach-assistant', { method: 'POST', body: '{}' }) as Parameters<typeof POST>[0]);
  const dependencies = mocks.handle.mock.calls[0][1] as { createMessageService?: () => Promise<unknown> };
  if (value === '0') {
    expect(dependencies.createMessageService).toBeUndefined();
    return;
  }
  expect(dependencies.createMessageService).toBeTypeOf('function');
  await dependencies.createMessageService?.();
  expect(mocks.create).toHaveBeenCalledWith(mocks.db, mocks.consume);
});
