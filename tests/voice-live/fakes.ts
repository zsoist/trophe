/**
 * TEST-ONLY doubles. These are never production authority: they stand in for
 * AG1's persistent store, transport, and server watchdog.
 */
import type { ProviderSessionEvent } from '../../lib/voice-live/contracts';
import type {
  PersistentSessionBudgetStore,
  SessionAttemptBinding,
  SessionBudgetRecord,
  SessionBudgetResult,
} from '../../lib/voice-live/budget-adapter';
import type { LiveSessionTransport, OpenSessionResult, SessionDeadlineCapability } from '../../lib/voice-live/server-session';

export interface FakeStoreOptions {
  /** Simulate an accounting-blocked gate. */
  readonly blocked?: boolean;
}

export class FakeBudgetStore implements PersistentSessionBudgetStore {
  readonly calls: string[] = [];
  readonly rows = new Map<string, { record: SessionBudgetRecord }>();
  private readonly blocked: boolean;

  constructor(options: FakeStoreOptions = {}) {
    this.blocked = options.blocked ?? false;
  }

  record(attemptId: string): SessionBudgetRecord | undefined {
    return this.rows.get(attemptId)?.record;
  }

  async execute(command: unknown, signal: AbortSignal): Promise<unknown> {
    const cmd = command as { operation: string; binding: SessionAttemptBinding; usageSeconds?: number; finalChargeNanoUsd?: number };
    this.calls.push(cmd.operation);
    if (signal.aborted) return { storage: 'database', ok: false, error: 'cancelled' };
    const key = cmd.binding.attemptId;
    const existing = this.rows.get(key)?.record;
    const none = (record: SessionBudgetRecord): SessionBudgetResult => ({
      storage: 'database', ok: true, record, write: 'none', chargeDeltaNanoUsd: 0, dispatchGranted: false,
    });
    const write = (record: SessionBudgetRecord, delta: number, granted: boolean): SessionBudgetResult => ({
      storage: 'database', ok: true, record, write: existing ? 'update' : 'insert', chargeDeltaNanoUsd: delta, dispatchGranted: granted,
    });
    const put = (record: SessionBudgetRecord, delta: number, granted = false) => {
      this.rows.set(key, { record });
      return write(record, delta, granted);
    };

    switch (cmd.operation) {
      case 'reserve':
        if (this.blocked) return { storage: 'database', ok: false, error: 'budget_blocked' };
        if (existing) return none(existing);
        return put({ binding: cmd.binding, state: 'reserved', chargedNanoUsd: cmd.binding.reservedNanoUsd, usageSeconds: null }, cmd.binding.reservedNanoUsd);
      case 'claim_dispatch':
        if (!existing) return { storage: 'database', ok: false, error: 'not_found' };
        if (existing.state === 'dispatched') return none(existing);
        if (existing.state !== 'reserved') return { storage: 'database', ok: false, error: 'invalid_transition' };
        if (this.blocked) return { storage: 'database', ok: false, error: 'budget_blocked' };
        return put({ ...existing, state: 'dispatched' }, 0, true);
      case 'settle': {
        if (!existing) return { storage: 'database', ok: false, error: 'not_found' };
        if (existing.state === 'settled') return none(existing);
        const charge = cmd.finalChargeNanoUsd ?? 0;
        return put({ ...existing, state: 'settled', chargedNanoUsd: charge, usageSeconds: cmd.usageSeconds ?? null }, charge - existing.chargedNanoUsd);
      }
      case 'mark_unknown':
        if (!existing) return { storage: 'database', ok: false, error: 'not_found' };
        return put({ ...existing, state: 'unknown' }, 0);
      case 'release_unstarted':
        if (!existing) return { storage: 'database', ok: false, error: 'not_found' };
        if (existing.state !== 'reserved') return { storage: 'database', ok: false, error: 'invalid_transition' };
        return put({ ...existing, state: 'released', chargedNanoUsd: 0 }, -existing.chargedNanoUsd);
      case 'lookup':
        return existing ? none(existing) : { storage: 'database', ok: false, error: 'not_found' };
      default:
        return { storage: 'database', ok: false, error: 'invalid_input' };
    }
  }
}

export class FakeTransport implements LiveSessionTransport {
  readonly openedRequests: unknown[] = [];
  readonly closedSessionIds: string[] = [];
  private queue: ProviderSessionEvent[] = [];
  private closeDuringOpenError = false;
  openThrow = false;
  closeThrow = false;
  /** When true, `closeSession` never resolves and ignores its abort signal. */
  holdClose = false;
  answerSdp = 'v=0 answer';
  /** When true, `openSession` blocks until `releaseOpen()` (or abort). */
  holdOpen = false;
  /** When true with `holdOpen`, `openSession` ignores the abort signal (late success). */
  ignoreAbort = false;
  /** Number of times `openSession` was entered (before it resolved/rejected). */
  openAttempts = 0;
  private releaseOpenGate: (() => void) | null = null;

  /** Resolve a held `openSession`. */
  releaseOpen(): void {
    this.releaseOpenGate?.();
    this.releaseOpenGate = null;
  }

  push(...events: ProviderSessionEvent[]): void {
    this.queue.push(...events);
  }

  async openSession(request: { sdpOffer: string }, signal: AbortSignal): Promise<OpenSessionResult> {
    this.openAttempts += 1;
    if (this.openThrow) throw new Error('provider create failed');
    if (this.holdOpen) {
      const gate = new Promise<void>((resolve) => {
        this.releaseOpenGate = resolve;
      });
      if (!this.ignoreAbort) {
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new Error('open aborted'));
          signal.addEventListener('abort', () => reject(new Error('open aborted')), { once: true });
          void gate.then(resolve);
        });
      } else {
        await gate;
      }
    }
    this.openedRequests.push(request);
    void this.closeDuringOpenError;
    const queue = this.queue;
    this.queue = [];
    return {
      sessionId: '00000000-0000-4000-8000-0000000000aa',
      transportSdp: this.answerSdp,
      events: {
        async *[Symbol.asyncIterator]() {
          for (const event of queue) yield event;
        },
      },
    };
  }

  async closeSession(sessionId: string, _signal: AbortSignal): Promise<void> {
    if (this.closeThrow) throw new Error('close failed');
    this.closedSessionIds.push(sessionId);
    if (this.holdClose) await new Promise<void>(() => {});
  }
}

export class FakeDeadline implements SessionDeadlineCapability {
  readonly authority = 'server' as const;
  armedAtMs: number | null = null;
  cancelled = false;
  private onExpire: (() => void) | null = null;

  arm(deadlineMs: number, onExpire: () => void): { cancel(): void } {
    this.armedAtMs = deadlineMs;
    this.onExpire = onExpire;
    return { cancel: () => { this.cancelled = true; } };
  }

  expireNow(): void {
    this.onExpire?.();
  }
}

export const RATE_CONFIG = {
  perSecondRateNanoUsd: 1_000_000,
  pricingVersion: 'gpt-live-1-2026-09-01',
  closureMarginNanoUsd: 5_000_000,
  backendReserveNanoUsd: 10_000_000,
} as const;

export const CONTEXT = {
  actorId: '11111111-1111-4111-8111-111111111111',
  organizationId: null,
  pilotId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333',
  turnId: '44444444-4444-4444-8444-444444444444',
  agentRunId: '55555555-5555-4555-8555-555555555555',
} as const;

export const REQUEST_HASH = 'a'.repeat(64);
export const ATTEMPT_ID = '66666666-6666-4666-8666-666666666666';
