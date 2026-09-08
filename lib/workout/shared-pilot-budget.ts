import type {
  PilotBudgetCommand,
  PilotBudgetResult,
  PilotBudgetStore,
} from '@/agents/coach-assistant/pilot-budget';

export const ASK_TROPHE_SHARED_PILOT_ID = 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229';

type GateError = 'disabled' | 'forbidden' | 'provider_unavailable';
type Gate = { ok: true } | { ok: false; error: GateError };
type SharedPilotBudgetRuntime =
  | { ok: false; error: GateError }
  | {
      ok: true;
      actorId: string;
      pilotId: typeof ASK_TROPHE_SHARED_PILOT_ID;
      store: PilotBudgetStore;
    };

const failure = (error: 'budget_blocked'): PilotBudgetResult => ({
  storage: 'database',
  ok: false,
  error,
});

/** Server composition gate for the one protected LIVE-01 preview cohort. */
export function sharedPilotRuntimeGate(
  env: Record<string, string | undefined>,
  actorId: string,
): Gate {
  if (
    env.VERCEL_ENV !== 'preview'
    || env.COACH_ASSISTANT_ENABLED !== '1'
    || env.COACH_ASSISTANT_LIVE_PILOT_ENABLED !== '1'
    || env.TROPHE_ALLOW_PAID_AI !== '1'
  ) return { ok: false, error: 'disabled' };

  const allowed = (env.COACH_ASSISTANT_PREVIEW_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(actorId)) return { ok: false, error: 'forbidden' };
  if (!(env.OPENAI_API_KEY ?? '').trim()) return { ok: false, error: 'provider_unavailable' };
  return { ok: true };
}

/**
 * Binds UI and evaluation composition roots to the same code-owned pilot id.
 * The id cannot come from request JSON or a deployment-specific environment value.
 */
export function createSharedPilotBudgetRuntime(
  env: Record<string, string | undefined>,
  actorId: string,
  persistentStore: PilotBudgetStore,
): SharedPilotBudgetRuntime {
  const gate = sharedPilotRuntimeGate(env, actorId);
  if (!gate.ok) return gate;
  const store: PilotBudgetStore = {
    execute(command: PilotBudgetCommand, signal: AbortSignal) {
      if (
        command.binding.pilotId !== ASK_TROPHE_SHARED_PILOT_ID
        || command.binding.actorId !== actorId
      ) return Promise.resolve(failure('budget_blocked'));
      return persistentStore.execute(command, signal);
    },
  };
  return { ok: true, actorId, pilotId: ASK_TROPHE_SHARED_PILOT_ID, store };
}
