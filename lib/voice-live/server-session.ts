/**
 * GPT-Live server-only session lifecycle.
 *
 * Guarantees implemented here:
 *   - reserve BEFORE connect, using AG1's injected persistent store;
 *   - dispatch (transport open) only on an explicit committed grant;
 *   - an enforced, injected *server-side* deadline capability is REQUIRED, and
 *     admission is refused if it cannot guarantee the session ends;
 *   - provider events are the only usage authority (client payloads ignored);
 *   - `session.usage.updated` is cumulative: the observed value REPLACES, never
 *     sums;
 *   - settle is idempotent and provider-trusted; a missing `session.closed`
 *     (or missing usage) retains the reservation via mark_unknown.
 *
 * Auth/identity is passed in as a trusted `AuthorizedLiveContext` derived by
 * AG1's route — never read from a request body. No provider call is made unless
 * AG1 wires a transport; the concrete adapter is a separate module.
 */
import {
  MAX_SESSION_DURATION_SECONDS,
  finalVoiceChargeNanoUsd,
  computeReservationBreakdown,
  parseAuthorizedLiveContext,
  parseSessionRateConfig,
  readUsageSeconds,
  readSessionClosed,
  rejectClientSuppliedUsage,
  type AuthorizedLiveContext,
  type CloseReason,
  type ProviderSessionEvent,
  type ReservationBreakdown,
  type SessionClosedSignal,
  type SessionRateConfig,
} from './contracts';
import {
  claimSessionDispatch,
  markSessionAttemptUnknown,
  releaseSessionUnstarted,
  reserveSessionAttempt,
  settleSessionAttempt,
  type PersistentSessionBudgetStore,
  type SessionAttemptBinding,
  type SessionBudgetError,
  type SessionBudgetResult,
} from './budget-adapter';

export interface OpenSessionRequest {
  readonly sdpOffer: string;
  readonly instructions?: string;
  readonly voice?: string;
  readonly store?: boolean;
}

/**
 * Bounded, *independent* cleanup/accounting signal. Never reuse the caller's
 * signal: a caller that already aborted must not be able to poison the
 * reconciliation of an already-reserved attempt.
 */
const CLEANUP_TIMEOUT_MS = 5_000;
function boundedCleanupSignal(ms: number = CLEANUP_TIMEOUT_MS): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const t = timer as unknown as { unref?: () => void };
  if (typeof t.unref === 'function') t.unref();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * Resolve once `promise` settles OR the bound elapses — whichever is first.
 * Never rejects and never leaves a rejection unobserved: a cleanup that hangs
 * (an adapter that ignores its abort signal) or fails still lets finalization
 * proceed so the reservation is reconciled instead of being left pending.
 */
function raceBounded(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), ms);
    const t = timer as unknown as { unref?: () => void };
    if (typeof t.unref === 'function') t.unref();
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

/**
 * Sentinel for a bounded store await that did NOT settle with a usable value
 * (timed out) or failed. Never a fabricated `SessionBudgetResult`: a caller
 * must treat it as UNCONFIRMED, never as success and never as a zero charge.
 */
const BOUNDED_TIMEOUT = Symbol('bounded_timeout');

/**
 * Bound an awaited store/ledger operation by `ms`, yielding its value on settle
 * or `BOUNDED_TIMEOUT` on timeout/rejection — whichever is first. Never rejects,
 * so a late rejection is observed (no unhandled rejection) and a late success
 * after the bound is discarded: it can neither settle twice nor trigger any
 * further ledger action or dispatch. Mirrors `raceBounded`, but keeps the value.
 */
async function raceBoundedResult<T>(promise: Promise<T>, ms: number): Promise<T | typeof BOUNDED_TIMEOUT> {
  return new Promise<T | typeof BOUNDED_TIMEOUT>((resolve) => {
    const timer = setTimeout(() => resolve(BOUNDED_TIMEOUT), ms);
    const t = timer as unknown as { unref?: () => void };
    if (typeof t.unref === 'function') t.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(BOUNDED_TIMEOUT);
      },
    );
  });
}

/**
 * Best-effort cancellation of a stream iterator. Deliberately NOT awaited: a
 * misbehaving `return()` (e.g. a QUIET sideband stream) must never block
 * shutdown, and a rejected `return()` must not become an unhandled rejection.
 */
