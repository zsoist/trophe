import type {
  WorkoutSetOperation,
  WorkoutSetProposal,
  WorkoutSetRefresh,
  WorkoutSetResult,
  WorkoutSetSnapshot,
  WorkoutSetValues,
} from '@/agents/coach-assistant/set-contracts';
import type { CoachReceipt } from '@/agents/coach-assistant/contracts';

export type WorkoutSetTransport = (operation: WorkoutSetOperation, signal: AbortSignal) => Promise<WorkoutSetResult>;

export interface WorkoutSetState {
  intentId: string | null;
  targetReps: number | null;
  snapshot: WorkoutSetSnapshot | null;
  proposal: WorkoutSetProposal | null;
  receipt: CoachReceipt | null;
  refresh: WorkoutSetRefresh | null;
  pending: boolean;
  uncertain: boolean;
  error: string | null;
}

const empty = (): WorkoutSetState => ({
  intentId: null,
  targetReps: null,
  snapshot: null,
  proposal: null,
  receipt: null,
  refresh: null,
  pending: false,
  uncertain: false,
  error: null,
});

const sameValues = (left: WorkoutSetValues, right: WorkoutSetValues) =>
  left.sessionId === right.sessionId
  && left.exerciseId === right.exerciseId
  && left.exerciseName === right.exerciseName
  && left.setNumber === right.setNumber
  && left.reps === right.reps
  && left.weightKg === right.weightKg
  && left.rpe === right.rpe
  && left.isWarmup === right.isWarmup
  && left.isPr === right.isPr;

const atLeastVersion = (actual: string, expected: string) => {
  if (!/^\d+$/.test(actual) || !/^\d+$/.test(expected)) return actual === expected;
  return BigInt(actual) >= BigInt(expected);
};

/** Owns one server-selected set correction. An apply envelope survives every
 * cancellation or transport failure until its original actionId is resolved. */
