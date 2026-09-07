'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, X } from 'lucide-react';
import { ConversationController, coachSurface, type ConversationTransport } from './conversation-state';
import { requestConversation } from './client';
import { acceptedScreenSelection, subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection } from './screen-selection';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';
import { requestAttachment } from './attachment-client';
import { AttachmentController } from './attachment-state';
import { VoiceCapture } from './VoiceCapture';
import { VoiceController } from './voice-state';
import { FoodQuantityController } from './food-state';
import { FoodQuantityPanel } from './FoodQuantityPanel';
import { requestFoodQuantity } from './food-client';
import { COACH_FOOD_SELECT, COACH_FOOD_REFRESH, readFoodSelection } from './food-events';
import { AttachmentPicker } from './AttachmentPicker';
import { ContextCards } from './ContextCards';
import { PreferenceController, type PreferenceTransport, type PreferenceState } from './preference-state';
import { requestPreference } from './preference-client';
import { MemoryController, type MemoryTransport } from './memory-state';
import { MemoryPanel } from './MemoryPanel';
import { requestMemory } from './memory-client';
import { DietController, type DietTransport } from './diet-state';
import { DietPanel } from './DietPanel';
import dynamic from 'next/dynamic';
import type { HistoryTransport } from './history-client';
import { requestHistory } from './history-lazy-client';
import { requestDiet } from './diet-client';

const HistoryPanel = dynamic(() => import('./HistoryPanel').then(module => module.HistoryPanel));