function cancelIterator(iterator: AsyncIterator<ProviderSessionEvent>): void {
  try {
    const returned = iterator.return?.();
    if (returned && typeof returned.then === 'function') returned.then(undefined, () => {});
  } catch {
    // A synchronous throw from `return()` must not mask the settled outcome.
  }
}

/**
 * Give a buffered provider event one bounded event-loop turn to reach the
 * consumer before a server initiated close marks the runtime closed. This is
 * deliberately a single macrotask and never a retry or an unbounded wait.
 */
function yieldTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 0);
    const t = timer as unknown as { unref?: () => void };
    if (typeof t.unref === 'function') t.unref();
  });
}

export interface OpenSessionResult {
  readonly sessionId: string;
  readonly transportSdp: string;
  /** Provider event stream for this session (usage/lifecycle only). */
  readonly events: AsyncIterable<ProviderSessionEvent>;
}

/** Injected provider transport. Concrete OpenAI adapter is `openai-live-transport.ts`. */
export interface LiveSessionTransport {
  openSession(request: OpenSessionRequest, deadlineSignal: AbortSignal): Promise<OpenSessionResult>;
  closeSession(sessionId: string, signal: AbortSignal): Promise<void>;
}

/**
 * Injected server watchdog / close capability. `authority` MUST be `'server'`:
 * a browser/UI timer is not a budget control and is refused at admission.
 */
export interface SessionDeadlineCapability {
  readonly authority: 'server';
  arm(deadlineMs: number, onExpire: () => void): { cancel(): void };
}

export type RuntimeState = 'active' | 'closing' | 'closed';

export type OpenLiveSessionError =
  | 'invalid_context'
  | 'invalid_rate'
  | 'invalid_duration'
  | 'invalid_request_hash'
  | 'deadline_unavailable'
  | 'reservation_mismatch'
  | 'budget_blocked'
  | 'dispatch_not_granted'
  | 'transport_open_failed'
  | 'deadline_expired'
  | 'store_uncertain';

export interface OpenLiveSessionInput {
  readonly context: AuthorizedLiveContext;
  readonly requestHash: string;
  readonly sdpOffer: string;
  readonly instructions?: string;
  readonly voice?: string;
  readonly store?: boolean;
  /** Max session window in seconds (bounded, server-authoritative). */
  readonly maxDurationSeconds: number;
  /** Verified rate config from AG1. No guessed default. */
  readonly rateConfig: unknown;
  readonly budget: PersistentSessionBudgetStore;
  readonly transport: LiveSessionTransport;
  readonly deadline: SessionDeadlineCapability | undefined;
  readonly now: () => number;
  readonly signal: AbortSignal;
  /** Attempt id for this session attempt (code-owned, from AG1). */
  readonly attemptId: string;
  /**
   * Bounded, *independent* cleanup deadline (ms) for close/finalize races.
   * Defaults to `CLEANUP_TIMEOUT_MS`; injected so a non-yielding provider close
   * cannot outlive the server window. Never derived from `signal`.
   */
  readonly cleanupTimeoutMs?: number;
}

export type FinalizeResult =
  | { readonly status: 'settled'; readonly usageSeconds: number; readonly chargedNanoUsd: number; readonly confirmed: true }
  | { readonly status: 'unknown'; readonly retainedNanoUsd: number; readonly reason: string }
  | { readonly status: 'store_error'; readonly error: SessionBudgetError };

export interface LiveSessionRuntime {
  readonly sessionId: string;
  readonly transportSdp: string;
  readonly binding: SessionAttemptBinding;
  readonly breakdown: ReservationBreakdown;
  readonly deadlineMs: number;
  /**
   * Resolves once the runtime has entered `closed` (close initiated and the
   * watchdog cancelled). Lets an event loop stop waiting on a QUIET provider
   * stream instead of blocking on a non-yielding iterator.
   */
  readonly closed: Promise<void>;
  state(): RuntimeState;
  /** Provider-origin events only. `source:'client'` is rejected and never mutates usage. */
  observe(event: ProviderSessionEvent, source: 'provider' | 'client'): { accepted: boolean; reason?: string };
  close(reason: CloseReason): Promise<void>;
  /** Idempotent. Settles from provider-trusted usage or retains the reserve. */
  finalize(): Promise<FinalizeResult>;
}

export type OpenLiveSessionOutcome =
  | { readonly ok: true; readonly session: LiveSessionRuntime }
  | { readonly ok: false; readonly error: OpenLiveSessionError; readonly detail?: SessionBudgetError };

