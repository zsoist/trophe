import { expect, it, vi } from 'vitest';
import { executeCoachChatAction } from './chat-actions';
import { handleCoachRequest } from './handler';
import type { CoachRepository } from './repository';
import type { createCoachChatService } from './chat-service';
it('constructs self scope from authorized context rather than request identity fields', async () => {
  const actorId = crypto.randomUUID(), organizationId = crypto.randomUUID();
  const authorize = vi.fn(async () => ({ actorId, subjectId: actorId, organizationId, timezone: 'UTC', language: 'en' }));
  const execute = vi.fn(async () => ({ version: 'coach-assistant.chat.v1', storage: 'database', ok: false, error: 'invalid_input' }));
  const repository = { dataSource: 'authorized_records', authorize } as unknown as CoachRepository;
  const raw = { version: 'coach-assistant.chat.v1', operation: 'list', subjectId: crypto.randomUUID(), actorRole: 'admin' };
  await executeCoachChatAction(actorId, raw, repository, { execute } as unknown as ReturnType<typeof createCoachChatService>, new AbortController().signal);
  expect(authorize).toHaveBeenCalledWith(actorId, actorId, expect.any(AbortSignal));
  expect(execute).toHaveBeenCalledWith({ actorId, subjectId: actorId, organizationId, actorRole: 'client' }, raw, expect.any(AbortSignal));
});
it('keeps chat factories unused without authentication or the separate history flag', async () => {
  const actorId = crypto.randomUUID(), createChatService = vi.fn(), createRepository = vi.fn();
  const request = () => new Request('http://localhost/api/coach-assistant', { method: 'POST', body: JSON.stringify({ version: 'coach-assistant.chat.v1', operation: 'list' }) });
  const env = { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId };
  expect((await handleCoachRequest(request(), { env, guard: async () => new Response(null, { status: 401 }), createRepository, createChatService })).status).toBe(401);
  expect((await handleCoachRequest(request(), { env, guard: async () => ({ userId: actorId }), createRepository, createChatService })).status).toBe(404);
  expect(createChatService).not.toHaveBeenCalled(); expect(createRepository).not.toHaveBeenCalled();
});
