import type {
  CoachMessageOperation,
  CoachMessageProposal,
  CoachMessageResult,
} from '@/agents/coach-assistant/message-actions';

export type MessageTransport = (operation: CoachMessageOperation, signal: AbortSignal) => Promise<CoachMessageResult>;

type Recipient = Extract<CoachMessageResult, { ok: true; recipient: unknown }>['recipient'];
type ReceiptResult = Extract<CoachMessageResult, { ok: true; receipt: unknown }>;

export interface MessageState {
  intentId: string | null;
  draft: string;
  recipient: Recipient | null;
  proposal: CoachMessageProposal | null;
  receipt: ReceiptResult['receipt'] | null;
  refresh: ReceiptResult['refresh'] | null;
  pending: boolean;
  uncertain: boolean;
  error: string | null;
}

const empty = (): MessageState => ({
  intentId: null,
  draft: '',
  recipient: null,
  proposal: null,
  receipt: null,
  refresh: null,
  pending: false,
  uncertain: false,
  error: null,
});

/** Owns one exact, user-reviewed message to the currently assigned coach. */
export class MessageController {
  private state = empty();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private conversationId = '';
  private clientId = '';
  private action: Extract<CoachMessageOperation, { operation: 'message.apply' }> | null = null;

  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: MessageState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private header() { return { version: 'coach-assistant.v2' as const, conversationId: this.conversationId, turnId: crypto.randomUUID() }; }

  reset() {
    this.generation += 1;
    this.active?.abort();
    this.active = null;
    this.action = null;
    this.conversationId = '';
    this.clientId = '';
    this.publish(empty());
  }

  moveConversation(conversationId: string) {
    if (conversationId === this.conversationId) return true;
    if (this.action && !this.state.receipt) return false;
    this.reset();
    this.conversationId = conversationId;
    return true;
  }

  cancel() {
    if (!this.active) return;
    this.generation += 1;
    this.active.abort();
    this.active = null;
    const uncertain = Boolean(this.action && !this.state.receipt);
    this.publish({ ...this.state, pending: false, uncertain, error: uncertain ? 'uncertain' : 'cancelled' });
  }

  dismiss() {
    if (!this.state.pending && !this.action) this.reset();
  }

  setDraft(draft: string) {
    if (this.action || this.state.receipt || draft.length > 2000 || draft === this.state.draft) return false;
    this.generation += 1;
    this.active?.abort();
    this.active = null;
    this.publish({ ...this.state, draft, proposal: null, pending: false, error: null });
    return true;
  }

  adopt(intentId: string, conversationId: string, proposal: CoachMessageProposal, clientId = '') {
    if (this.action || this.state.pending || this.state.intentId === intentId) return this.state.intentId === intentId;
    if (!/^[a-f0-9]{64}$/.test(intentId) || !/^[0-9a-f-]{36}$/i.test(conversationId)
      || proposal.action !== 'chat.message.send' || proposal.reviewRequired !== true
      || !proposal.after.message || proposal.after.message.length > 2000
      || Date.parse(proposal.expiresAt) <= Date.now()) return false;
    this.reset();
    this.conversationId = conversationId;
    this.clientId = clientId;
    this.publish({ ...empty(), intentId, draft: proposal.after.message, recipient: proposal.recipient, proposal });
    return true;
  }

  async activate(intentId: string, conversationId: string, draft: string, transport: MessageTransport, clientId = '') {
    if (this.action || this.state.pending) return false;
    if (this.state.intentId === intentId) return true;
    if (!/^[a-f0-9]{64}$/.test(intentId) || !/^[0-9a-f-]{36}$/i.test(conversationId)
      || !draft.trim() || draft.trim().length > 2000) return false;
    this.reset();
    this.conversationId = conversationId;
    this.clientId = clientId;
    this.publish({ ...empty(), intentId, draft });
    const result = await this.call({ ...this.header(), operation: 'message.recipient' }, transport, false);
    if (!result?.ok || !('recipient' in result)) return false;
    this.publish({ ...this.state, recipient: result.recipient, error: null });
    return true;
  }

  async propose(transport: MessageTransport) {
    const recipient = this.state.recipient;
    const message = this.state.draft.trim();
    if (!recipient || !message || message.length > 2000 || this.state.pending || this.action || this.state.receipt) return false;
    const result = await this.call({
      ...this.header(),
      operation: 'message.propose',
      coachId: recipient.coachId,
      resourceVersion: recipient.version,
      after: { message },
    }, transport, false);
    if (!result?.ok || !('proposal' in result)) return false;
    const proposal = result.proposal;
    if (proposal.action !== 'chat.message.send' || proposal.reviewRequired !== true
      || proposal.recipient.coachId !== recipient.coachId || proposal.recipient.version !== recipient.version
      || proposal.after.message !== message) {
      this.publish({ ...this.state, proposal: null, error: 'invalid_proposal' });
      return false;
    }
    this.publish({ ...this.state, draft: proposal.after.message, recipient: proposal.recipient, proposal, error: null });
    return true;
  }

  discard() {
    if (!this.state.pending && !this.action) this.publish({ ...this.state, proposal: null, error: null });
  }

  async apply(transport: MessageTransport) {
    const proposal = this.state.proposal;
    if (!proposal || this.state.pending || this.action || this.state.receipt) return false;
    if (Date.parse(proposal.expiresAt) <= Date.now()) {
      this.publish({ ...this.state, proposal: null, error: 'expired' });
      return false;
    }
    this.action = {
      ...this.header(),
      operation: 'message.apply',
      coachId: proposal.recipient.coachId,
      proposalId: proposal.id,
      hash: proposal.hash,
      resourceVersion: proposal.recipient.version,
      actionId: crypto.randomUUID(),
      reviewed: true,
    };
    const result = await this.call(this.action, transport, true);
    return this.acceptReceipt(result, false);
  }

  async check(transport: MessageTransport) {
    const action = this.action;
    if (!action || this.state.pending) return false;
    const result = await this.call({
      ...this.header(),
      operation: 'message.receipt',
      coachId: action.coachId,
      actionId: action.actionId,
    }, transport, true);
    return this.acceptReceipt(result, true);
  }

  private acceptReceipt(result: CoachMessageResult | null, checking: boolean) {
    const action = this.action;
    if (!action || !result) return false;
    if (!result.ok) {
      const uncertain = checking || result.error === 'uncertain' || result.error === 'cancelled' || result.error === 'not_found';
      if (!uncertain) this.action = null;
      this.publish({ ...this.state, uncertain, error: result.error });
      return false;
    }
    if (!('receipt' in result) || result.receipt.status !== 'stored'
      || result.receipt.actionId !== action.actionId || result.receipt.proposalId !== action.proposalId
      || result.receipt.coachId !== action.coachId
      || result.refresh.coachId !== action.coachId || result.refresh.strategy !== 'refetch'
      || Boolean(this.clientId) && result.refresh.clientId !== this.clientId) {
      this.publish({ ...this.state, uncertain: true, error: 'invalid_receipt' });
      return false;
    }
    this.action = null;
    this.publish({ ...this.state, proposal: null, receipt: result.receipt, refresh: result.refresh, pending: false, uncertain: false, error: null });
    return true;
  }

  private async call(operation: CoachMessageOperation, transport: MessageTransport, writeStarted: boolean): Promise<CoachMessageResult | null> {
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
