import {
  executePilotBudgetCommand,
  pilotAttemptBindingSchema,
  type PilotBudgetCommand,
  type PilotBudgetStore,
} from '@/agents/coach-assistant/pilot-budget';
import { ASK_TROPHE_SHARED_PILOT_ID } from '@/lib/workout/shared-pilot-budget';
import { liveMeasuredChargeNanoUsd } from './pricing';
import type { PersistentSessionBudgetStore, SessionBudgetResult } from './budget-adapter';

/** Maps voice duration into the existing locked pilot transaction and aggregate.
 * Backend generations continue through the existing governed engine/token ledger.
 * Neither actor identity nor the pilot id may come from a browser payload.
 */
export function createCanonicalLiveBudgetAdapter(actorId: string, store: PilotBudgetStore): PersistentSessionBudgetStore {
  const failure = (error: 'invalid_input' | 'budget_blocked'): SessionBudgetResult => ({ ok: false, storage: 'database', error });
  return {
    async execute(command, signal): Promise<SessionBudgetResult> {
      const original = command.binding;
      if (original.kind !== 'voice') return failure('invalid_input');
      if (original.actorId !== actorId || original.pilotId !== ASK_TROPHE_SHARED_PILOT_ID) return failure('budget_blocked');
      const { kind: _kind, ...rawBinding } = original;
      void _kind;
      const parsed = pilotAttemptBindingSchema.safeParse(rawBinding);
      if (!parsed.success || parsed.data.model !== 'gpt-live-1') return failure('invalid_input');
      const binding = parsed.data;
      let mapped: PilotBudgetCommand;
      if (command.operation === 'settle') {
        if (command.providerTrusted !== true || liveMeasuredChargeNanoUsd(command.usageSeconds) !== command.finalChargeNanoUsd) return failure('invalid_input');
        mapped = { operation: 'settle', binding, usage: { durationSeconds: command.usageSeconds } };
      } else if (command.operation === 'mark_unknown') {
        mapped = { operation: 'mark_unknown', binding };
      } else {
        mapped = { operation: command.operation, binding };
      }
      const result = await executePilotBudgetCommand(mapped, store, signal);
      if (!result.ok) return result;
      const usage = result.record.usage;
      return {
        ...result,
        record: {
          binding: { ...binding, kind: 'voice' },
          state: result.record.state,
          chargedNanoUsd: result.record.chargedNanoUsd,
          usageSeconds: usage && 'durationSeconds' in usage ? usage.durationSeconds : null,
        },
      };
    },
  };
}
