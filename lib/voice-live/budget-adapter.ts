/**
 * GPT-Live session budget adapter.
 *
 * The *persistent* ledger is owned by AG1 (the existing `pilot-budget` store).
 * This adapter only:
 *   - validates session bindings/commands strictly, fail-closed;
 *   - reserves *before* any connect;
 *   - grants dispatch only on an explicit, committed `dispatchGranted`;
 *   - settles idempotently from provider-trusted usage only;
 *   - retains the reservation (mark_unknown) when usage is missing/uncertain.
 *
 * No in-memory structure here holds or authorizes budget: every decision is
 * delegated to the injected persistent store. A test double passed by tests is
 * exactly that — a double — and is never used as production authority.
 */
import {
  LIVE_MODEL,
  isHex64,
  isUuid,
  isNonNegativeNanoUsd,
  isPositiveNanoUsd,
  type Parsed,
} from './contracts';

export const SESSION_ATTEMPT_KIND = 'voice' as const;
export const BACKEND_ATTEMPT_KIND = 'backend' as const;
export type SessionAttemptKind = typeof SESSION_ATTEMPT_KIND | typeof BACKEND_ATTEMPT_KIND;

export interface SessionAttemptBinding {
  readonly kind: SessionAttemptKind;
  readonly pilotId: string;
  readonly actorId: string;
  readonly attemptId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly requestHash: string;
  readonly model: typeof LIVE_MODEL;
  readonly pricingVersion: string;
  /** Total reserved nano-USD; must equal the derived reservation breakdown. */
  readonly reservedNanoUsd: number;
  readonly maxDurationSeconds: number;
}

export type SessionAttemptState = 'reserved' | 'dispatched' | 'unknown' | 'settled' | 'released';

export type SessionBudgetOperation =
  | 'reserve'
  | 'claim_dispatch'
  | 'settle'
  | 'mark_unknown'
  | 'release_unstarted'
  | 'lookup';

export type SessionBudgetCommand =
  | { operation: 'reserve'; binding: SessionAttemptBinding }
  | { operation: 'claim_dispatch'; binding: SessionAttemptBinding }
  | { operation: 'lookup'; binding: SessionAttemptBinding }
  | { operation: 'release_unstarted'; binding: SessionAttemptBinding }
  | { operation: 'mark_unknown'; binding: SessionAttemptBinding; reason: string }
  | {
      operation: 'settle';
      binding: SessionAttemptBinding;
      usageSeconds: number;
      finalChargeNanoUsd: number;
      providerTrusted: true;
    };

export type SessionBudgetError =
  | 'budget_blocked'
  | 'invalid_input'
  | 'not_found'
  | 'idempotency_conflict'
  | 'invalid_transition'
  | 'uncertain'
  | 'cancelled'
  | 'usage_not_provider_trusted'
  | 'charge_exceeds_reservation';

export interface SessionBudgetRecord {
  readonly binding: SessionAttemptBinding;
  readonly state: SessionAttemptState;
  readonly chargedNanoUsd: number;
  readonly usageSeconds: number | null;
}

export type SessionBudgetResult =
  | {
      readonly ok: true;
      readonly storage: 'database';
      readonly record: SessionBudgetRecord;
      readonly write: 'none' | 'insert' | 'update';
      readonly chargeDeltaNanoUsd: number;
      readonly dispatchGranted: boolean;
    }
  | { readonly ok: false; readonly storage: 'database'; readonly error: SessionBudgetError };

/** AG1-owned persistent, authorized transaction port. No success before commit. */
export interface PersistentSessionBudgetStore {
  execute(command: SessionBudgetCommand, signal: AbortSignal): Promise<unknown>;
}

function sameBinding(a: SessionAttemptBinding, b: SessionAttemptBinding): boolean {
  return (
    a.kind === b.kind &&
    a.pilotId === b.pilotId &&
    a.actorId === b.actorId &&
    a.attemptId === b.attemptId &&
    a.agentRunId === b.agentRunId &&
    a.turnId === b.turnId &&
    a.requestHash === b.requestHash &&
    a.model === b.model &&
    a.pricingVersion === b.pricingVersion &&
    a.reservedNanoUsd === b.reservedNanoUsd &&
    a.maxDurationSeconds === b.maxDurationSeconds
  );
}