export class WorkoutSetController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private conversationId = '';
  private clientId?: string;
  private action: Extract<WorkoutSetOperation, { operation: 'set.apply' }> | null = null;

  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: WorkoutSetState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID(), ...(this.clientId ? { clientId: this.clientId } : {}) }; }

  reset() {
    this.generation += 1;
    this.active?.abort();
    this.active = null;
    this.action = null;
    this.conversationId = '';
    this.clientId = undefined;
    this.publish(empty());
  }

  moveConversation() {
    if (this.active) this.cancel();
    if (!this.action) this.reset();
  }

  cancel() {
    if (!this.active) return;
    this.generation += 1;
    this.active.abort();
    this.active = null;
    const unresolved = Boolean(this.action && !this.state.receipt);
    this.publish({ ...this.state, pending: false, uncertain: unresolved, error: unresolved ? 'uncertain' : 'cancelled' });
  }

  dismiss() {
    if (!this.state.pending && !this.action) this.reset();
  }

  async activate(intentId: string, conversationId: string, reps: number, transport: WorkoutSetTransport, clientId?: string) {
    if (this.action || this.state.pending) return false;
    if (this.state.intentId === intentId) return true;
    if (!/^[a-f0-9]{64}$/.test(intentId) || !Number.isInteger(reps) || reps <= 0) return false;
    this.reset();
    this.conversationId = conversationId;
    this.clientId = clientId;
    this.publish({ ...empty(), intentId, targetReps: reps });
    const resolved = await this.call({ ...this.header(), operation: 'set.resolve' } as WorkoutSetOperation, transport, false);
    if (!resolved?.ok || !('snapshot' in resolved)) return false;
    this.publish({ ...this.state, snapshot: resolved.snapshot, error: null });
    return this.propose(transport);
  }

  async retry(transport: WorkoutSetTransport) {
    const snapshot = this.state.snapshot;
    if (!snapshot || this.state.pending || this.action) return false;
    const read = await this.call({ ...this.header(), operation: 'set.read', setId: snapshot.setId }, transport, false);
    if (!read?.ok || !('snapshot' in read) || read.snapshot.setId !== snapshot.setId) return false;
    this.publish({ ...this.state, snapshot: read.snapshot, proposal: null, receipt: null, refresh: null, error: null });
    return this.propose(transport);
  }

  private async propose(transport: WorkoutSetTransport) {
    const snapshot = this.state.snapshot;
    const reps = this.state.targetReps;
    if (!snapshot || reps === null || this.state.pending || this.action) return false;
    const operation: WorkoutSetOperation = { ...this.header(), operation: 'set.propose', setId: snapshot.setId, resourceVersion: snapshot.version, after: { reps } };
    const result = await this.call(operation, transport, false);
    if (!result?.ok || !('proposal' in result)) return false;
    const proposal = result.proposal;
    const expectedVersion = (proposal as WorkoutSetProposal & { expectedVersion?: string }).expectedVersion;
    if (proposal.action !== 'workout.set.reps.update' || proposal.resource.id !== snapshot.setId
      || proposal.resource.version !== snapshot.version || proposal.precondition !== snapshot.version
      || expectedVersion !== snapshot.version || proposal.reviewRequired !== true
      || !sameValues(proposal.before, snapshot) || proposal.after.reps !== reps
      || !sameValues({ ...proposal.after, reps: proposal.before.reps }, proposal.before)) {
      this.publish({ ...this.state, error: 'invalid_proposal' });
      return false;
    }
    this.publish({ ...this.state, proposal, error: null });
    return true;
  }

  async apply(transport: WorkoutSetTransport) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.action || this.state.receipt) return false;
    if (Date.parse(proposal.expiresAt) <= Date.now()) {
      this.publish({ ...this.state, error: 'expired' });
      return false;
    }
    this.action = {
      ...this.header(), operation: 'set.apply', setId: proposal.resource.id,
      proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(),
      resourceVersion: proposal.resource.version, reviewed: true,
    };
    const result = await this.call(this.action, transport, true);
    return this.acceptReceipt(result, transport);
  }

  async check(transport: WorkoutSetTransport) {
    const action = this.action;
    if (!action || this.state.pending) return false;
    const result = await this.call({ ...this.header(), operation: 'set.receipt', setId: action.setId, actionId: action.actionId }, transport, true);
    if (result && !result.ok && result.error === 'not_found') {
      // A missing receipt proves no durable outcome at lookup time. Replay the
      // exact reviewed envelope and actionId so the server can apply once or
      // return the receipt from a concurrent first attempt.
      const replay = await this.call(action, transport, true);
      return this.acceptReceipt(replay, transport);
    }
    return this.acceptReceipt(result, transport);
  }

  private async acceptReceipt(result: WorkoutSetResult | null, transport: WorkoutSetTransport) {
    const action = this.action;
    if (!action || !result) return false;
    if (!result.ok) {
      const uncertain = result.error === 'uncertain' || result.error === 'cancelled' || result.error === 'not_found';
      if (!uncertain) this.action = null;
      this.publish({ ...this.state, uncertain, error: result.error });
      return false;
    }
    if (!('receipt' in result) || result.receipt.status !== 'applied'
      || result.receipt.actionId !== action.actionId || result.receipt.proposalId !== action.proposalId
      || !result.refresh || result.refresh.setId !== action.setId
      || result.refresh.previousVersion !== action.resourceVersion
      || result.refresh.version !== result.receipt.resourceVersion) {
      this.publish({ ...this.state, uncertain: true, error: 'invalid_receipt' });
      return false;
    }
    this.publish({ ...this.state, receipt: result.receipt, refresh: result.refresh, uncertain: false, error: null });
    const fresh = await this.call({ ...this.header(), operation: 'set.read', setId: action.setId }, transport, true);
    const expectedReps = this.state.proposal?.after.reps;
    if (!fresh?.ok || !('snapshot' in fresh) || fresh.snapshot.setId !== action.setId
      || fresh.snapshot.sessionId !== result.refresh.sessionId || fresh.snapshot.exerciseId !== result.refresh.exerciseId
      || !atLeastVersion(fresh.snapshot.version, result.refresh.version) || fresh.snapshot.reps !== expectedReps) {
      this.publish({ ...this.state, uncertain: false, error: 'refresh_failed' });
      return false;
    }
    this.action = null;
    this.publish({ ...this.state, snapshot: fresh.snapshot, proposal: null, pending: false, uncertain: false, error: null });
    return true;
  }

  private async call(operation: WorkoutSetOperation, transport: WorkoutSetTransport, writeStarted: boolean): Promise<WorkoutSetResult | null> {
    const abort = new AbortController();
    const generation = ++this.generation;
    this.active = abort;
    this.publish({ ...this.state, pending: true, error: null });
    const timer = setTimeout(() => abort.abort(), 45_000);
    try {
      const result = await transport(operation, abort.signal);
      if (generation !== this.generation || abort.signal.aborted) return null;
      this.publish({ ...this.state, pending: false, error: result.ok ? null : result.error });
      return result;
    } catch {
      if (generation !== this.generation) return null;
      const uncertain = writeStarted && Boolean(this.action);
      this.publish({ ...this.state, pending: false, uncertain, error: uncertain ? 'uncertain' : 'failed' });
      return null;
    } finally {
      clearTimeout(timer);
      if (generation === this.generation) this.active = null;
    }
  }
}