export type CoachContextSlot = (props: { controller: PreferenceController; state: PreferenceState; conversationId: string; transport: PreferenceTransport }) => ReactNode;
export type CoachVoiceSlot = (props: { conversationId: string; onUse: (text: string) => boolean }) => ReactNode;
type Props = { identity: string; subjectId?: string; example?: ConversationTransport; preferenceTransport?: PreferenceTransport; memoryTransport?: MemoryTransport; dietTransport?: DietTransport; historyTransport?: HistoryTransport; contextSlot?: CoachContextSlot; voiceSlot?: CoachVoiceSlot };
export default function GlobalCoach(props: Props) {
  return <CoachSurface key={`${props.identity}:${props.subjectId ?? props.identity}`} {...props} />;
}
function CoachSurface({ identity, subjectId, example, preferenceTransport, memoryTransport, dietTransport, historyTransport, contextSlot, voiceSlot }: Props) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
  const publishedSelection = useSyncExternalStore(subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection);
  const selection = acceptedScreenSelection(publishedSelection, path, identity, subjectId);
  const [controller] = useState(() => new ConversationController());
  const [voice] = useState(() => new VoiceController());
  const [food] = useState(() => new FoodQuantityController());
  const foodState = useSyncExternalStore(food.subscribe, food.snapshot, food.snapshot);
  const voiceState = useSyncExternalStore(voice.subscribe, voice.snapshot, voice.snapshot);
  const voiceActive = ['requesting', 'recording', 'stopping'].includes(voiceState.phase);
  const [attachments] = useState(() => new AttachmentController());
  const attachmentState = useSyncExternalStore(attachments.subscribe, attachments.snapshot, attachments.snapshot);
  const [preferences] = useState(() => new PreferenceController());
  const preferenceState = useSyncExternalStore(preferences.subscribe, preferences.snapshot, preferences.snapshot);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [memory] = useState(() => new MemoryController(state.conversationId));
  const memoryState = useSyncExternalStore(memory.subscribe, memory.snapshot, memory.snapshot);
  const historyEnabled = process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED === '1' && (!example || Boolean(historyTransport)) && (!subjectId || subjectId === identity);
  const memoryEnabled = process.env.NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED === '1' && (!historyEnabled || state.durable) && (!example || Boolean(memoryTransport)) && (!subjectId || subjectId === identity);
  const [diet] = useState(() => new DietController());
  const dietState = useSyncExternalStore(diet.subscribe, diet.snapshot, diet.snapshot);
  const dietEnabled = process.env.NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED === '1' && (!historyEnabled || state.durable) && (!example || Boolean(dietTransport)) && (!subjectId || subjectId === identity);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [includeScreen, setIncludeScreen] = useState(true);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [panelTop, setPanelTop] = useState(64);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const scope = `${identity}:${subjectId ?? identity}`;
  useEffect(() => { controller.identify(scope); return () => controller.identify(null); }, [controller, scope]);
  useEffect(() => () => preferences.reset(), [preferences]);
  useEffect(() => () => attachments.reset(), [attachments]);
  useEffect(() => () => voice.reset(), [voice]);
  useEffect(() => () => food.reset(), [food]);
  useEffect(() => () => memory.reset(), [memory]);
  useEffect(() => () => diet.reset(), [diet]);
  useEffect(() => { memory.identify(state.conversationId); }, [memory, state.conversationId]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED !== '1' || example || subjectId && subjectId !== identity) return;
    const select = (event: Event) => {
      const selection = readFoodSelection(event);
      if (!selection || selection.actorId !== identity) return;
      voice.reset(); food.select(selection.entryId, state.conversationId, requestFoodQuantity); setOpen(true);
    };
    window.addEventListener(COACH_FOOD_SELECT, select);
    return () => window.removeEventListener(COACH_FOOD_SELECT, select);
  }, [example, food, identity, state.conversationId, subjectId, voice]);
  useEffect(() => {
    if (!foodState.receipt || foodState.pending || foodState.error || !foodState.entry) return;
    window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: identity, entryId: foodState.entry.entryId } }));
  }, [foodState.receipt, foodState.pending, foodState.error, foodState.entry, identity]);
  useEffect(() => { setAnchor(document.getElementById('global-coach-anchor')); }, []);
  useEffect(() => {
    if (!open) return;
    const header = anchor?.closest('header');
    const measure = () => setPanelTop(Math.max(64, header?.getBoundingClientRect().bottom ?? 64));
    measure(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [anchor, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    if (followLatest.current && !window.getSelection()?.toString()) log.current?.scrollTo({ top: log.current.scrollHeight });
    else setShowLatest(true);
  }, [open, state.turns, state.pending]);
  const close = () => { controller.cancel(); preferences.cancel(); attachments.cancel(); voice.reset(); food.cancel(); memory.cancel(); diet.cancel(); setOpen(false); launcher.current?.focus(); };
  const send = () => !voiceActive && controller.send({ surface, includeScreen, ...(includeScreen && selection ? selection.anatomy ? { anatomy: selection.anatomy } : { entity: selection.entity } : {}), ...(subjectId ? { clientId: subjectId } : {}) }, example ?? requestConversation, attachments.references(), historyEnabled ? (requestId, title, signal) => {
    const create = (historyTransport ?? requestHistory).create;
    if (!create) return Promise.reject(new Error('history_unavailable'));
    return create(requestId, title, signal);
  } : undefined);
  const latestResponse = state.turns.findLast(turn => turn.response?.ok)?.response;
  useEffect(() => { if (latestResponse) attachments.reconcile(latestResponse.attachments); }, [attachments, latestResponse]);
  const launch = <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="global-coach" onClick={() => open ? close() : setOpen(true)}>
      <MessageCircle size={19} aria-hidden="true" />{t('global_coach.open')}
    </button>;
  return <div className={styles.root}>
    {anchor ? createPortal(launch, anchor) : launch}
    {open && <section id="global-coach" className={styles.panel} style={{ top: panelTop }} aria-labelledby="global-coach-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}><div><h2 id="global-coach-title">{t('global_coach.title')}</h2><p>{t(example ? 'global_coach.example' : 'global_coach.identity')}</p></div><button type="button" onClick={close} aria-label={t('global_coach.close')}><X size={22} /></button></header>
      {latestResponse && <ContextCards response={latestResponse} conversationId={state.conversationId} subjectId={subjectId} hideMemories={memoryEnabled} onExpand={() => voice.reset()} controller={preferences} state={preferenceState} transport={preferenceTransport ?? requestPreference}>{contextSlot?.({ controller: preferences, state: preferenceState, conversationId: state.conversationId, transport: preferenceTransport ?? requestPreference })}</ContextCards>}
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => {
        const node = log.current; if (!node) return;
        followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        if (followLatest.current) setShowLatest(false);
      }}>
        {foodState.entryId && <FoodQuantityPanel key={foodState.entryId} controller={food} state={foodState} transport={requestFoodQuantity} />}
        {historyEnabled && <button type="button" onClick={() => {
          voice.reset(); attachments.reset(); preferences.reset(); food.reset(); diet.reset(); memory.reset();
          controller.startNew(); setHistoryOpen(false); input.current?.focus();
        }}>{t('global_coach.new_chat')}</button>}
        {historyEnabled && <details open={historyOpen} className={styles.profile} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>{t('global_coach.saved_chats')}</summary>{historyOpen && <HistoryPanel transport={historyTransport ?? requestHistory} onInvalidate={threadId => {
          if (controller.snapshot().conversationId !== threadId) return;
          voice.reset(); attachments.reset(); preferences.reset(); food.reset(); diet.reset(); memory.reset(); controller.startNew();
        }} onResume={page => {
          voice.reset(); attachments.reset(); preferences.reset(); food.reset(); diet.reset(); memory.reset();
          controller.restore(page.thread.id, page.messages); setHistoryOpen(false); input.current?.focus();
        }} />}</details>}
        {dietEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!dietState.profileId) diet.select(identity, state.conversationId, dietTransport ?? requestDiet); else if (!dietState.profile) void diet.read(dietTransport ?? requestDiet); } }}>
          <summary>{t('global_coach.diet_title')}</summary>
          <DietPanel controller={diet} state={dietState} transport={dietTransport ?? requestDiet} />
        </details>}
        {memoryEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!memoryState.loaded) void memory.read(memoryTransport ?? requestMemory); } }}>
          <summary>{t('global_coach.memory')}</summary>
          <MemoryPanel controller={memory} state={memoryState} transport={memoryTransport ?? requestMemory} />
        </details>}
        {!state.turns.length && !state.restored.length && <p className={styles.intro}>{t('global_coach.intro')}</p>}
        {state.restored.map(item => <article className={styles.turn} key={item.id}><p className={styles.context}>{t('global_coach.saved_message')} · {t(item.role === 'user' ? 'global_coach.you' : 'global_coach.title')}</p><p style={{ whiteSpace: 'pre-wrap' }}>{item.text}</p></article>)}
        {state.turns.map(turn => <article className={styles.turn} key={turn.request.turnId}>
          <p className={styles.question}>{turn.request.message}</p>
          <p className={styles.context}>{t(turn.request.context?.includeScreen ? `global_coach.${turn.request.context.surface}` : 'global_coach.detached')}</p>
          {Boolean(turn.request.attachments?.length) && <p className={styles.context}>{t('global_coach.photos_sent', { count: turn.request.attachments!.length })}</p>}
          {turn.response?.output && <div className={styles.answer}>
            <p>{turn.response.output.answer}</p>
            {!example && turn.response.mode === 'offline' && <p className={styles.context}>{t('global_coach.offline')}</p>}
            {turn.response.evidence.length > 0 && <details><summary>{t('global_coach.sources')}</summary>{turn.response.evidence.map(item => <p key={item.id}>{item.statement}</p>)}{turn.response.output.limitations.length > 0 && <p className={styles.context}>{t('global_coach.limits')}</p>}</details>}
          </div>}
        </article>)}
        {state.pending && <p role="status">{t('global_coach.pending')}</p>}
        {state.error && <p role="status">{t(state.recoveryRequired ? 'global_coach.history_recover' : `global_coach.${state.error}`)}</p>}
      </div>
      {showLatest && <button type="button" className="min-h-11 px-4 text-sm" onClick={() => { followLatest.current = true; setShowLatest(false); log.current?.scrollTo({ top: log.current.scrollHeight }); }}>{t('global_coach.latest')}</button>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        <AttachmentPicker controller={attachments} state={attachmentState} conversationId={state.conversationId} transport={!example && latestResponse?.uploads?.images ? requestAttachment : undefined} disabled={state.pending} />
        <VoiceCapture controller={voice} state={voiceState} disabled={state.pending || attachmentState.pending} />
        {voiceSlot?.({ conversationId: state.conversationId, onUse: text => {
          if (voiceActive || state.pending) return false;
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${text}` : text;
          if (combined.length > 2000) return false;
          controller.setDraft(combined);
          return true;
        } })}
        {includeScreen && selection && <button type="button" className={styles.contextToggle} onClick={() => setIncludeScreen(false)} aria-label={`${t('global_coach.remove_selection')}: ${selection.label}`}><span>{selection.label}</span><X size={16} aria-hidden="true" /></button>}
        <label className={styles.contextToggle}><input type="checkbox" checked={includeScreen} onChange={event => setIncludeScreen(event.target.checked)} />{t('global_coach.include')}<span>{t(`global_coach.${surface}`)}</span></label>
        <label className="sr-only" htmlFor="global-coach-question">{t('global_coach.question')}</label>
        <textarea id="global-coach-question" ref={input} maxLength={2000} rows={3} value={state.draft} onChange={event => controller.setDraft(event.target.value)} placeholder={t('global_coach.placeholder')} />
        <div className={styles.actions}><span>{state.draft.length}/2000</span>{state.pending ? <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button> : <button type="submit" disabled={state.recoveryRequired || !state.draft.trim() || attachmentState.pending || voiceActive}><Send size={17} aria-hidden="true" />{t('global_coach.send')}</button>}</div>
      </form>
    </section>}
  </div>;
}
