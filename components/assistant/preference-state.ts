import type { CoachActionResult, CoachOperation, CoachMemoryCard, CoachMemoryOperation, CoachProposal, CoachReceipt } from '@/agents/coach-assistant/contracts';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
export type PreferenceTransport = (operation: CoachOperation, signal: AbortSignal) => Promise<CoachActionResult>;
export interface PreferenceState {
  pending: boolean; proposal: CoachProposal | null; receipt: CoachReceipt | null;
  storage: CoachActionResult['storage'] | null; error: string | null; uncertain: boolean;
  memories: Record<string, CoachMemoryCard | null>;
  draftRefresh: CoachActionResult['draftRefresh'] | null;
  confirmed: { durationMinutes: number; version: string; storage: CoachActionResult['storage'] } | null;
}
const empty = (): PreferenceState => ({ pending: false, proposal: null, receipt: null, storage: null, error: null, uncertain: false, confirmed: null, memories: {}, draftRefresh: null });

/** Keeps the exact apply envelope through cancellation or a lost response. Never blindly retries a write. */
export class PreferenceController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private applyEnvelope: Extract<CoachOperation, { operation: 'apply' }> | null = null;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: PreferenceState) { this.state = state; this.listeners.forEach(listener => listener()); }
  reset() { this.generation++; this.active?.abort(); this.active = null; this.applyEnvelope = null; this.publish(empty()); }
  /** A new chat drops review-only state but keeps an uncertain apply bound to its original receipt envelope. */
  moveConversation() {
    if (this.active) this.cancel();
    if (!this.state.uncertain || !this.applyEnvelope) this.reset();
  }
  cancel() {
    if (!this.active) return;
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, uncertain: Boolean(this.applyEnvelope), error: this.applyEnvelope ? 'uncertain' : null });
  }
  dismiss() { if (!this.state.pending && !this.state.uncertain) { this.applyEnvelope = null; this.publish({ ...empty(), confirmed: this.state.confirmed, memories: this.state.memories }); } }
  async propose(conversationId: string, version: string, durationMinutes: 20 | 30 | 45 | 60, transport: PreferenceTransport, clientId?: string) {
    if (this.state.pending || this.state.uncertain) return;
    this.applyEnvelope = null; this.publish({ ...empty(), confirmed: this.state.confirmed, memories: this.state.memories });
    await this.execute({ version: 'coach-assistant.v2', operation: 'propose', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), action: 'preference.update', resourceVersion: version, after: { durationMinutes } }, transport);
  }
  async proposeMemory(conversationId: string, memory: CoachMemoryCard, change: { action: 'memory.confirm' | 'memory.delete' } | { action: 'memory.correct'; after: { text: string } }, transport: PreferenceTransport, clientId?: string) {
    if (this.state.pending || this.state.uncertain) return;
    this.applyEnvelope = null; this.publish({ ...empty(), confirmed: this.state.confirmed, memories: this.state.memories });
    const operation: CoachMemoryOperation = { version: 'coach-assistant.v2', operation: 'propose', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), memoryId: memory.id, resourceVersion: memory.version, ...change };
    await this.execute(operation, transport);
  }
  async proposeDraft(conversationId: string, version: string, after: WorkoutDraft, transport: PreferenceTransport, clientId?: string) {
    if (this.state.pending || this.state.uncertain) return;
    this.applyEnvelope = null; this.publish({ ...empty(), confirmed: this.state.confirmed, memories: this.state.memories });
    await this.execute({ version: 'coach-assistant.v2', operation: 'propose', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), action: 'draft.update', resourceVersion: version, after: structuredClone(after) }, transport);
  }
  async apply(conversationId: string, transport: PreferenceTransport, clientId?: string) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.state.uncertain || this.state.receipt) return;
    if (Date.parse(proposal.expiresAt) <= Date.now()) { this.publish({ ...this.state, error: 'expired' }); return; }
    this.applyEnvelope = { version: 'coach-assistant.v2', operation: 'apply', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), resourceVersion: proposal.resource.version };
    await this.execute(this.applyEnvelope, transport);
  }
  async check(transport: PreferenceTransport) {
    const envelope = this.applyEnvelope;
    if (!envelope || this.state.pending || !this.state.uncertain) return;
    await this.execute({ version: envelope.version, operation: 'receipt', conversationId: envelope.conversationId, turnId: crypto.randomUUID(), ...(envelope.clientId ? { clientId: envelope.clientId } : {}), actionId: envelope.actionId }, transport);
  }
  private async execute(operation: CoachOperation, transport: PreferenceTransport) {
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    this.publish({ ...this.state, pending: true, error: null });
    const fail = () => { this.generation++; controller.abort(); this.active = null; this.publish({ ...this.state, pending: false, error: operation.operation === 'propose' ? 'failed' : 'uncertain', uncertain: operation.operation !== 'propose' }); };
    const timer = setTimeout(() => { if (generation === this.generation) fail(); }, 45_000);
    try {
      const result = await transport(operation, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      if (result.receipt && this.applyEnvelope && (result.receipt.actionId !== this.applyEnvelope.actionId || result.receipt.proposalId !== this.applyEnvelope.proposalId)) throw new Error('invalid_receipt');
      if (result.ok && operation.operation === 'propose' && !result.proposal) throw new Error('missing_proposal');
      if (result.ok && operation.operation !== 'propose' && !result.receipt) throw new Error('missing_receipt');
      if (result.receipt?.status === 'applied' && this.state.proposal?.action !== 'memory.delete' && !result.receipt.resourceVersion) throw new Error('missing_version');
      const uncertain = operation.operation === 'receipt' && !result.ok || result.receipt?.status === 'uncertain' || result.error === 'uncertain';
      const confirmed = result.receipt?.status === 'applied' && this.state.proposal?.action === 'preference.update' ? { durationMinutes: Number(this.state.proposal.after.durationMinutes), version: result.receipt.resourceVersion!, storage: result.storage } : this.state.confirmed;
      let memories = this.state.memories;
      const proposal = this.state.proposal;
      if (result.receipt?.status === 'applied' && proposal?.resource.kind === 'memory') {
        if (!result.invalidatedMemoryVersions?.some(item => item.id === proposal.resource.id && item.version === proposal.resource.version)
          || (proposal.action === 'memory.delete' ? result.memory !== null : !result.memory || result.memory.id !== proposal.resource.id || result.memory.version !== result.receipt.resourceVersion)) throw new Error('invalid_memory_receipt');
        memories = { ...memories, [proposal.resource.id]: structuredClone(result.memory ?? null) };
      }
      if (result.receipt?.status === 'applied' && proposal?.action === 'draft.update'
        && (!result.draftRefresh || result.draftRefresh.reviewRequired !== true || result.draftRefresh.previousVersion !== proposal.resource.version
          || result.draftRefresh.version !== result.receipt.resourceVersion)) throw new Error('invalid_draft_receipt');
      this.publish({ ...this.state, pending: false, storage: result.storage, error: result.ok ? null : result.error ?? 'failed', uncertain,
        proposal: result.proposal ?? this.state.proposal, receipt: result.receipt ?? null, confirmed, memories, draftRefresh: result.draftRefresh ? structuredClone(result.draftRefresh) : this.state.draftRefresh });
    } catch { if (generation === this.generation) fail(); }
    finally { clearTimeout(timer); if (generation === this.generation) this.active = null; }
  }
}
