import type { CoachAttachmentRef, CoachContextHint, CoachConversationRequest, CoachConversationResponse, CoachSurface } from '@/agents/coach-assistant/contracts';

export type ConversationTransport = (request: CoachConversationRequest, signal: AbortSignal) => Promise<CoachConversationResponse>;
export interface ConversationTurn { request: CoachConversationRequest; response?: CoachConversationResponse }
export interface ConversationState { conversationId: string; draft: string; turns: ConversationTurn[]; pending: boolean; error: 'failed' | 'cancelled' | null }

/** One in-memory conversation per authenticated subject. Navigation never calls send. */
export class ConversationController {
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private identity: string | null = null;
  private state: ConversationState = this.empty();
  private empty(): ConversationState { return { conversationId: crypto.randomUUID(), draft: '', turns: [], pending: false, error: null }; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(next: ConversationState) { this.state = next; this.listeners.forEach(listener => listener()); }
  identify(identity: string | null) {
    if (identity === this.identity) return;
    this.generation++; this.active?.abort(); this.active = null; this.identity = identity;
    this.publish(this.empty());
  }
  setDraft(draft: string) { this.publish({ ...this.state, draft: draft.slice(0, 2000) }); }
  cancel() {
    if (!this.active) return;
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, error: 'cancelled', draft: this.state.draft || this.state.turns.at(-1)?.request.message || '' });
  }
  async send(context: CoachContextHint | undefined, transport: ConversationTransport, attachments: CoachAttachmentRef[] = []) {
    const message = this.state.draft.trim();
    if (!this.identity || this.active || !message) return;
    const request: CoachConversationRequest = {
      version: 'coach-assistant.v2', conversationId: this.state.conversationId, turnId: crypto.randomUUID(), message,
      ...(context ? { context: structuredClone(context) } : {}),
      ...(attachments.length ? { attachments: structuredClone(attachments.slice(0, 3)) } : {}),
      history: this.state.turns.filter(turn => turn.response?.ok).flatMap(turn => [
        { role: 'user' as const, text: turn.request.message.slice(0, 500) },
        { role: 'assistant' as const, text: (turn.response?.output?.answer ?? '').slice(0, 500), ...(turn.response?.memoryContext?.derivedHistoryToken ? { derivedToken: turn.response.memoryContext.derivedHistoryToken } : {}) },
      ]).slice(-6),
    };
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    this.publish({ ...this.state, draft: '', pending: true, error: null, turns: [...this.state.turns.slice(-39), { request }] });
    const timeout = setTimeout(() => {
      if (generation !== this.generation) return;
      this.generation++; controller.abort(); this.active = null;
      this.publish({ ...this.state, pending: false, error: 'failed', draft: this.state.draft || message });
    }, 45_000);
    try {
      const response = await transport(request, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      if (response.conversationId !== request.conversationId || response.turnId !== request.turnId) throw new Error('invalid_output');
      this.publish({ ...this.state, pending: false, error: response.ok ? null : 'failed', draft: response.ok ? this.state.draft : this.state.draft || message,
        turns: this.state.turns.map(turn => turn.request.turnId === request.turnId ? { ...turn, response } : turn) });
    } catch {
      if (generation === this.generation) this.publish({ ...this.state, pending: false, error: 'failed', draft: this.state.draft || message });
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) { this.active = null; if (this.state.pending) this.publish({ ...this.state, pending: false, error: 'failed', draft: this.state.draft || message }); }
    }
  }
}

export function coachSurface(path: string): CoachSurface {
  if (path.includes('/atlas') || path.includes('/anatomy')) return 'atlas';
  if (path.includes('/recipes')) return 'recipe';
  if (path.includes('/food') || path === '/dashboard/log') return 'food';
  if (path.includes('/workout/exercises/')) return 'exercise';
  if (path.includes('/workout/exercises')) return 'library';
  if (path.includes('/workout/live')) return 'live';
  if (/\/workout\/(build|review)/.test(path)) return 'plan';
  if (path.includes('/history')) return 'history';
  if (path.includes('/stats') || path.includes('/progress')) return 'progress';
  if (path.includes('/workout')) return 'workout';
  if (path.includes('/profile')) return 'profile';
  if (path.includes('/habits') || path.includes('/checkin')) return 'habits';
  if (path.includes('/coach')) return 'coach';
  return 'home';
}
