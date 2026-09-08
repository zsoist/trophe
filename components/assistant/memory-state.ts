import type { PersistentMemoryCard, PersistentMemoryOperation, PersistentMemoryProposal, PersistentMemoryResult } from '@/agents/coach-assistant/memory-contracts';

export type MemoryTransport = (operation: PersistentMemoryOperation, signal: AbortSignal) => Promise<PersistentMemoryResult>;
type Receipt = Extract<PersistentMemoryResult, { receipt: unknown }>['receipt'];
export interface MemoryState {
  memories: PersistentMemoryCard[]; loaded: boolean; proposal: PersistentMemoryProposal | null;
  receipt: Receipt | null; pending: boolean; uncertain: boolean; error: string | null;
}
const empty = (): MemoryState => ({ memories: [], loaded: false, proposal: null, receipt: null, pending: false, uncertain: false, error: null });
/** A cancelled or lost write keeps its identity until receipt recovery and refetch. */
export class MemoryController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private action: Extract<PersistentMemoryOperation, { operation: 'memory.apply' }> | null = null;
  constructor(private conversationId: string) {}
  identify(conversationId: string) { if (this.conversationId !== conversationId) { this.reset(); this.conversationId = conversationId; } }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: MemoryState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clearTimer() { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
  reset() { this.clearTimer(); this.generation++; this.active?.abort(); this.active = null; this.action = null; this.publish(empty()); }
  cancel() {
    if (!this.active) return;
    this.clearTimer(); this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : null });
  }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID() }; }
  async read(transport: MemoryTransport) {
    if (this.state.pending || this.action) return;
    await this.execute({ ...this.header(), operation: 'memory.read' }, transport);
  }
  async propose(text: string, transport: MemoryTransport, memory?: PersistentMemoryCard) {
    const value = text.trim();
    if (!this.state.loaded || this.state.pending || this.action || !value || value.length > 400) return;
    if (memory && !this.state.memories.some(item => item.id === memory.id && item.version === memory.version)) return;
    this.publish({ ...this.state, proposal: null, receipt: null });
    const after = { text: value, source: 'user_input' as const, retention: 'persistent' as const };
    await this.execute(memory
      ? { ...this.header(), operation: 'memory.correct', memoryId: memory.id, resourceVersion: memory.version, after }
      : { ...this.header(), operation: 'memory.propose', action: 'memory.confirm', after }, transport);
  }
  async remove(memory: PersistentMemoryCard, transport: MemoryTransport) {
    if (this.state.pending || this.action || !this.state.memories.some(item => item.id === memory.id && item.version === memory.version)) return;
    this.publish({ ...this.state, proposal: null, receipt: null });
    await this.execute({ ...this.header(), operation: 'memory.delete', memoryId: memory.id, resourceVersion: memory.version }, transport);
  }
  discard() { if (!this.state.pending && !this.action) this.publish({ ...this.state, proposal: null, error: null }); }
  async apply(transport: MemoryTransport) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.action || this.state.receipt) return;
    if (Date.parse(proposal.expiresAt) <= Date.now()) { this.publish({ ...this.state, error: 'expired' }); return; }
    this.action = { ...this.header(), operation: 'memory.apply', proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), resourceVersion: proposal.resource.version, reviewed: true };
    await this.execute(this.action, transport);
  }
  async check(transport: MemoryTransport) {
    if (!this.action || this.state.pending) return;
    await this.execute({ ...this.header(), operation: 'memory.receipt', actionId: this.action.actionId }, transport);
  }
  private async execute(operation: PersistentMemoryOperation, transport: MemoryTransport) {
    const abort = new AbortController(), generation = ++this.generation; this.active = abort;
    const valid = () => this.generation === generation && !abort.signal.aborted;
    this.publish({ ...this.state, pending: true, error: null });
    const fail = () => {
      if (!valid()) return;
      this.clearTimer(); this.generation++; abort.abort(); this.active = null;
      this.publish({ ...this.state, pending: false, uncertain: Boolean(this.action && !this.state.receipt), error: this.action ? 'uncertain' : 'failed' });
    };
    const timer = setTimeout(fail, 45000); this.timer = timer;
    try {
      const result = await transport(operation, abort.signal);
      if (!valid()) return;
      if (!result.ok) {
        const unresolved = Boolean(this.action && (operation.operation === 'memory.receipt' || ['uncertain', 'cancelled'].includes(result.error)));
        if (!unresolved) this.action = null;
        this.publish({ ...this.state, pending: false, uncertain: unresolved && !this.state.receipt, error: result.error }); return;
      }
      if (operation.operation === 'memory.read') {
        if (!('memories' in result) || result.memories.some(item => item.conversationId !== this.conversationId)) throw new Error('invalid_scope');
        this.publish({ ...this.state, pending: false, loaded: true, memories: result.memories, proposal: null }); return;
      }
      if (['memory.propose', 'memory.correct', 'memory.delete'].includes(operation.operation)) {
        if (!('proposal' in result)) throw new Error('invalid_proposal');
        const proposal = result.proposal;
        const action = operation.operation === 'memory.propose' ? 'memory.confirm' : operation.operation;
        if (proposal.action !== action || !proposal.reviewRequired) throw new Error('invalid_action');
        if ('after' in operation && (proposal.after?.text !== operation.after.text || proposal.after.source !== 'user_input' || proposal.after.retention !== 'persistent')) throw new Error('changed_after');
        if (operation.operation === 'memory.propose' && proposal.before !== null) throw new Error('changed_before');
        if ('memoryId' in operation) {
          const before = this.state.memories.find(item => item.id === operation.memoryId);
          if (!before || proposal.resource.id !== before.id || proposal.resource.version !== operation.resourceVersion
            || !proposal.before || Object.entries(before).some(([key, value]) => proposal.before![key as keyof PersistentMemoryCard] !== value)) throw new Error('changed_before');
        }
        if (operation.operation === 'memory.delete' && proposal.after !== null) throw new Error('changed_after');
        this.publish({ ...this.state, pending: false, proposal }); return;
      }
      const action = this.action;
      if (!action || !('receipt' in result) || result.receipt.actionId !== action.actionId || result.receipt.proposalId !== action.proposalId
        || result.receipt.status !== 'applied' || result.refresh.conversationId !== this.conversationId || result.refresh.discardDerivedContext !== true) throw new Error('invalid_receipt');
      this.publish({ ...this.state, receipt: result.receipt, uncertain: false });
      const fresh = await transport({ ...this.header(), operation: 'memory.read' }, abort.signal);
      if (!valid()) return;
      if (!fresh.ok || !('memories' in fresh) || fresh.memories.some(item => item.conversationId !== this.conversationId)) throw new Error('refresh_failed');
      const proposal = this.state.proposal!;
      const current = fresh.memories.find(item => item.id === proposal.resource.id);
      if (proposal.action === 'memory.delete' ? Boolean(current) : !current || BigInt(current.version) < BigInt(result.receipt.resourceVersion)) throw new Error('refresh_stale');
      this.action = null;
      this.publish({ ...this.state, pending: false, loaded: true, memories: fresh.memories, proposal: null, error: null });
    } catch { fail(); }
    finally { clearTimeout(timer); if (this.timer === timer) this.timer = null; if (this.generation === generation) this.active = null; }
  }
}
