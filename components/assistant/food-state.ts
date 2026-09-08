import type { FoodEntrySnapshot, FoodQuantityOperation, FoodQuantityProposal, FoodQuantityResult } from '@/agents/coach-assistant/food-contracts';
import type { CoachReceipt } from '@/agents/coach-assistant/contracts';
type FoodResolveOperation = {
  version: 'coach-assistant.v2'; conversationId: string; turnId: string; clientId?: string;
  operation: 'food.resolve'; entryHintId?: string; loggedDateHint?: string; expectedPreviousGrams: number;
};
type FoodOperation = FoodQuantityOperation | FoodResolveOperation;
export type FoodTransport = (operation: FoodOperation, signal: AbortSignal) => Promise<FoodQuantityResult>;
export interface FoodState {
  intentId: string | null; targetGrams: number | null; previousGrams: number | null; entryHintId: string | null;
  entryId: string | null; entry: FoodEntrySnapshot | null; proposal: FoodQuantityProposal | null;
  receipt: CoachReceipt | null; pending: boolean; uncertain: boolean; error: string | null;
  receipts: Array<{ entryId: string; receipt: CoachReceipt }>;
}
const empty = (): FoodState => ({ intentId: null, targetGrams: null, previousGrams: null, entryHintId: null, entryId: null, entry: null, proposal: null, receipt: null, pending: false, uncertain: false, error: null, receipts: [] });
/** The canonical reviewed apply envelope survives closing the panel. A lost
 * response is recovered by receipt lookup, never by a second mutation. */