export function parseSessionAttemptBinding(raw: unknown): Parsed<SessionAttemptBinding> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'binding_not_object' };
  const b = raw as Record<string, unknown>;
  if (b.kind !== SESSION_ATTEMPT_KIND && b.kind !== BACKEND_ATTEMPT_KIND) return { ok: false, error: 'binding_kind' };
  if (!isUuid(b.pilotId)) return { ok: false, error: 'binding_pilot_id' };
  if (!isUuid(b.actorId)) return { ok: false, error: 'binding_actor_id' };
  if (!isUuid(b.attemptId)) return { ok: false, error: 'binding_attempt_id' };
  if (!isUuid(b.agentRunId)) return { ok: false, error: 'binding_agent_run_id' };
  if (!isUuid(b.turnId)) return { ok: false, error: 'binding_turn_id' };
  if (!isHex64(b.requestHash)) return { ok: false, error: 'binding_request_hash' };
  if (b.model !== LIVE_MODEL) return { ok: false, error: 'binding_model' };
  if (typeof b.pricingVersion !== 'string' || b.pricingVersion.length === 0) return { ok: false, error: 'binding_pricing_version' };
  if (!isPositiveNanoUsd(b.reservedNanoUsd)) return { ok: false, error: 'binding_reserved' };
  if (typeof b.maxDurationSeconds !== 'number' || !Number.isSafeInteger(b.maxDurationSeconds) || b.maxDurationSeconds <= 0) {
    return { ok: false, error: 'binding_duration' };
  }
  return {
    ok: true,
    value: {
      kind: b.kind as SessionAttemptKind,
      pilotId: b.pilotId,
      actorId: b.actorId,
      attemptId: b.attemptId,
      agentRunId: b.agentRunId,
      turnId: b.turnId,
      requestHash: b.requestHash,
      model: LIVE_MODEL,
      pricingVersion: b.pricingVersion,
      reservedNanoUsd: b.reservedNanoUsd,
      maxDurationSeconds: b.maxDurationSeconds,
    },
  };
}

function parseStoreResult(raw: unknown): SessionBudgetResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.storage !== 'database') return null;
  if (r.ok === false) {
    const errors: SessionBudgetError[] = [
      'budget_blocked', 'invalid_input', 'not_found', 'idempotency_conflict',
      'invalid_transition', 'uncertain', 'cancelled',
    ];
    if (typeof r.error !== 'string' || !errors.includes(r.error as SessionBudgetError)) return null;
    return { ok: false, storage: 'database', error: r.error as SessionBudgetError };
  }
  if (r.ok !== true) return null;
  const recordRaw = (r.record ?? null) as Record<string, unknown> | null;
  if (recordRaw === null) return null;
  const states: SessionAttemptState[] = ['reserved', 'dispatched', 'unknown', 'settled', 'released'];
  if (typeof recordRaw.state !== 'string' || !states.includes(recordRaw.state as SessionAttemptState)) return null;
  if (!isNonNegativeNanoUsd(recordRaw.chargedNanoUsd)) return null;
  const usageRaw = recordRaw.usageSeconds;
  if (usageRaw !== null && (typeof usageRaw !== 'number' || !Number.isSafeInteger(usageRaw) || usageRaw < 0)) return null;
  // The store returns the full record; its `binding` field must re-parse.
  const bound = parseSessionAttemptBinding(recordRaw.binding);
  if (!bound.ok) return null;
  if (r.write !== 'none' && r.write !== 'insert' && r.write !== 'update') return null;
  if (typeof r.chargeDeltaNanoUsd !== 'number' || !Number.isSafeInteger(r.chargeDeltaNanoUsd)) return null;
  if (typeof r.dispatchGranted !== 'boolean') return null;
  return {
    ok: true,
    storage: 'database',
    record: { binding: bound.value, state: recordRaw.state as SessionAttemptState, chargedNanoUsd: recordRaw.chargedNanoUsd as number, usageSeconds: (usageRaw as number | null) ?? null },
    write: r.write,
    chargeDeltaNanoUsd: r.chargeDeltaNanoUsd,
    dispatchGranted: r.dispatchGranted,
  };
}

/**
 * Adapter: a missing/ambiguous/inconsistent store answer NEVER permits dispatch.
 */
