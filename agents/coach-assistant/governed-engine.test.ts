import { describe, expect, it, vi } from 'vitest';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from './pilot-budget';
import { createGovernedCoachEngineBinding, verifyGovernedCoachEngineExecution } from './governed-engine';
import { runVerifiedChatFinalWithGovernedEngine } from './chat-final';
import { runConversationCandidate } from './conversation-candidate';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import type { GovernedCoachTransport } from './governed-transport';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const env = () => ({
  VERCEL_ENV: 'preview',
  COACH_ASSISTANT_ENABLED: '1',
  COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1',
  COACH_ASSISTANT_FOOD_ACTIONS_ENABLED: '1',
  COACH_ASSISTANT_PREVIEW_USER_IDS: id(1),
  TROPHE_ALLOW_PAID_AI: '1',
  OPENAI_API_KEY: 'test-only-placeholder',
});
const request = {
  version: 'coach-assistant.v2' as const,
  conversationId: id(2),
  turnId: id(3),
  message: 'Fueron 150 gramos, no 250',
  context: { surface: 'food' as const, includeScreen: true },
};

function repository() {
  const repo = fixtureRepository();
  repo.dataSource = 'authorized_records';
  repo.authorize = async () => ({ actorId: id(1), subjectId: id(1), organizationId: id(4), timezone: 'America/Bogota', language: 'es' });
  repo.plan = async () => ({ rows: [], truncated: false });
  repo.workouts = async () => ({ rows: [], truncated: false });
  repo.nutrition = async () => ({ rows: [{ id: id(5), userId: id(1), date: '2026-09-08', calories: 500, proteinG: 30 }], truncated: false });
  repo.personalContext = async () => ({ rows: [{ userId: id(1), preferences: defaultWorkoutPreferences, memories: [] }], truncated: false });
  return repo;
}

function fixture() {
  const records = new Map<string, PilotAttemptRecord>();
  const events: string[] = [];
  const store: PilotBudgetStore = {
    execute: vi.fn(async (command: PilotBudgetCommand) => {
      events.push(command.operation);
      const decision = decidePilotBudgetCommand({
        pilotId: command.binding.pilotId,
        budgetDay: '2026-09-08',
        capNanoUsd: 2_700_000_000,
        chargedNanoUsd: [...records.values()].reduce((sum, row) => sum + row.chargedNanoUsd, 0),
        turnAttemptCount: [...records.values()].filter(row => row.binding.turnId === command.binding.turnId).length,
        accountingBlocked: [...records.values()].some(row => row.accountingAlert),
        existing: records.get(command.binding.attemptId),
      }, command);
      if (decision.ok && decision.write !== 'none') records.set(command.binding.attemptId, structuredClone(decision.record));
      return { storage: 'database' as const, ...decision };
    }),
  };
  const transport = vi.fn<GovernedCoachTransport>(async input => {
    events.push('provider');
    const payload = JSON.parse(input.prompt) as { evidence: Array<{ id: string }> };
    return {
      requestId: 'req_private_pilot',
      responseModel: 'gpt-5.6-luna',
      output: {
        answer: 'Revisar el contexto anotado puede ayudar a organizar una conversación útil.',
        followUp: '¿Quieres revisar el cambio antes de confirmarlo?',
        evidenceRefs: payload.evidence.map(item => item.id),
        entityRefs: [],
        facts: payload.evidence.map(item => ({ kind: 'record_fact', evidenceId: item.id })),
        generalExplanationRefs: ['records_are_partial_view'],
        limitations: ['incomplete_records'],
        escalation: false,
        actionIntent: { action: 'food.quantity.update', target: { previousGrams: 250, grams: 150 } },
      },
      usage: { inputTokens: 1000, outputTokens: 200, reasoningTokens: 50 },
      latencyMs: 4,
      rawStatus: 200,
    };
  });
  const options = {
    actorId: id(1), repository: repository(), mode: 'model' as const,
    now: new Date('2026-09-08T18:00:00Z'), signal: new AbortController().signal,
    foodQuantityIntentsEnabled: true,
  };
  return { store, transport, options, events, records };
}

