import { describe, expect, it, vi } from 'vitest';
import { fixtureRepository } from './fixtures';
import type { createCoachChatService } from './chat-service';
import type { CoachConversationRequest } from './contracts';
import { runReviewedVoiceConversation } from './voice-pipeline';

describe('reviewed voice conversation persistence', () => {
  it('claims the user turn and stores the verified answer through the durable chat orchestrator', async () => {
    const actorId = crypto.randomUUID(), organizationId = crypto.randomUUID();
    const request: CoachConversationRequest = { version: 'coach-assistant.v2', conversationId: crypto.randomUUID(), turnId: crypto.randomUUID(), message: 'What is recorded?' };
    const empty = vi.fn(async () => ({ rows: [], truncated: false }));
    const repository = { ...fixtureRepository(), dataSource: 'authorized_records' as const, authorize: async () => ({ actorId, subjectId: actorId, organizationId, timezone: 'UTC', language: 'en' }), nutrition: empty, plan: empty, workouts: empty, exercise: empty, personalContext: empty };
    const execute = vi.fn(async () => ({ version: 'coach-assistant.chat.v1', storage: 'database', ok: true, value: { message: {}, replayed: false, current: true } }));
    const appendFinal = vi.fn(async () => ({ ok: true }));
    const chatService = { execute, appendFinal } as unknown as ReturnType<typeof createCoachChatService>;
    const response = await runReviewedVoiceConversation(request, { actorId, repository, now: new Date('2026-09-10T12:00:00Z'), signal: new AbortController().signal, mode: 'offline' }, { chatService });
    expect(response.ok).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(appendFinal).toHaveBeenCalledOnce();
  });

  it('fails closed when the durable user claim cannot be stored', async () => {
    const actorId = crypto.randomUUID(), organizationId = crypto.randomUUID();
    const request: CoachConversationRequest = { version: 'coach-assistant.v2', conversationId: crypto.randomUUID(), turnId: crypto.randomUUID(), message: 'What is recorded?' };
    const empty = vi.fn(async () => ({ rows: [], truncated: false }));
    const repository = { ...fixtureRepository(), dataSource: 'authorized_records' as const, authorize: async () => ({ actorId, subjectId: actorId, organizationId, timezone: 'UTC', language: 'en' }), nutrition: empty, plan: empty, workouts: empty, exercise: empty, personalContext: empty };
    const appendFinal = vi.fn();
    const chatService = { execute: vi.fn(async () => ({ version: 'coach-assistant.chat.v1', storage: 'database', ok: false, error: 'not_found' })), appendFinal } as unknown as ReturnType<typeof createCoachChatService>;
    await expect(runReviewedVoiceConversation(request, { actorId, repository, now: new Date('2026-09-10T12:00:00Z'), signal: new AbortController().signal, mode: 'offline' }, { chatService })).rejects.toThrow('persistence_failed');
    expect(empty).not.toHaveBeenCalled();
    expect(appendFinal).not.toHaveBeenCalled();
  });
});