export class FoodQuantityController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private conversationId = '';
  private action: Extract<FoodQuantityOperation, { operation: 'food.apply' }> | null = null;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: FoodState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clearDeadline() { if (this.deadline !== null) clearTimeout(this.deadline); this.deadline = null; }
  reset() { this.clearDeadline(); this.generation++; this.active?.abort(); this.active = null; this.action = null; this.publish(empty()); }
  moveConversation() {
    if (this.active) this.cancel();
    if (!this.action) this.reset();
  }
  cancel() {
    if (!this.active) return;
    this.clearDeadline();
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : null });
  }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID() }; }
  select(entryId: string, conversationId: string, transport: FoodTransport) {
    if (this.action && !this.state.receipt) return false;
    const receipts = this.state.receipts;
    this.reset(); this.conversationId = conversationId; this.publish({ ...empty(), entryId, receipts });
    void this.read(transport); return true;
  }
  async activate(intentId: string, conversationId: string, previousGrams: number, targetGrams: number, transport: FoodTransport, entryHintId?: string | null) {
    if (this.action || this.state.pending) return false;
    if (this.state.intentId === intentId) return true;
    if (!/^[a-f0-9]{64}$/.test(intentId) || ![previousGrams, targetGrams].every(value => Number.isFinite(value) && value > 0 && value <= 10_000)
      || previousGrams === targetGrams || entryHintId !== undefined && entryHintId !== null && !/^[0-9a-f-]{36}$/i.test(entryHintId)) return false;
    this.reset(); this.conversationId = conversationId;
    this.publish({ ...empty(), intentId, previousGrams, targetGrams, entryHintId: entryHintId ?? null });
    return this.resolveAndPropose(transport);
  }
  private async resolveAndPropose(transport: FoodTransport) {
    const { previousGrams, targetGrams, entryHintId } = this.state;
    if (previousGrams === null || targetGrams === null || this.state.pending || this.action) return false;
    await this.execute({ ...this.header(), operation: 'food.resolve', expectedPreviousGrams: previousGrams, ...(entryHintId ? { entryHintId } : {}) }, transport);
    if (!this.state.entry || this.state.entry.grams !== previousGrams) return false;
    await this.propose(targetGrams, transport);
    return Boolean(this.state.proposal);
  }
  dismiss() {
    if (this.action && !this.state.receipt) return;
    const receipts = this.state.receipts; this.reset(); this.publish({ ...empty(), receipts });
  }
  async read(transport: FoodTransport) {
    if (!this.state.entryId || this.state.pending || this.action) return;
    await this.execute({ ...this.header(), operation: 'food.read', entryId: this.state.entryId }, transport);
  }
  async retry(transport: FoodTransport) {
    if (this.state.pending || this.action) return false;
    if (this.state.intentId) return this.resolveAndPropose(transport);
    await this.read(transport); return Boolean(this.state.entry);
  }
  async propose(grams: number, transport: FoodTransport) {
    if (!this.state.entry || this.state.pending || this.action || !Number.isFinite(grams) || grams <= 0 || grams > 10000) return;
    this.publish({ ...this.state, proposal: null, receipt: null });
    await this.execute({ ...this.header(), operation: 'food.propose', entryId: this.state.entry.entryId, resourceVersion: this.state.entry.version, after: { grams } }, transport);
  }
  discard() { if (!this.state.pending && !this.action) this.publish({ ...this.state, proposal: null, error: null }); }
  async apply(transport: FoodTransport) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.action || this.state.receipt) return;
    if (Date.parse(proposal.expiresAt) <= Date.now()) { this.publish({ ...this.state, error: 'expired' }); return; }
    this.action = { ...this.header(), operation: 'food.apply', entryId: proposal.resource.id, proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), resourceVersion: proposal.resource.version, reviewed: true };
    await this.execute(this.action, transport);
  }
  async check(transport: FoodTransport) {
    if (!this.action || this.state.pending) return;
    await this.execute({ ...this.header(), operation: 'food.receipt', entryId: this.action.entryId, actionId: this.action.actionId }, transport);
  }
  private async execute(operation: FoodOperation, transport: FoodTransport) {
    const abort = new AbortController(), generation = ++this.generation; this.active = abort;
    const valid = () => generation === this.generation && !abort.signal.aborted;
    this.publish({ ...this.state, pending: true, error: null });
    const fail = () => {
      if (!valid()) return;
      this.clearDeadline();
      this.generation++; abort.abort(); this.active = null;
      this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : 'failed' });
    };
    const timer = setTimeout(fail, 45000);
    this.deadline = timer;
    try {
      const result = await transport(operation, abort.signal);
      if (!valid()) return;
      if (!result.ok) {
        const unresolved = Boolean(this.action && (operation.operation === 'food.receipt' || ['uncertain', 'cancelled'].includes(result.error)));
        if (!unresolved) this.action = null;
        this.publish({ ...this.state, pending: false, uncertain: unresolved && !this.state.receipt, error: result.error }); return;
      }
      if (operation.operation === 'food.read' || operation.operation === 'food.resolve') {
        if (!('snapshot' in result)
          || operation.operation === 'food.read' && result.snapshot.entryId !== operation.entryId
          || operation.operation === 'food.resolve' && (result.snapshot.grams !== operation.expectedPreviousGrams
            || operation.entryHintId && result.snapshot.entryId !== operation.entryHintId)) throw new Error('invalid_entry');
        this.publish({ ...this.state, pending: false, entryId: result.snapshot.entryId, entry: result.snapshot, proposal: null }); return;
      }
      if (operation.operation === 'food.propose') {
        if (!('proposal' in result) || result.proposal.resource.id !== operation.entryId || result.proposal.resource.version !== operation.resourceVersion
          || result.proposal.after.grams !== operation.after.grams || result.proposal.reviewRequired !== true) throw new Error('invalid_proposal');
        const current = this.state.entry!;
        if (Object.entries(result.proposal.before).some(([key, value]) => current[key as keyof FoodEntrySnapshot] !== value)) throw new Error('changed_before');
        this.publish({ ...this.state, pending: false, proposal: result.proposal }); return;
      }
      const action = this.action;
      if (!action || !('receipt' in result) || result.receipt.status !== 'applied' || result.receipt.actionId !== action.actionId
        || result.receipt.proposalId !== action.proposalId || !result.refresh || result.refresh.entryId !== action.entryId
        || result.refresh.previousVersion !== action.resourceVersion || result.refresh.version !== result.receipt.resourceVersion) throw new Error('invalid_receipt');
      const receipts = this.state.receipts.some(item => item.receipt.id === result.receipt.id) ? this.state.receipts
        : [...this.state.receipts, { entryId: action.entryId, receipt: result.receipt }].slice(-20);
      this.publish({ ...this.state, receipt: result.receipt, receipts, uncertain: false });
      const fresh = await transport({ ...this.header(), operation: 'food.read', entryId: action.entryId }, abort.signal);
      if (!valid()) return;
      if (!fresh.ok || !('snapshot' in fresh) || fresh.snapshot.entryId !== action.entryId
        || !/^\d+$/.test(fresh.snapshot.version) || !/^\d+$/.test(result.refresh.version)
        || BigInt(fresh.snapshot.version) < BigInt(result.refresh.version)) throw new Error('refresh_failed');
      this.action = null;
      this.publish({ ...this.state, pending: false, entry: fresh.snapshot, proposal: null, error: null });
    } catch { fail(); }
    finally { clearTimeout(timer); if (this.deadline === timer) this.deadline = null; if (generation === this.generation) this.active = null; }
  }
}