describe('governed LIVE-01 app engine', () => {
  it('uses durable admission before Luna and returns only a reviewable Food intent', async () => {
    const test = fixture();
    const engine = createGovernedCoachEngineBinding({ env: env(), actorId: id(1), persistentStore: test.store, transport: test.transport });
    const response = await engine.run(request, test.options);

    expect(response.ok).toBe(true);
    expect(response.output?.answer).toContain('Private Luna pilot:');
    expect(response.actionIntents).toEqual([expect.objectContaining({
      action: 'food.quantity.update', source: 'provider_tool', reviewRequired: true,
      target: { selection: 'authorized_food_entry', entryHintId: null, previousGrams: 250, grams: 150 },
    })]);
    expect(response.proposals).toEqual([]);
    expect(response.receipts).toEqual([]);
    expect(response.telemetry).toMatchObject({ model: 'gpt-5.6-luna', provider: 'openai', modelCalls: 1 });
    expect(response.telemetry.costUsd).toBeGreaterThan(0);
    expect(test.events).toEqual(['reserve', 'claim_dispatch', 'provider', 'settle']);
    expect(verifyGovernedCoachEngineExecution(engine, request, id(1), response)).toBe(true);
    expect(verifyGovernedCoachEngineExecution(engine, request, id(1), structuredClone(response))).toBe(false);
  });

  it('mints a durable chat final only from the exact governed binding', async () => {
    const test = fixture();
    const engine = createGovernedCoachEngineBinding({ env: env(), actorId: id(1), persistentStore: test.store, transport: test.transport });
    const scope = { actorId: id(1), subjectId: id(1), organizationId: id(4), actorRole: 'client' as const };
    const result = await runVerifiedChatFinalWithGovernedEngine(request, test.options, scope, engine);
    expect(result.response.ok).toBe(true);
    expect(result.final).not.toBeNull();
  });

  it('fails closed without Preview spend gates and rejects a forged boundary', async () => {
    const test = fixture();
    expect(() => createGovernedCoachEngineBinding({
      env: { ...env(), TROPHE_ALLOW_PAID_AI: '0' }, actorId: id(1), persistentStore: test.store, transport: test.transport,
    })).toThrow('governed_pilot_disabled');
    expect(test.transport).not.toHaveBeenCalled();

    const response = await runConversationCandidate(request, {
      ...test.options,
      offlineConversationProvider: test.transport,
      governedPilotBoundary: { kind: 'governed_live_pilot' },
      providerEvidence: 'provider_real',
    });
    expect(response.error?.code).toBe('budget_blocked');
    expect(test.transport).not.toHaveBeenCalled();
  });

  it('creates the live engine only after authentication, allowlist and mode selection', async () => {
    const test = fixture();
    const liveEnv = env();
    const engine = createGovernedCoachEngineBinding({ env: liveEnv, actorId: id(1), persistentStore: test.store, transport: test.transport });
    const factory = vi.fn(async () => engine);
    const deps = {
      env: liveEnv,
      guard: async () => ({ userId: id(1) }),
      createRepository: repository,
      createGovernedEngine: factory,
      createFoodService: async () => ({}) as never,
      now: () => test.options.now,
    };
    const createRequest = () => new Request('https://private.invalid/api/coach-assistant', {
      method: 'POST', body: JSON.stringify(request),
    });

    expect((await handleCoachRequest(createRequest(), { ...deps, guard: async () => new Response('', { status: 401 }) })).status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
    const response = await handleCoachRequest(createRequest(), deps);
    expect(response.status).toBe(200);
    expect((await response.json()).actionIntents[0]).toMatchObject({ action: 'food.quantity.update' });
    expect(factory).toHaveBeenCalledExactlyOnceWith(id(1));

    const conflicting = await handleCoachRequest(createRequest(), {
      ...deps,
      env: { ...liveEnv, COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1' },
    });
    expect(conflicting.status).toBe(503);
    expect((await conflicting.json()).error.code).toBe('budget_blocked');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
