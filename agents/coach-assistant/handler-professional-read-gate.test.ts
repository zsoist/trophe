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
  it('AG4 preserves authorized professional conversation with self-only food tools omitted', async () => {
    const repository = fixtureRepository({nutrition:[],workouts:[],plans:[]});
    repository.dataSource = 'authorized_records';
    repository.authorize=async()=>({actorId:'synthetic-client',subjectId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',timezone:'UTC',language:'en'});
    const createMessageService = vi.fn(() => { throw new Error('message service must remain disconnected'); });
    const request = new Request('https://preview.invalid/api/coach-assistant', { method: 'POST', body: JSON.stringify({
      version: 'coach-assistant.v2', conversationId: 'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',
      turnId: 'aac3a82e-898c-4907-b9b9-75133bb6d27f', message: 'Today?', context:{surface:'home',includeScreen:false,clientId:'00000000-0000-4000-8000-000000000001'},
    }) });
    const response = await handleCoachRequest(request, {
      env: { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: 'synthetic-client', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', VERCEL_ENV: 'preview', COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED: '0' },
      guard: async () => ({ userId: 'synthetic-client' }), createRepository: () => repository, createMessageService,
    });
    expect(response.status).toBe(200);
    expect(captured.tools).toEqual([]);
    expect(createMessageService).not.toHaveBeenCalled();
  });
});
