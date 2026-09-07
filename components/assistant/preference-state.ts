import type { CoachActionResult, CoachPreferenceOperation, CoachProposal, CoachReceipt } from '@/agents/coach-assistant/contracts';
export type PreferenceTransport = (operation: CoachPreferenceOperation, signal: AbortSignal) => Promise<CoachActionResult>;
export interface PreferenceState {
  pending: boolean; proposal: CoachProposal | null; receipt: CoachReceipt | null;
  storage: CoachActionResult['storage'] | null; error: string | null; uncertain: boolean;
}
const empty = (): PreferenceState => ({ pending: false, proposal: null, receipt: null, storage: null, error: null, uncertain: false });

/** Keeps the exact apply envelope through cancellation or a lost response. Never blindly retries a write. */
export class PreferenceController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private applyEnvelope: Extract<CoachPreferenceOperation, { operation: 'apply' }> | null = null;
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: PreferenceState) { this.state = state; this.listeners.forEach(listener => listener()); }
  reset() { this.generation++; this.active?.abort(); this.active = null; this.applyEnvelope = null; this.publish(empty()); }
  cancel() {
    if (!this.active) return;
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, uncertain: Boolean(this.applyEnvelope), error: this.applyEnvelope ? 'uncertain' : null });
  }
  dismiss() { if (!this.state.pending && !this.state.uncertain) { this.applyEnvelope = null; this.publish(empty()); } }
  async propose(conversationId: string, version: string, durationMinutes: 20 | 30 | 45 | 60, transport: PreferenceTransport, clientId?: string) {
    if (this.state.pending || this.state.uncertain) return;
    this.applyEnvelope = null; this.publish(empty());
    await this.execute({ version: 'coach-assistant.v2', operation: 'propose', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), action: 'preference.update', resourceVersion: version, after: { durationMinutes } }, transport);
  }
  async apply(conversationId: string, transport: PreferenceTransport, clientId?: string) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.state.uncertain || this.state.receipt) return;
    this.applyEnvelope = { version: 'coach-assistant.v2', operation: 'apply', conversationId, turnId: crypto.randomUUID(), ...(clientId ? { clientId } : {}), proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), resourceVersion: proposal.resource.version };
    await this.execute(this.applyEnvelope, transport);
  }
  async check(transport: PreferenceTransport) {
    const envelope = this.applyEnvelope;
    if (!envelope || this.state.pending || !this.state.uncertain) return;
    await this.execute({ version: envelope.version, operation: 'receipt', conversationId: envelope.conversationId, turnId: crypto.randomUUID(), ...(envelope.clientId ? { clientId: envelope.clientId } : {}), actionId: envelope.actionId }, transport);
  }
  private async execute(operation: CoachPreferenceOperation, transport: PreferenceTransport) {
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
      const uncertain = operation.operation === 'receipt' && !result.ok || result.receipt?.status === 'uncertain' || result.error === 'uncertain';
      this.publish({ ...this.state, pending: false, storage: result.storage, error: result.ok ? null : result.error ?? 'failed', uncertain,
        proposal: result.proposal ?? this.state.proposal, receipt: result.receipt ?? null });
    } catch { if (generation === this.generation) fail(); }
    finally { clearTimeout(timer); if (generation === this.generation) this.active = null; }
  }
}
