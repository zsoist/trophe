import type { FoodPreferenceSnapshot, FoodPreferenceOperation, FoodPreferenceProposal, FoodPreferenceResult } from '@/agents/coach-assistant/food-preference-contracts';
import type { CoachReceipt } from '@/agents/coach-assistant/contracts';
export type DietTransport = (operation: FoodPreferenceOperation, signal: AbortSignal) => Promise<FoodPreferenceResult>;
export interface DietState {
  profileId: string | null; profile: FoodPreferenceSnapshot | null; proposal: FoodPreferenceProposal | null;
  receipt: CoachReceipt | null; pending: boolean; uncertain: boolean; error: string | null;
  receipts: Array<{ profileId: string; receipt: CoachReceipt }>;
}
const empty = (): DietState => ({ profileId: null, profile: null, proposal: null, receipt: null, pending: false, uncertain: false, error: null, receipts: [] });
/** The canonical reviewed apply envelope survives closing the panel. A lost
 * response is recovered by receipt lookup, never by a second mutation. */
export class DietController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private conversationId = '';
  private action: Extract<FoodPreferenceOperation, { operation: 'diet.apply' }> | null = null;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: DietState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clearDeadline() { if (this.deadline !== null) clearTimeout(this.deadline); this.deadline = null; }
  reset() { this.clearDeadline(); this.generation++; this.active?.abort(); this.active = null; this.action = null; this.publish(empty()); }
  cancel() {
    if (!this.active) return;
    this.clearDeadline();
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : null });
  }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID(), profileId: this.state.profileId! }; }
  select(profileId: string, conversationId: string, transport: DietTransport) {
    if (this.action && !this.state.receipt) return false;
    const receipts = this.state.receipts;
    this.reset(); this.conversationId = conversationId; this.publish({ ...empty(), profileId, receipts });
    void this.read(transport); return true;
  }
  dismiss() {
    if (this.action && !this.state.receipt) return;
    const receipts = this.state.receipts; this.reset(); this.publish({ ...empty(), receipts });
  }
  async read(transport: DietTransport) {
    if (!this.state.profileId || this.state.pending || this.action) return;
    await this.execute({ ...this.header(), operation: 'diet.read' }, transport);
  }
  async propose(dietPattern: FoodPreferenceSnapshot['preferences']['dietPattern'], transport: DietTransport) {
    if (!this.state.profile || this.state.pending || this.action || ![null, 'omnivore', 'vegetarian', 'vegan', 'pescatarian'].includes(dietPattern)) return;
    this.publish({ ...this.state, proposal: null, receipt: null });
    await this.execute({ ...this.header(), operation: 'diet.propose', resourceVersion: this.state.profile.version, after: { version: 1, dietPattern } }, transport);
  }
  discard() { if (!this.state.pending && !this.action) this.publish({ ...this.state, proposal: null, error: null }); }
  async apply(transport: DietTransport) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.action || this.state.receipt) return;
    if (Date.parse(proposal.expiresAt) <= Date.now()) { this.publish({ ...this.state, error: 'expired' }); return; }
    this.action = { ...this.header(), operation: 'diet.apply', proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), resourceVersion: proposal.resource.version, reviewed: true };
    await this.execute(this.action, transport);
  }
  async check(transport: DietTransport) {
    if (!this.action || this.state.pending) return;
    await this.execute({ ...this.header(), operation: 'diet.receipt', actionId: this.action.actionId }, transport);
  }
  private async execute(operation: FoodPreferenceOperation, transport: DietTransport) {
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
        const unresolved = Boolean(this.action && (operation.operation === 'diet.receipt' || ['uncertain', 'cancelled'].includes(result.error)));
        if (!unresolved) this.action = null;
        this.publish({ ...this.state, pending: false, uncertain: unresolved && !this.state.receipt, error: result.error }); return;
      }
      if (operation.operation === 'diet.read') {
        if (!('snapshot' in result) || result.snapshot.profileId !== operation.profileId) throw new Error('invalid_profile');
        this.publish({ ...this.state, pending: false, profile: result.snapshot, proposal: null }); return;
      }
      if (operation.operation === 'diet.propose') {
        if (!('proposal' in result) || result.proposal.resource.id !== operation.profileId || result.proposal.resource.version !== operation.resourceVersion
          || result.proposal.after.version !== 1 || result.proposal.after.dietPattern !== operation.after.dietPattern || result.proposal.reviewRequired !== true) throw new Error('invalid_proposal');
        const current = this.state.profile!.preferences;
        if (Object.entries(result.proposal.before).some(([key, value]) => current[key as keyof FoodPreferenceSnapshot['preferences']] !== value)) throw new Error('changed_before');
        this.publish({ ...this.state, pending: false, proposal: result.proposal }); return;
      }
      const action = this.action;
      if (!action || !('receipt' in result) || result.receipt.status !== 'applied' || result.receipt.actionId !== action.actionId
        || result.receipt.proposalId !== action.proposalId || !result.refresh || result.refresh.strategy !== 'refetch' || result.refresh.discardDerivedContext !== true || result.refresh.profileId !== action.profileId
        || result.refresh.previousVersion !== action.resourceVersion || result.refresh.version !== result.receipt.resourceVersion) throw new Error('invalid_receipt');
      const receipts = this.state.receipts.some(item => item.receipt.id === result.receipt.id) ? this.state.receipts
        : [...this.state.receipts, { profileId: action.profileId, receipt: result.receipt }].slice(-20);
      this.publish({ ...this.state, receipt: result.receipt, receipts, uncertain: false });
      const fresh = await transport({ ...this.header(), operation: 'diet.read' }, abort.signal);
      if (!valid()) return;
      if (!fresh.ok || !('snapshot' in fresh) || fresh.snapshot.profileId !== action.profileId
        || !/^\d+$/.test(fresh.snapshot.version) || !/^\d+$/.test(result.refresh.version)
        || BigInt(fresh.snapshot.version) < BigInt(result.refresh.version)) throw new Error('refresh_failed');
      this.action = null;
      this.publish({ ...this.state, pending: false, profile: fresh.snapshot, proposal: null, error: null });
    } catch { fail(); }
    finally { clearTimeout(timer); if (this.deadline === timer) this.deadline = null; if (generation === this.generation) this.active = null; }
  }
}
