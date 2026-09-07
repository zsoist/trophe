'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, X } from 'lucide-react';
import { ConversationController, coachSurface, type ConversationTransport } from './conversation-state';
import { requestConversation } from './client';
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

export type CoachContextSlot = (props: { controller: PreferenceController; state: PreferenceState; conversationId: string; transport: PreferenceTransport }) => ReactNode;
export type CoachVoiceSlot = (props: { conversationId: string; onUse: (text: string) => boolean }) => ReactNode;
type Props = { identity: string; subjectId?: string; example?: ConversationTransport; preferenceTransport?: PreferenceTransport; contextSlot?: CoachContextSlot; voiceSlot?: CoachVoiceSlot };
export default function GlobalCoach(props: Props) {
  return <CoachSurface key={`${props.identity}:${props.subjectId ?? props.identity}`} {...props} />;
}
function CoachSurface({ identity, subjectId, example, preferenceTransport, contextSlot, voiceSlot }: Props) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
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
  const [open, setOpen] = useState(false);
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
  const close = () => { controller.cancel(); preferences.cancel(); attachments.cancel(); voice.reset(); food.cancel(); setOpen(false); launcher.current?.focus(); };
  const send = () => !voiceActive && controller.send({ surface, includeScreen, ...(subjectId ? { clientId: subjectId } : {}) }, example ?? requestConversation, attachments.references());
  const latestResponse = state.turns.findLast(turn => turn.response?.ok)?.response;
  useEffect(() => { if (latestResponse) attachments.reconcile(latestResponse.attachments); }, [attachments, latestResponse]);
  const launch = <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="global-coach" onClick={() => open ? close() : setOpen(true)}>
      <MessageCircle size={19} aria-hidden="true" />{t('global_coach.open')}
    </button>;
  return <div className={styles.root}>
    {anchor ? createPortal(launch, anchor) : launch}
    {open && <section id="global-coach" className={styles.panel} style={{ top: panelTop }} aria-labelledby="global-coach-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}><div><h2 id="global-coach-title">{t('global_coach.title')}</h2><p>{t(example ? 'global_coach.example' : 'global_coach.identity')}</p></div><button type="button" onClick={close} aria-label={t('global_coach.close')}><X size={22} /></button></header>
      {latestResponse && <ContextCards response={latestResponse} conversationId={state.conversationId} subjectId={subjectId} onExpand={() => voice.reset()} controller={preferences} state={preferenceState} transport={preferenceTransport ?? requestPreference}>{contextSlot?.({ controller: preferences, state: preferenceState, conversationId: state.conversationId, transport: preferenceTransport ?? requestPreference })}</ContextCards>}
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => {
        const node = log.current; if (!node) return;
        followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        if (followLatest.current) setShowLatest(false);
      }}>
        {foodState.entryId && <FoodQuantityPanel key={foodState.entryId} controller={food} state={foodState} transport={requestFoodQuantity} />}
        {!state.turns.length && <p className={styles.intro}>{t('global_coach.intro')}</p>}
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
        {state.error && <p role="status">{t(`global_coach.${state.error}`)}</p>}
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
        <label className={styles.contextToggle}><input type="checkbox" checked={includeScreen} onChange={event => setIncludeScreen(event.target.checked)} />{t('global_coach.include')}<span>{t(`global_coach.${surface}`)}</span></label>
        <label className="sr-only" htmlFor="global-coach-question">{t('global_coach.question')}</label>
        <textarea id="global-coach-question" ref={input} maxLength={2000} rows={3} value={state.draft} onChange={event => controller.setDraft(event.target.value)} placeholder={t('global_coach.placeholder')} />
        <div className={styles.actions}><span>{state.draft.length}/2000</span>{state.pending ? <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button> : <button type="submit" disabled={!state.draft.trim() || attachmentState.pending || voiceActive}><Send size={17} aria-hidden="true" />{t('global_coach.send')}</button>}</div>
      </form>
    </section>}
  </div>;
}
