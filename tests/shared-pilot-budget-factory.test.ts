import { describe, expect, it, vi } from 'vitest';
import type { PilotBudgetCommand, PilotBudgetStore } from '@/agents/coach-assistant/pilot-budget';
import { COACH_PRICING_VERSION } from '@/agents/coach-assistant/economics';
import {
  ASK_TROPHE_SHARED_PILOT_ID,
  createSharedPilotBudgetRuntime,
  sharedPilotRuntimeGate,
} from '@/lib/workout/shared-pilot-budget';

const actorId = '00000000-0000-4000-8000-000000000101';
const env = {
  VERCEL_ENV: 'preview',
  COACH_ASSISTANT_ENABLED: '1',
  COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1',
  COACH_ASSISTANT_PREVIEW_USER_IDS: actorId,
  TROPHE_ALLOW_PAID_AI: '1',
  OPENAI_API_KEY: 'test-only-placeholder',
};

const command = (pilotId = ASK_TROPHE_SHARED_PILOT_ID): PilotBudgetCommand => ({
  operation: 'lookup',
  binding: {
    pilotId,
    actorId,
    attemptId: '00000000-0000-4000-8000-000000000102',
    agentRunId: '00000000-0000-4000-8000-000000000103',
    turnId: '00000000-0000-4000-8000-000000000104',
    model: 'gpt-5.6-luna',
    pricingVersion: COACH_PRICING_VERSION,
    requestHash: 'a'.repeat(64),
    reservedNanoUsd: 4_400_000,
  },
});

describe('shared Ask Trophe pilot budget composition', () => {
  it('admits only the protected preview cohort with a private provider binding', () => {
    expect(sharedPilotRuntimeGate(env, actorId)).toEqual({ ok: true });
    expect(sharedPilotRuntimeGate({ ...env, VERCEL_ENV: 'production' }, actorId)).toEqual({ ok: false, error: 'disabled' });
    expect(sharedPilotRuntimeGate({ ...env, OPENAI_API_KEY: '' }, actorId)).toEqual({ ok: false, error: 'provider_unavailable' });
    expect(sharedPilotRuntimeGate({ ...env, COACH_ASSISTANT_PREVIEW_USER_IDS: '' }, actorId)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('pins every caller to one code-owned authority id', async () => {
    const execute = vi.fn(async () => ({ storage: 'database', ok: false, error: 'not_found' }));
    const runtime = createSharedPilotBudgetRuntime(env, actorId, { execute } as PilotBudgetStore);
    expect(runtime).toMatchObject({ ok: true, pilotId: ASK_TROPHE_SHARED_PILOT_ID, actorId });
    if (!runtime.ok) throw new Error('expected runtime');

    await expect(runtime.store.execute(command(), new AbortController().signal)).resolves.toMatchObject({ error: 'not_found' });
    expect(execute).toHaveBeenCalledTimes(1);

    await expect(runtime.store.execute(command('00000000-0000-4000-8000-000000000999'), new AbortController().signal))
      .resolves.toEqual({ storage: 'database', ok: false, error: 'budget_blocked' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
