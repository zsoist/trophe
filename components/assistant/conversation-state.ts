import type { CoachChatMessage } from '@/agents/coach-assistant/chat-contract';
import type { CoachAttachmentRef, CoachContextHint, CoachConversationRequest, CoachConversationResponse, CoachSurface } from '@/agents/coach-assistant/contracts';

export type ConversationTransport = (request: CoachConversationRequest, signal: AbortSignal) => Promise<CoachConversationResponse>;
export interface ConversationTurn { request: CoachConversationRequest; response?: CoachConversationResponse; recovered?: CoachChatMessage[] }
export interface ConversationState { conversationId: string; draft: string; turns: ConversationTurn[]; restored: CoachChatMessage[]; durable: boolean; recoveryRequired: boolean; recovering: boolean; pending: boolean; error: 'failed' | 'cancelled' | null }

export interface ConversationRecovery {
  thread: { id: string };
  status: 'settled' | 'failed' | 'inflight' | 'unknown' | 'not_found';
  user: CoachChatMessage | null;
  assistant: CoachChatMessage | null;
}
export type ConversationRecoveryTransport = (threadId: string, turnId: string, signal: AbortSignal) => Promise<ConversationRecovery>;

/** One in-memory conversation per authenticated subject. Navigation never calls send. */
export class ConversationController {
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private generation = 0;
  private identity: string | null = null;
  private creationTitle: string | null = null;
  private state: ConversationState = this.empty();
  private empty(): ConversationState { return { conversationId: crypto.randomUUID(), draft: '', turns: [], restored: [], durable: false, recoveryRequired: false, recovering: false, pending: false, error: null }; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(next: ConversationState) { this.state = next; this.listeners.forEach(listener => listener()); }
  identify(identity: string | null) {
    if (identity === this.identity) return;
    this.generation++; this.active?.abort(); this.active = null; this.identity = identity; this.creationTitle = null;
    this.publish(this.empty());
  }
  startNew() {
    if (!this.identity) return false;
    this.generation++; this.active?.abort(); this.active = null; this.creationTitle = null;
    this.publish(this.empty());
    return true;
  }
  restore(conversationId: string, messages: CoachChatMessage[]) {
    if (!this.identity || messages.length > 1000 || this.state.pending || this.state.recovering || this.state.recoveryRequired && conversationId === this.state.conversationId) return false;
    const draft = conversationId === this.state.conversationId ? this.state.draft : '';
    this.generation++; this.active?.abort(); this.active = null; this.creationTitle = null;
    this.publish({ ...this.empty(), conversationId, draft, durable: true, restored: structuredClone(messages) });
    return true;
  }
  async recover(read: ConversationRecoveryTransport) {
    const turn = this.state.turns.at(-1);
    if (!this.identity || this.active || !this.state.recoveryRequired || !turn) return false;
    const conversationId = this.state.conversationId, turnId = turn.request.turnId;
    const request = new AbortController(); this.active = request;
    const generation = ++this.generation;
    this.publish({ ...this.state, recovering: true });
    const timeout = setTimeout(() => request.abort(), 10_000);
    try {
      const result = await read(conversationId, turnId, request.signal);
      if (generation !== this.generation || request.signal.aborted || result.thread.id !== conversationId) return false;
      if (result.status !== 'settled' && result.status !== 'failed') return false;
      if (!result.user || result.user.turnId !== turnId || result.user.role !== 'user') return false;
      if (result.status === 'settled' && (!result.assistant || result.assistant.turnId !== turnId || result.assistant.role !== 'assistant' || result.assistant.sequence <= result.user.sequence)) return false;
      this.publish({ ...this.state, recoveryRequired: false, error: result.status === 'settled' ? null : 'failed',
        draft: result.status === 'settled' && this.state.draft.trim() === turn.request.message ? '' : this.state.draft,
        turns: this.state.turns.map(item => item.request.turnId === turnId && result.status === 'settled' ? { ...item, recovered: [result.user!, result.assistant!] } : item) });
      return true;
    } catch { return false; }
    finally {
      clearTimeout(timeout);
      if (generation === this.generation) { this.active = null; this.publish({ ...this.state, recovering: false }); }
    }
  }
  setDraft(draft: string) { this.publish({ ...this.state, draft: draft.slice(0, 2000) }); }
  async prepareDurable(title: string, createThread: (requestId: string, title: string, signal: AbortSignal) => Promise<{ id: string }>) {
    if (this.state.durable) return this.state.conversationId;
    if (!this.identity || this.active || !title.trim()) return null;
    const requestId = this.state.conversationId;
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    const creationTitle = this.creationTitle ??= title.trim().slice(0, 80);
    this.publish({ ...this.state, pending: true, error: null });
    try {
      const thread = await createThread(requestId, creationTitle, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return null;
      this.publish({ ...this.state, conversationId: thread.id, durable: true, pending: false, error: null });
      return thread.id;
    } catch {
      if (generation === this.generation) this.publish({ ...this.state, pending: false, error: 'failed' });
      return null;
    } finally {
      if (generation === this.generation) this.active = null;
    }
  }
  cancel() {
    if (!this.active) return;
    this.generation++; this.active.abort(); this.active = null;
    this.publish({ ...this.state, pending: false, recoveryRequired: this.state.durable, error: 'cancelled', draft: this.state.draft || this.state.turns.at(-1)?.request.message || '' });
  }
  async send(context: CoachContextHint | undefined, transport: ConversationTransport, attachments: CoachAttachmentRef[] = [], createThread?: (requestId: string, title: string, signal: AbortSignal) => Promise<{ id: string }>, requestedTurnId?: string) {
    const message = this.state.draft.trim();
    if (!this.identity || this.active || this.state.recoveryRequired || !message) return;
    const request: CoachConversationRequest = {
      version: 'coach-assistant.v2', conversationId: this.state.conversationId, turnId: requestedTurnId ?? crypto.randomUUID(), message,
      ...(context ? { context: structuredClone(context) } : {}),
      ...(attachments.length ? { attachments: structuredClone(attachments.slice(0, 3)) } : {}),
      history: [...this.state.restored.map(item => ({ role: item.role, text: item.text.slice(0, 500) })), ...this.state.turns.filter(turn => turn.response?.ok || turn.recovered).flatMap(turn => turn.recovered ? turn.recovered.map(item => ({ role: item.role, text: item.text.slice(0, 500) })) : [
        { role: 'user' as const, text: turn.request.message.slice(0, 500) },
        { role: 'assistant' as const, text: (turn.response?.output?.answer ?? '').slice(0, 500), ...(turn.response?.memoryContext?.derivedHistoryToken ? { derivedToken: turn.response.memoryContext.derivedHistoryToken } : {}) },
      ])].slice(-6),
    };
    const controller = new AbortController(); this.active = controller;
    const generation = ++this.generation;
    this.publish({ ...this.state, draft: '', pending: true, error: null, turns: [...this.state.turns.slice(-39), { request }] });
    const timeout = setTimeout(() => {
      if (generation !== this.generation) return;
      this.generation++; controller.abort(); this.active = null;
      this.publish({ ...this.state, pending: false, recoveryRequired: this.state.durable, error: 'failed', draft: this.state.draft || message });
    }, 45_000);
    try {
      if (createThread && !this.state.durable) {
        if (attachments.length) throw new Error('thread_required_before_upload');
        const thread = await createThread(request.conversationId, (this.creationTitle ??= message.slice(0, 80)), controller.signal);
        if (generation !== this.generation || controller.signal.aborted) return;
        request.conversationId = thread.id;
        this.publish({ ...this.state, conversationId: thread.id, durable: true, turns: this.state.turns.map(turn => turn.request.turnId === request.turnId ? { request } : turn) });
      }
      const response = await transport(request, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      if (response.conversationId !== request.conversationId || response.turnId !== request.turnId) throw new Error('invalid_output');
      this.publish({ ...this.state, pending: false, recoveryRequired: this.state.durable && !response.ok, error: response.ok ? null : 'failed', draft: response.ok ? this.state.draft : this.state.draft || message,
        turns: this.state.turns.map(turn => turn.request.turnId === request.turnId ? { ...turn, response } : turn) });
    } catch {
      if (generation === this.generation) this.publish({ ...this.state, pending: false, recoveryRequired: this.state.durable, error: 'failed', draft: this.state.draft || message });
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) { this.active = null; if (this.state.pending) this.publish({ ...this.state, pending: false, recoveryRequired: this.state.durable, error: 'failed', draft: this.state.draft || message }); }
    }
  }
}

export function coachSurface(path: string): CoachSurface {
  if (path.includes('/form-check')) return 'form_check' as CoachSurface;
  if (path.includes('/messages') || path.includes('/coach/inbox')) return 'messages' as CoachSurface;
  if (path.includes('/intake') || path.includes('/coach/questionnaires')) return 'intake' as CoachSurface;
  if (path.includes('/book') || path.includes('/coach/calendar')) return 'booking' as CoachSurface;
  if (path.includes('/supplements') || path.includes('/coach/protocols')) return 'supplements' as CoachSurface;
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

/** Extracts a route hint only. The server still authorizes actor, client and tenant. */
export function professionalCoachSubject(path: string): string | undefined {
  const pathname = path.split(/[?#]/, 1)[0];
  const match = pathname.match(/^\/coach\/(?:client\/([^/]+)|inbox\/([^/]+))(?:\/|$)/);
  return match?.[1] ?? match?.[2];
}