function makeBinding(args: {
  context: AuthorizedLiveContext;
  requestHash: string;
  rate: SessionRateConfig;
  maxDurationSeconds: number;
  attemptId: string;
  reservedNanoUsd: number;
}): SessionAttemptBinding {
  return {
    kind: 'voice',
    pilotId: args.context.pilotId,
    actorId: args.context.actorId,
    attemptId: args.attemptId,
    agentRunId: args.context.agentRunId,
    turnId: args.context.turnId,
    requestHash: args.requestHash,
    model: 'gpt-live-1',
    pricingVersion: args.rate.pricingVersion,
    reservedNanoUsd: args.reservedNanoUsd,
    maxDurationSeconds: args.maxDurationSeconds,
  };
}

/**
 * Admission + connect. Fails closed on any uncertainty and never reaches the
 * transport unless reserve and claim_dispatch both committed.
 */
export async function openLiveSession(input: OpenLiveSessionInput): Promise<OpenLiveSessionOutcome> {
  const context = parseAuthorizedLiveContext(input.context);
  if (!context.ok) return { ok: false, error: 'invalid_context' };
  if (typeof input.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.requestHash)) {
    return { ok: false, error: 'invalid_request_hash' };
  }
  const rate = parseSessionRateConfig(input.rateConfig);
  if (!rate.ok) return { ok: false, error: 'invalid_rate' };
  if (
    !Number.isSafeInteger(input.maxDurationSeconds) ||
    input.maxDurationSeconds <= 0 ||
    input.maxDurationSeconds > MAX_SESSION_DURATION_SECONDS
  ) {
    return { ok: false, error: 'invalid_duration' };
  }
  // Refuse admission before reserving if we cannot guarantee the session ends.
  if (!input.deadline || input.deadline.authority !== 'server') {
    return { ok: false, error: 'deadline_unavailable' };
  }
  const breakdown = computeReservationBreakdown(rate.value, input.maxDurationSeconds);
  if (!breakdown.ok) return { ok: false, error: 'invalid_duration' };

  const binding = makeBinding({
    context: context.value,
    requestHash: input.requestHash,
    rate: rate.value,
    maxDurationSeconds: input.maxDurationSeconds,
    attemptId: input.attemptId,
    reservedNanoUsd: breakdown.value.totalNanoUsd,
  });

  const reservation = await reserveSessionAttempt(binding, breakdown.value.totalNanoUsd, input.budget, input.signal);
  if (!reservation.ok) {
    if (reservation.error === 'uncertain') {
      // The persistent store may have COMMITTED a `reserved` row (with the full
      // charge) before losing its answer — e.g. a caller cancel racing the
      // write. Returning `store_uncertain` without reconciling would leave that
      // reservation charged but stuck in `reserved` forever (lost accounting).
      // The canonical ledger has NO `reserved -> unknown` transition; the only
      // legal reconciliation of a never-dispatched reservation is
      // `release_unstarted`, which itself refuses (`invalid_transition`) any row
      // that has moved on. Definite failures (budget_blocked) never wrote, so
      // they are not reconciled here.
      await bestEffortReleaseUnstarted(binding, input.budget);
    }
    return {
      ok: false,
      error: reservation.error === 'uncertain' ? 'store_uncertain' : 'budget_blocked',
      detail: reservation.error,
    };
  }

  const claim = await claimSessionDispatch(binding, input.budget, input.signal);
  if (!claim.ok || claim.dispatchGranted !== true) {
    // Reserved but never dispatched: release, best-effort, no automatic retry.
    await bestEffortReleaseUnstarted(binding, input.budget);
    return {
      ok: false,
      error: 'dispatch_not_granted',
      detail: claim.ok ? undefined : claim.error,
    };
  }

  // Deadline is armed BEFORE the paid create so a hanging create is bounded and
  // cannot outlive the server window. The armed watchdog also aborts the create
  // in flight; a create that resolves *after* expiry is closed and reconciled.
  const deadlineMs = input.now() + input.maxDurationSeconds * 1000;
  const openController = new AbortController();
  const expiry: { fired: boolean; handler: (() => void) | null } = { fired: false, handler: null };
  const watchdog = input.deadline.arm(deadlineMs, () => {
    expiry.fired = true;
    openController.abort();
    expiry.handler?.();
  });
  const createSignal = AbortSignal.any([input.signal, openController.signal]);

  let opened: OpenSessionResult;
  try {
    opened = await input.transport.openSession(
      { sdpOffer: input.sdpOffer, instructions: input.instructions, voice: input.voice, store: input.store },
      createSignal,
    );
  } catch {
    // Creation may already have billed the 15s initialization: retain reserve.
    watchdog.cancel();
    await bestEffortUnknown(binding, expiry.fired ? 'deadline_expired_before_open' : 'transport_open_failed', input.budget);
    return { ok: false, error: expiry.fired ? 'deadline_expired' : 'transport_open_failed' };
  }
  if (expiry.fired) {
    // Late success: the server must still close the provider session and retain
    // the full reserve (never report success past the enforced window).
    watchdog.cancel();
    await bestEffortClose(input.transport, opened.sessionId);
    await bestEffortUnknown(binding, 'deadline_expired_during_open', input.budget);
    return { ok: false, error: 'deadline_expired' };
  }

  return {
    ok: true,
    session: createRuntime({ input, rate: rate.value, binding, breakdown: breakdown.value, opened, deadlineMs, watchdog, expiry }),
  };
}