export async function executeSessionBudgetCommand(
  raw: unknown,
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  const fail = (error: SessionBudgetError): SessionBudgetResult => ({ ok: false, storage: 'database', error });

  if (typeof raw !== 'object' || raw === null) return fail('invalid_input');
  const cmd = raw as Record<string, unknown>;
  const op = cmd.operation;
  if (typeof op !== 'string') return fail('invalid_input');
  const bound = parseSessionAttemptBinding(cmd.binding);
  if (!bound.ok) return fail('invalid_input');
  const binding = bound.value;

  if (op === 'settle') {
    if (cmd.providerTrusted !== true) return fail('usage_not_provider_trusted');
    if (typeof cmd.usageSeconds !== 'number' || !Number.isSafeInteger(cmd.usageSeconds) || cmd.usageSeconds < 0) {
      return fail('invalid_input');
    }
    if (!isNonNegativeNanoUsd(cmd.finalChargeNanoUsd)) return fail('invalid_input');
    // A measured overrun must reach the canonical ledger so it records the full
    // cost and blocks subsequent admission; rejecting it would hide known usage.
  }
  if (op === 'mark_unknown' && (typeof cmd.reason !== 'string' || cmd.reason.length === 0)) {
    return fail('invalid_input');
  }
  if (
    op !== 'reserve' && op !== 'claim_dispatch' && op !== 'settle' &&
    op !== 'mark_unknown' && op !== 'release_unstarted' && op !== 'lookup'
  ) {
    return fail('invalid_input');
  }

  if (signal.aborted) return fail('cancelled');
  try {
    const returned = await store.execute(structuredClone(raw) as SessionBudgetCommand, signal);
    if (signal.aborted) return fail('uncertain');
    const validated = parseStoreResult(returned);
    if (validated === null) return fail('uncertain');
    if (!validated.ok) return validated;
    if (!sameBinding(validated.record.binding, binding)) return fail('uncertain');
    if (
      validated.dispatchGranted &&
      (op !== 'claim_dispatch' || validated.record.state !== 'dispatched' || validated.write !== 'update')
    ) {
      return fail('uncertain');
    }
    if (validated.write === 'none' && validated.chargeDeltaNanoUsd !== 0) return fail('uncertain');
    return validated;
  } catch {
    return fail('uncertain');
  }
}

/**
 * Reserve before connect. `expectedReservedNanoUsd` is the derived reservation
 * total (rate × billable seconds + margins); a mismatch fails closed.
 */
export async function reserveSessionAttempt(
  binding: SessionAttemptBinding,
  expectedReservedNanoUsd: number,
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  if (binding.reservedNanoUsd !== expectedReservedNanoUsd) {
    return { ok: false, storage: 'database', error: 'invalid_input' };
  }
  return executeSessionBudgetCommand({ operation: 'reserve', binding }, store, signal);
}

/** Only an explicit committed grant opens the transport. */
export async function claimSessionDispatch(
  binding: SessionAttemptBinding,
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  return executeSessionBudgetCommand({ operation: 'claim_dispatch', binding }, store, signal);
}

/** Idempotent settle from provider-trusted cumulative usage only. */
export async function settleSessionAttempt(
  binding: SessionAttemptBinding,
  input: { usageSeconds: number; finalChargeNanoUsd: number; providerTrusted: boolean },
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  if (input.providerTrusted !== true) {
    return { ok: false, storage: 'database', error: 'usage_not_provider_trusted' };
  }
  return executeSessionBudgetCommand(
    { operation: 'settle', binding, usageSeconds: input.usageSeconds, finalChargeNanoUsd: input.finalChargeNanoUsd, providerTrusted: true },
    store,
    signal,
  );
}

/** Missing/uncertain outcome retains the full reservation. */
export async function markSessionAttemptUnknown(
  binding: SessionAttemptBinding,
  reason: string,
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  return executeSessionBudgetCommand({ operation: 'mark_unknown', binding, reason }, store, signal);
}

export async function releaseSessionUnstarted(
  binding: SessionAttemptBinding,
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  return executeSessionBudgetCommand({ operation: 'release_unstarted', binding }, store, signal);
}

/**
 * Backend/tool spend settles against a DISTINCT attempt row. It never reduces
 * or overwrites the voice-session reservation (backend is billed separately).
 */
export async function settleBackendAttempt(
  backendBinding: SessionAttemptBinding,
  input: { finalChargeNanoUsd: number; providerTrusted: boolean },
  store: PersistentSessionBudgetStore,
  signal: AbortSignal,
): Promise<SessionBudgetResult> {
  if (backendBinding.kind !== BACKEND_ATTEMPT_KIND) {
    return { ok: false, storage: 'database', error: 'invalid_input' };
  }
  if (input.providerTrusted !== true) {
    return { ok: false, storage: 'database', error: 'usage_not_provider_trusted' };
  }
  return executeSessionBudgetCommand(
    { operation: 'settle', binding: backendBinding, usageSeconds: 0, finalChargeNanoUsd: input.finalChargeNanoUsd, providerTrusted: true },
    store,
    signal,
  );
}
