import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createGovernedCoachTransport } from '@/agents/coach-assistant/governed-transport';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from '@/agents/coach-assistant/pilot-budget';
import { taskPolicies } from '@/agents/router/policies';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('Reserve Luna claim-denial reconciliation', () => {
  const request = (promptVersion: string) => ({
    policy: { ...taskPolicies.coach_assistant, promptVersion },
    signal: new AbortController().signal, system: 's', prompt: 'p', schema: {},
    validator: z.object({ ok: z.boolean() }), maxTokens: 2000, maxAttempts: 1,
  });

  it('releases a committed reservation when claim is definitely denied before provider dispatch', async () => {
    let record: PilotAttemptRecord | undefined;
    const operations: PilotBudgetCommand['operation'][] = [];
    const store: PilotBudgetStore = {
      async execute(command) {
        operations.push(command.operation);
        if (command.operation === 'claim_dispatch') return { storage: 'database', ok: false, error: 'budget_blocked' };
        const decision = decidePilotBudgetCommand({
          pilotId: id(1), budgetDay: '2026-09-14', capNanoUsd: 3_000_000_000,
          chargedNanoUsd: record?.chargedNanoUsd ?? 0, turnAttemptCount: record ? 1 : 0,
          accountingBlocked: false, existing: record,
        }, command);
        if (decision.ok && decision.write !== 'none') record = decision.record;
        return { storage: 'database', ...decision };
      },
    };
    const provider = vi.fn(async () => ({
      output: { ok: true }, responseModel: 'gpt-5.6-luna', requestId: 'req_fixture', rawStatus: 200,
      latencyMs: 1, usage: { inputTokens: 100, outputTokens: 20 },
    }));
    const governed = createGovernedCoachTransport({
      pilotId: id(1), actorId: id(2), turnId: id(3), identityParts: ['claim-release-regression'],
      mode: 'injected', store, signal: new AbortController().signal, transport: provider,
      allowedPromptVersions: ['claim-release-v1'],
    });
    await expect(governed.transport(request('claim-release-v1'))).rejects.toThrow('budget_blocked');
    expect(provider).not.toHaveBeenCalled();
    expect(operations).toEqual(['reserve', 'claim_dispatch', 'release_unstarted']);
    expect(record).toMatchObject({ state: 'released', chargedNanoUsd: 0 });
  });

  it('preserves a full hold when reserve outcome is uncertain', async () => {
    let record: PilotAttemptRecord | undefined;
    const operations: PilotBudgetCommand['operation'][] = [];
    const store: PilotBudgetStore = {
      async execute(command) {
        operations.push(command.operation);
        const decision = decidePilotBudgetCommand({
          pilotId: id(1), budgetDay: '2026-09-14', capNanoUsd: 3_000_000_000,
          chargedNanoUsd: record?.chargedNanoUsd ?? 0, turnAttemptCount: record ? 1 : 0,
          accountingBlocked: false, existing: record,
        }, command);
        if (decision.ok && decision.write !== 'none') record = decision.record;
        if (command.operation === 'reserve') throw new Error('answer_lost_after_commit');
        return { storage: 'database', ...decision };
      },
    };
    const provider = vi.fn(async () => ({
      output: { ok: true }, responseModel: 'gpt-5.6-luna', requestId: 'req_fixture', rawStatus: 200,
      latencyMs: 1, usage: { inputTokens: 100, outputTokens: 20 },
    }));
    const governed = createGovernedCoachTransport({
      pilotId: id(1), actorId: id(2), turnId: id(3), identityParts: ['reserve-release-regression'],
      mode: 'injected', store, signal: new AbortController().signal, transport: provider,
      allowedPromptVersions: ['reserve-release-v1'],
    });
    await expect(governed.transport(request('reserve-release-v1'))).rejects.toThrow('budget_blocked');
    expect(provider).not.toHaveBeenCalled();
    expect(operations).toEqual(['reserve']);
    expect(record).toMatchObject({ state: 'reserved', chargedNanoUsd: 4_400_000 });
  });
});