/**
 * Reconcile a reservation that was never dispatched.
 *
 * The canonical ledger exposes exactly one transition for this: the atomic,
 * conditional `release_unstarted`, which zeroes a row ONLY while it is still
 * `reserved` and answers `invalid_transition` for `dispatched`/`unknown`/
 * `settled`. That conditionality is the safety we need:
 *   - `reserved`   -> released, charge 0 (never dispatched => no cost, no
 *                     undercharge);
 *   - `dispatched` -> refused, row left untouched => the full charge is
 *                     PRESERVED whenever the dispatch outcome is unknown
 *                     (concurrent/duplicate claim, uncertain claim response);
 *   - `not_found`  -> no row was visible at release time; a late reserve could
 *                     still commit, so nothing is zeroed (never a false release);
 *   - otherwise    -> release unconfirmed; leave the row conservative (a
 *                     `reserved` row keeps its full charge). Never `unknown`
 *                     (illegal from `reserved`), never retried.
 *
 * Bounded and *independent* of the caller signal: the abort that brought us
 * here must not poison the reconciliation. The bound applies to the AWAITED
 * cleanup itself, not just to its signal: a store that ignores `AbortSignal`
 * must not be able to keep admission pending forever. No automatic retry/loop.
 */
async function bestEffortReleaseUnstarted(
  binding: SessionAttemptBinding,
  budget: PersistentSessionBudgetStore,
): Promise<void> {
  const { signal, clear } = boundedCleanupSignal();
  try {
    // `raceBounded` resolves on settle OR the bound and attaches a rejection
    // handler, so a store that ignores the abort neither hangs admission nor
    // produces an unhandled rejection when it fails late. A timed-out (or
    // failed) release is left UNCONFIRMED: any committed `reserved` row keeps
    // its full charge (conservative over-retention), and we never report the
    // row as released.
    await raceBounded(releaseSessionUnstarted(binding, budget, signal), CLEANUP_TIMEOUT_MS);
  } catch {
    // Unconfirmed release: a committed `reserved` row stays fully charged
    // (conservative over-retention) rather than being silently zeroed.
  } finally {
    clear();
  }
}

/** Reconciliation retains the full reserve; bounded and never uses a poisoned signal. */
async function bestEffortUnknown(
  binding: SessionAttemptBinding,
  reason: string,
  budget: PersistentSessionBudgetStore,
): Promise<void> {
  const { signal, clear } = boundedCleanupSignal();
  try {
    // Bound the AWAIT, not just the signal: a store that ignores `AbortSignal`
    // must not keep admission pending. A timeout leaves the row untouched
    // (still `reserved`, full charge), never a fabricated terminal state.
    await raceBounded(markSessionAttemptUnknown(binding, reason, budget, signal), CLEANUP_TIMEOUT_MS);
  } catch {
    // Retaining is best-effort here; the attempt stays reserved (never released).
  } finally {
    clear();
  }
}

async function bestEffortClose(transport: LiveSessionTransport, sessionId: string): Promise<void> {
  const { signal, clear } = boundedCleanupSignal();
  try {
    // Bound the AWAIT, not just the signal: a provider close that ignores abort
    // must not keep admission pending. A timeout still retains the reserve.
    await raceBounded(transport.closeSession(sessionId, signal), CLEANUP_TIMEOUT_MS);
  } catch {
    // A late success we cannot close still retains the reserve (no fabricated usage).
  } finally {
    clear();
  }
}

