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

const splitIds = (value: string | undefined): string[] =>
  (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

/**
 * Production cohort configuration. Requires the exact server opt-in flag, the
 * authoritative data source and a nonempty production allowlist. CI and
 * fixture deployments are never production-authorizable, and preview ids are
 * never consulted here.
 */
export function productionCohortConfigured(env: Record<string, string | undefined>): boolean {
  return env.COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED === '1'
    && env.COACH_ASSISTANT_DATA_SOURCE === 'authorized_records'
    && splitIds(env.COACH_ASSISTANT_PRODUCTION_USER_IDS).length > 0
    && env.CI !== 'true'
    && env.GITHUB_ACTIONS !== 'true';
}

/** Admits an authenticated actor only through the exact reviewed production cohort. */
export function productionCohortAdmitted(
  env: Record<string, string | undefined>,
  actorId: string,
): boolean {
  return env.VERCEL_ENV === 'production'
    && productionCohortConfigured(env)
    && splitIds(env.COACH_ASSISTANT_PRODUCTION_USER_IDS).includes(actorId);
}

/** Preview cohort admission for any non-production deployment. */
export function previewCohortAdmitted(
  env: Record<string, string | undefined>,
  actorId: string,
): boolean {
  return env.VERCEL_ENV !== 'production'
    && splitIds(env.COACH_ASSISTANT_PREVIEW_USER_IDS).includes(actorId);
}

const failure = (error: 'budget_blocked'): PilotBudgetResult => ({
  storage: 'database',
  ok: false,
  error,
});

/** Server composition gate for the protected preview cohort and the explicitly
 *  authorized production cohort. Paid AI, LIVE pilot and provider credentials
 *  remain independently required for either tier. */
export function sharedPilotRuntimeGate(
  env: Record<string, string | undefined>,
  actorId: string,
): Gate {
  if (
    env.COACH_ASSISTANT_ENABLED !== '1'
    || env.COACH_ASSISTANT_LIVE_PILOT_ENABLED !== '1'
    || env.TROPHE_ALLOW_PAID_AI !== '1'
  ) return { ok: false, error: 'disabled' };

  if (env.VERCEL_ENV === 'production') {
    if (!productionCohortConfigured(env)) return { ok: false, error: 'disabled' };
    if (!productionCohortAdmitted(env, actorId)) return { ok: false, error: 'forbidden' };
  } else if (env.VERCEL_ENV === 'preview') {
    if (!splitIds(env.COACH_ASSISTANT_PREVIEW_USER_IDS).includes(actorId)) return { ok: false, error: 'forbidden' };
  } else {
    return { ok: false, error: 'disabled' };
  }
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
