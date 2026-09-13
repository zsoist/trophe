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
 * Preview-only cohort composition. The primary allowlist is managed as a
 * reviewed secret; the additive list lets QA admit a newly approved account
 * without reading, rewriting, or dropping unknown ids already in that secret.
 * This helper is intentionally never used by the production cohort path.
 */
const previewCohortIds = (env: Record<string, string | undefined>): string[] =>
  [...new Set([
    ...splitIds(env.COACH_ASSISTANT_PREVIEW_USER_IDS),
    ...splitIds(env.COACH_ASSISTANT_PREVIEW_EXTRA_USER_IDS),
  ])];

/**
 * Legacy isolated-engine and fixture switches. A production cohort must never
 * be composed with any of these, so rather than allow-listing the few names
 * that exist today we disqualify the whole `COACH_ASSISTANT_ISOLATED_*`
 * family (and voice fixture flags) whenever one is enabled. This fails closed
 * now and prevents a future isolated switch from silently reaching production.
 */
const LEGACY_ISOLATION_KEY_PATTERNS: readonly RegExp[] = [
  /^COACH_ASSISTANT_ISOLATED_/,
  /VOICE_FIXTURE_ENABLED$/,
];

const legacyIsolationOrFixtureRequested = (env: Record<string, string | undefined>): boolean =>
  Object.keys(env).some((key) =>
    env[key] === '1' && LEGACY_ISOLATION_KEY_PATTERNS.some((pattern) => pattern.test(key)));

/**
 * Production cohort configuration. Requires the exact server opt-in flag, the
 * authoritative data source and a nonempty production allowlist. CI and
 * fixture deployments are never production-authorizable, no legacy isolated or
 * voice-fixture switch may be enabled alongside it, and preview ids are never
 * consulted here.
 */
export function productionCohortConfigured(env: Record<string, string | undefined>): boolean {
  return env.COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED === '1'
    && env.COACH_ASSISTANT_DATA_SOURCE === 'authorized_records'
    && splitIds(env.COACH_ASSISTANT_PRODUCTION_USER_IDS).length > 0
    && env.CI !== 'true'
    && env.GITHUB_ACTIONS !== 'true'
    && !legacyIsolationOrFixtureRequested(env);
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
    && previewCohortIds(env).includes(actorId);
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
    if (!previewCohortIds(env).includes(actorId)) return { ok: false, error: 'forbidden' };
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