function createRuntime(args: {
  input: OpenLiveSessionInput;
  rate: SessionRateConfig;
  binding: SessionAttemptBinding;
  breakdown: ReservationBreakdown;
  opened: OpenSessionResult;
  deadlineMs: number;
  watchdog: { cancel(): void };
  expiry: { fired: boolean; handler: (() => void) | null };
}): LiveSessionRuntime {
  const { input, binding, breakdown, opened, deadlineMs, watchdog, expiry } = args;
  let state: RuntimeState = 'active';
  let cumulativeSeconds = 0;
  let hasValidUsage = false;
  let closedSignal: SessionClosedSignal | null = null;
  let settlePromise: Promise<FinalizeResult> | null = null;
  let closePromise: Promise<void> | null = null;
  const cleanupTimeoutMs = input.cleanupTimeoutMs ?? CLEANUP_TIMEOUT_MS;

  let resolveClosed: () => void = () => {};
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  // A caller abort that lands *after* the transport opened must stop the
  // session; this listener is registered synchronously with the runtime (no
  // await gap) so an abort between open-return and here is never missed.
  function onCallerAbort(): void {
    void runtime.close('connection_lost').catch(() => {});
  }
  function detachCallerAbort(): void {
    input.signal.removeEventListener('abort', onCallerAbort);
  }

  function enterClosed(): void {
    if (state === 'closed') return;
    state = 'closed';
    watchdog.cancel();
    resolveClosed();
  }

  const runtime: LiveSessionRuntime = {
    sessionId: opened.sessionId,
    transportSdp: opened.transportSdp,
    binding,
    breakdown,
    deadlineMs,
    closed: closedPromise,
    state: () => state,
    observe(event, source) {
      if (source !== 'provider') {
        // Client event payload is not a usage authority.
        return { accepted: false, reason: rejectClientSuppliedUsage().reason };
      }
      if (state === 'closed' && readSessionClosed(event) === null) return { accepted: false, reason: 'session_closed' };
      // Cumulative seconds REPLACE the observed value (never sum).
      // Only an explicit, well-formed provider reading is usage authority; a
      // reading of `0` is valid, a missing/malformed one is NOT inferred as 0.
      const reading = readUsageSeconds(event);
      if (reading.hasUsage) {
        hasValidUsage = true;
        if (reading.seconds > cumulativeSeconds) cumulativeSeconds = reading.seconds;
      }
      const closed = readSessionClosed(event);
      if (closed) {
        closedSignal = closed;
        enterClosed();
        void runtime.finalize().catch(() => {});
      }
      return { accepted: true };
    },
    async close(reason) {
      void reason;
      // Idempotent: concurrent/duplicate closes (caller abort, deadline,
      // connection loss) share one transport close and one reconciliation.
      if (closePromise) return closePromise;
      closePromise = (async () => {
        if (state === 'closed') return;
        if (state === 'active') state = 'closing';
        // Bounded and *independent* of the caller signal: an adapter that
        // ignores abort cannot hang shutdown. On timeout or error we still
        // reach `closed` and finalize, so the reserve is reconciled.
        const { signal, clear } = boundedCleanupSignal(cleanupTimeoutMs);
        try {
          await raceBounded(input.transport.closeSession(opened.sessionId, signal), cleanupTimeoutMs);
        } finally {
          clear();
        }
        // The provider can buffer its own session.closed while closeSession is
        // resolving. Let the already-delivered event be observed first so its
        // final cumulative usage can settle the attempt. A quiet provider loses
        // this single turn and still follows the conservative unknown path.
        await yieldTurn();
        enterClosed();
        await runtime.finalize();
      })();
      return closePromise;
    },
    async finalize() {
      if (settlePromise) return settlePromise;
      settlePromise = (async (): Promise<FinalizeResult> => {
        try {
          // Usage is settled ONLY from a provider `session.closed` AND at least one
          // explicit provider usage reading. Anything else retains the reserve.
          const unconfirmedReason = !closedSignal
            ? expiry.fired
              ? 'deadline_without_confirmation'
              : 'no_session_closed'
            : 'closed_without_valid_usage';
          if (!closedSignal || !hasValidUsage) {
            const { signal, clear } = boundedCleanupSignal(cleanupTimeoutMs);
            let retained: SessionBudgetResult | typeof BOUNDED_TIMEOUT;
            try {
              // Bound the AWAIT, not just the signal: a store that ignores
              // `AbortSignal` must not keep finalization (and therefore
              // `close`/End) pending forever.
              retained = await raceBoundedResult(
                markSessionAttemptUnknown(binding, unconfirmedReason, input.budget, signal),
                cleanupTimeoutMs,
              );
            } finally {
              clear();
            }
            // Unconfirmed retention (timeout or a lost/uncertain answer) keeps
            // the FULL reserve and is reported as `unknown`: never settled,
            // never a zero charge, no second ledger action, no retry.
            if (retained === BOUNDED_TIMEOUT) {
              return { status: 'unknown', retainedNanoUsd: binding.reservedNanoUsd, reason: 'usage_unconfirmed' };
            }
            if (!retained.ok && retained.error !== 'uncertain') {
              return { status: 'store_error', error: retained.error };
            }
            return { status: 'unknown', retainedNanoUsd: binding.reservedNanoUsd, reason: 'usage_unconfirmed' };
          }
          const charge = finalVoiceChargeNanoUsd(args.rate, cumulativeSeconds);
          if (!charge.ok) return { status: 'store_error', error: 'uncertain' };
          // Independent bounded cleanup signal: never the (possibly aborted)
          // caller signal, which would poison reconciliation.
          const { signal, clear } = boundedCleanupSignal(cleanupTimeoutMs);
          let settled: SessionBudgetResult | typeof BOUNDED_TIMEOUT;
          try {
            settled = await raceBoundedResult(
              settleSessionAttempt(
                binding,
                { usageSeconds: cumulativeSeconds, finalChargeNanoUsd: charge.value, providerTrusted: true },
                input.budget,
                signal,
              ),
              cleanupTimeoutMs,
            );
          } finally {
            clear();
          }
          // The settlement could not be confirmed within the bound. Never claim
          // `settled`/`confirmed:true` and never assume zero: report the FULL
          // reserve retained as `unknown` (conservative), with no second ledger
          // action and no retry. A late settlement answer is discarded above.
          if (settled === BOUNDED_TIMEOUT) {
            return { status: 'unknown', retainedNanoUsd: binding.reservedNanoUsd, reason: 'settlement_unconfirmed' };
          }
          if (!settled.ok) return { status: 'store_error', error: settled.error };
          return {
            status: 'settled',
            usageSeconds: cumulativeSeconds,
            chargedNanoUsd: settled.record.chargedNanoUsd,
            confirmed: true,
          };
        } finally {
          // Listener removed once finalized so a later abort cannot re-close a
          // settled attempt.
          detachCallerAbort();
        }
      })();
      return settlePromise;
    },
  };
  input.signal.addEventListener('abort', onCallerAbort);
  // An abort that raced (or was ignored by) the create is honoured here.
  if (input.signal.aborted) onCallerAbort();
  // The watchdog was armed before the create; now that the runtime exists it can
  // drive a server-side close if the deadline expires mid-session.
  expiry.handler = () => {
    void runtime.close('expired');
  };
  return runtime;
}

