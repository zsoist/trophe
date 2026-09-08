import type { MeasurementValues, ProgressResult, ProgressSnapshot, MeasurementProposal } from '@/agents/coach-assistant/progress-contracts';
import type { ProgressOperation } from '@/agents/coach-assistant/progress-actions';

export type ProgressTransport = (operation: ProgressOperation, signal: AbortSignal) => Promise<ProgressResult>;
type Receipt = Extract<ProgressResult, { receipt: unknown }>['receipt'];
export interface ProgressState { subjectId: string | null; snapshot: ProgressSnapshot | null; proposal: MeasurementProposal | null; receipt: Receipt | null; days: 30 | 90 | 365; pending: boolean; uncertain: boolean; error: string | null; }
const empty = (): ProgressState => ({ subjectId: null, snapshot: null, proposal: null, receipt: null, days: 90, pending: false, uncertain: false, error: null });
const exactValues = (left: MeasurementValues, right: MeasurementValues) => left.measuredDate === right.measuredDate && left.weightKg === right.weightKg && left.bodyFatPct === right.bodyFatPct && left.waistCm === right.waistCm;
const validValues = (value: MeasurementValues) => /^\d{4}-\d{2}-\d{2}$/.test(value.measuredDate) && Number.isFinite(value.weightKg) && value.weightKg > 0 && (value.bodyFatPct === null || Number.isFinite(value.bodyFatPct) && value.bodyFatPct >= 0 && value.bodyFatPct <= 100) && (value.waistCm === null || Number.isFinite(value.waistCm) && value.waistCm > 0);

/** One reviewed measurement action remains bound to its originating conversation
 * until receipt lookup and canonical readback complete. */
export class ProgressController {
  private state = empty(); private listeners = new Set<() => void>(); private active: AbortController | null = null;
  private generation = 0; private deadline: ReturnType<typeof setTimeout> | null = null; private conversationId = '';
  private deferredConversationId: string | null = null; private action: Extract<ProgressOperation, { operation: 'measurement.apply' }> | null = null;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: ProgressState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clearDeadline() { if (this.deadline !== null) clearTimeout(this.deadline); this.deadline = null; }
  reset() { this.clearDeadline(); this.generation++; this.active?.abort(); this.active = null; this.action = null; this.deferredConversationId = null; this.publish(empty()); }
  select(subjectId: string, conversationId: string) { if (this.action && !this.state.receipt) return false; this.reset(); this.conversationId = conversationId; this.publish({ ...empty(), subjectId }); return true; }
  moveConversation(conversationId: string) { if (this.action && !this.state.receipt) { this.deferredConversationId = conversationId; return false; } this.conversationId = conversationId; this.deferredConversationId = null; return true; }
  cancel() { if (!this.active) return; this.clearDeadline(); this.generation++; this.active.abort(); this.active = null; this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : null }); }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID(), clientId: this.state.subjectId! }; }
  async read(transport: ProgressTransport, days: 30 | 90 | 365 = this.state.days) { if (!this.state.subjectId || this.state.pending || this.action) return; this.publish({ ...this.state, days }); await this.execute({ ...this.header(), operation: 'progress.read', days }, transport); }
  async propose(after: MeasurementValues, transport: ProgressTransport) { if (!this.state.snapshot || this.state.pending || this.action || !validValues(after)) return; this.publish({ ...this.state, proposal: null, receipt: null }); await this.execute({ ...this.header(), operation: 'measurement.propose', resourceVersion: this.state.snapshot.version, after, inputSource: 'explicit_user' }, transport); }
  discard() { if (!this.state.pending && !this.action) this.publish({ ...this.state, proposal: null, error: null }); }
  async apply(transport: ProgressTransport) { const proposal = this.state.proposal; if (!proposal || this.state.pending || this.action || this.state.receipt) return; if (Date.parse(proposal.expiresAt) <= Date.now()) { this.publish({ ...this.state, error: 'expired' }); return; } this.action = { ...this.header(), operation: 'measurement.apply', proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version, actionId: crypto.randomUUID(), reviewed: true }; await this.execute(this.action, transport); }
  async check(transport: ProgressTransport) { if (!this.action || this.state.pending) return; await this.execute({ ...this.header(), operation: 'measurement.receipt', actionId: this.action.actionId }, transport); }
  private async execute(operation: ProgressOperation, transport: ProgressTransport) {
    const abort = new AbortController(), generation = ++this.generation; this.active = abort; const valid = () => generation === this.generation && !abort.signal.aborted;
    this.publish({ ...this.state, pending: true, error: null });
    const fail = (error = 'uncertain') => { if (!valid()) return; this.clearDeadline(); this.generation++; abort.abort(); this.active = null; this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? error : 'failed' }); };
    const timer = setTimeout(() => fail(), 45_000); this.deadline = timer;
    try {
      const result = await transport(operation, abort.signal); if (!valid()) return;
      if (!result.ok) { const unresolved = Boolean(this.action && (operation.operation === 'measurement.receipt' || ['not_found', 'uncertain', 'cancelled'].includes(result.error))); if (!unresolved) this.action = null; this.publish({ ...this.state, pending: false, uncertain: unresolved && !this.state.receipt, error: result.error }); return; }
      if (operation.operation === 'progress.read') { if (!('snapshot' in result) || result.snapshot.subjectId !== operation.clientId || result.snapshot.window.days !== operation.days) throw new Error('invalid_snapshot'); this.publish({ ...this.state, pending: false, snapshot: result.snapshot, proposal: null, error: null }); return; }
      if (operation.operation === 'measurement.propose') { if (!('proposal' in result) || result.proposal.id !== result.proposal.resource.id || result.proposal.resource.version !== operation.resourceVersion || result.proposal.precondition !== operation.resourceVersion || result.proposal.before !== null || result.proposal.reviewRequired !== true || result.proposal.inputSource !== 'explicit_user' || !exactValues(result.proposal.after, operation.after)) throw new Error('invalid_proposal'); this.publish({ ...this.state, pending: false, proposal: result.proposal, error: null }); return; }
      const action = this.action;
      if (!action || !('receipt' in result) || result.receipt.status !== 'applied' || result.receipt.action !== 'measurement.create' || result.receipt.actionId !== action.actionId || result.receipt.proposalId !== action.proposalId || result.refresh.measurementId !== action.proposalId || result.refresh.measuredDate !== this.state.proposal?.after.measuredDate || result.refresh.previousVersion !== action.resourceVersion || result.refresh.version !== result.receipt.resourceVersion || result.refresh.strategy !== 'refetch') throw new Error('invalid_receipt');
      this.publish({ ...this.state, receipt: result.receipt, uncertain: false });
      const fresh = await transport({ ...this.header(), operation: 'progress.read', days: this.state.days }, abort.signal); if (!valid()) return;
      if (!fresh.ok || !('snapshot' in fresh) || fresh.snapshot.subjectId !== action.clientId || fresh.snapshot.window.days !== this.state.days || BigInt(fresh.snapshot.version) < BigInt(result.refresh.version) || !fresh.snapshot.measurements.some(item => item.id === result.refresh.measurementId && item.measuredDate === result.refresh.measuredDate)) throw new Error('refresh_failed');
      this.action = null; if (this.deferredConversationId) { this.conversationId = this.deferredConversationId; this.deferredConversationId = null; }
      this.publish({ ...this.state, pending: false, snapshot: fresh.snapshot, proposal: null, error: null });
    } catch { fail(); }
    finally { clearTimeout(timer); if (this.deadline === timer) this.deadline = null; if (generation === this.generation) this.active = null; }
  }
}
