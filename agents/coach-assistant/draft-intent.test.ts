import { describe, expect, it, vi } from 'vitest';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
import { authorizeSubject } from './context';
import type { CoachConversationRequest } from './contracts';

const conversationId = 'a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const turnId = 'aac3a82e-898c-4907-b9b9-75133bb6d27f';
const workspaceVersion = 'a'.repeat(64);
const baseOutput = {
  answer: 'I can prepare an alternative for your review.',
  evidenceRefs: [] as string[],
  entityRefs: [] as string[],
  facts: [] as Array<{ kind: 'record_fact'; evidenceId: string }>,
  followUp: null,
  limitations: [] as string[],
  escalation: false,
};

function request(surface: 'workout' | 'plan' | 'food' = 'workout', message = 'I only have 35 minutes and dumbbells.'): CoachConversationRequest {
  return {
    version: 'coach-assistant.v2' as const,
    conversationId,
    turnId,
    message,
    context: {
      surface,
      includeScreen: true,
      workspace: { kind: 'draft' as const, version: workspaceVersion },
    },
  };
}

function provider(actionIntent: unknown): OfflineConversationProvider {
  return vi.fn(async input => {
    const payload = JSON.parse(input.prompt) as { evidence: Array<{ id: string }> };
    return {
      output: { ...baseOutput, evidenceRefs: payload.evidence.map(item => item.id), actionIntent },
      usage: { inputTokens: 400, outputTokens: 100, reasoningTokens: 20 },
      latencyMs: 1,
      rawStatus: 200,
    };
  });
}

const review = async () => ({ approved: true });

describe('provider-authored Workout draft intent', () => {
  it('returns one scoped typed intent without mutating or inventing a full proposal', async () => {
    const result = await runConversation(request(), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });

    expect(result.ok).toBe(true);
    expect(result.proposals).toEqual([]);
    expect(result.actionIntents).toEqual([{
      id: expect.stringMatching(/^[a-f0-9]{64}$/),
      action: 'draft.update',
      source: 'provider_tool',
      subjectId: 'synthetic-client',
      scopeKey: result.snapshot?.scopeKey,
      surface: 'workout',
      resource: { kind: 'draft', id: 'synthetic-client', version: workspaceVersion },
      target: { durationMinutes: 35, equipment: ['dumbbells'] },
      reviewRequired: true,
    }]);
    expect(result.snapshot?.capabilities.find(item => item.key === 'actions')).toMatchObject({ status: 'available', reason: 'reviewable_draft_intent' });
  });

  it.each([
    ['wrong surface', request('food'), { action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }],
    ['unsupported equipment', request(), { action: 'draft.update', target: { durationMinutes: 35, equipment: ['barbell'] } }],
    ['injected field', request(), { action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'], html: '<script>apply()</script>' } }],
  ])('returns no intent for %s', async (_name, input, actionIntent) => {
    const result = await runConversation(input, {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider(actionIntent), offlineInterpretationReview: review,
    });
    expect(result.actionIntents).toEqual([]);
  });

  it.each([34, 36, 60])('rejects provider duration %i when the explicit message binds 35', async durationMinutes => {
    const result = await runConversation(request(), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.error?.code).toBe('invalid_output');
    expect(result.actionIntents).toEqual([]);
  });

  it('binds another explicit minute value without hardcoding the acceptance fixture', async () => {
    const result = await runConversation(request('workout', 'I have 45 minutes with dumbbells.'), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 45, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.actionIntents?.find(intent=>intent.action==='draft.update')?.target.durationMinutes).toBe(45);
  });

  it('preserves the canonical plan surface used by Workout build and review', async () => {
    const result = await runConversation(request('plan'), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.actionIntents).toEqual([expect.objectContaining({ action: 'draft.update', surface: 'plan' })]);
  });

  it.each([
    'Prepare something with dumbbells.',
    'I could do 35 or 45 minutes with dumbbells.',
    'I have 35 minutes.',
  ])('does not materialize an intent from absent or ambiguous explicit constraints: %s', async message => {
    const result = await runConversation(request('workout', message), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.actionIntents).toEqual([]);
  });

  it('clears the intent when authorization is revoked after generation', async () => {
    const result = await runConversation(request(), {
      actorId: 'synthetic-client', repository: fixtureRepository({ revokeAfterAuthorizations: 2 }), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.error?.code).toBe('forbidden');
    expect(result.actionIntents).toEqual([]);
  });

  it('does not expose a local draft intent across a professional subject boundary', async () => {
    const actorId = '00000000-0000-4000-8000-000000000001';
    const subjectId = '00000000-0000-4000-8000-000000000002';
    const repository = fixtureRepository({ nutrition: [], workouts: [], plans: [] });
    repository.authorize = async (actor, subject, signal) => {
      signal.throwIfAborted();
      if (actor !== actorId || subject !== subjectId) throw new Error('forbidden');
      return authorizeSubject(
        { id: actorId, role: 'coach', organizationIds: ['org'] },
        { id: subjectId, coachId: actorId, organizationIds: ['org'], timezone: 'America/Bogota', language: 'en' },
      );
    };
    const input = request();
    input.context!.clientId = subjectId;
    const result = await runConversation(input, {
      actorId, repository, mode: 'model', now: new Date('2026-09-08T00:00:00Z'), signal: new AbortController().signal,
      offlineConversationProvider: provider({ action: 'draft.update', target: { durationMinutes: 35, equipment: ['dumbbells'] } }),
      offlineInterpretationReview: review,
    });
    expect(result.ok).toBe(true);
    expect(result.snapshot?.access).toBe('assigned_professional');
    expect(result.actionIntents).toEqual([]);
  });

  it('returns no intent when the turn is cancelled', async () => {
    const controller = new AbortController();
    const stalled: OfflineConversationProvider = () => new Promise<never>(() => {});
    const pending = runConversation(request(), {
      actorId: 'synthetic-client', repository: fixtureRepository(), mode: 'model',
      now: new Date('2026-09-08T00:00:00Z'), signal: controller.signal,
      offlineConversationProvider: stalled, offlineInterpretationReview: review,
    });
    controller.abort();
    const result = await pending;
    expect(result.error?.code).toBe('cancelled');
    expect(result.actionIntents).toEqual([]);
  });
});
