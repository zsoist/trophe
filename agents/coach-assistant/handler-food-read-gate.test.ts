import { describe, expect, it, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
const captured = vi.hoisted(() => ({ tools: [] as string[] }));
vi.mock('./conversation', async importOriginal => {
  const original = await importOriginal<typeof import('./conversation')>();
  return { ...original, runConversation: (...args: Parameters<typeof original.runConversation>) => {
    captured.tools = [...(args[1].capabilityRegistry?.available() ?? [])];
    return original.runConversation(...args);
  } };
});
describe('food reference read gate', () => {
  it('offers nutritional reads with messaging disabled without constructing a message service', async () => {
    const repository = fixtureRepository();
    repository.dataSource = 'authorized_records';
    const createMessageService = vi.fn(() => { throw new Error('message service must remain disconnected'); });
    const request = new Request('https://preview.invalid/api/coach-assistant', { method: 'POST', body: JSON.stringify({
      version: 'coach-assistant.v2', conversationId: 'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',
      turnId: 'aac3a82e-898c-4907-b9b9-75133bb6d27f', message: 'Today?',
    }) });
    const response = await handleCoachRequest(request, {
      env: { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: 'synthetic-client', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', VERCEL_ENV: 'preview', COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED: '0' },
      guard: async () => ({ userId: 'synthetic-client' }), createRepository: () => repository, createMessageService,
    });
    expect(response.status).toBe(200);
    expect(captured.tools).toEqual(['food.reference']);
    expect(createMessageService).not.toHaveBeenCalled();
  });
});