/**
 * Feed provider events from the transport into a runtime. Integration helper:
 * the caller owns the loop; runtime.observe enforces authority/accounting.
 */
export async function consumeProviderEvents(
  runtime: LiveSessionRuntime,
  events: AsyncIterable<ProviderSessionEvent>,
): Promise<void> {
  const iterator = events[Symbol.asyncIterator]();
  try {
    for (;;) {
      // Race the next provider event against closure so a QUIET/non-yielding
      // stream (or an abort/logout) stops the loop promptly instead of blocking
      // until an event or the session deadline.
      const outcome = await Promise.race([
        iterator.next().then((r) => ({ kind: 'next' as const, r })),
        runtime.closed.then(() => ({ kind: 'closed' as const })),
      ]);
      if (outcome.kind === 'closed') break;
      if (outcome.r.done) break;
      runtime.observe(outcome.r.value, 'provider');
      if (runtime.state() === 'closed') break;
    }
    // Stream ended without a provider `session.closed`: usage is unconfirmed.
    if (runtime.state() !== 'closed') await runtime.close('connection_lost');
  } catch {
    // A stream error/abort must not leak the reservation: close and reconcile,
    // using the runtime's own bounded, independent close signal.
    if (runtime.state() !== 'closed') {
      try {
        await runtime.close('connection_lost');
      } catch {
        await runtime.finalize();
      }
    }
  } finally {
    // Cancel iteration without waiting forever on a non-settling `return()`.
    cancelIterator(iterator);
  }
}
