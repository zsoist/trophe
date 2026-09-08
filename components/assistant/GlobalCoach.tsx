'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Send, Sparkles, X } from 'lucide-react';
import { ConversationController, coachSurface, type ConversationTransport } from './conversation-state';
import { requestConversation } from './client';
import { acceptedScreenSelection, subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection } from './screen-selection';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';
import { requestAttachment } from './attachment-client';
import { AttachmentController } from './attachment-state';
import { VoiceCapture } from './VoiceCapture';
import { VoiceController } from './voice-state';
import { FoodQuantityController, type FoodTransport } from './food-state';
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
import { ProgressController, type ProgressTransport } from './progress-state';
import { ProgressPanel } from './ProgressPanel';
import { requestProgress } from './progress-client';
import { COACH_PROGRESS_REFRESH } from './progress-events';
import { PhotoFoodController } from './photo-food-state';
import { PhotoFoodPanel } from './PhotoFoodPanel';
import { requestPhotoFood, type PhotoFoodTransport } from './photo-food-client';
import type { CoachConversationResponse, CoachContextHint, CoachSurface as CoachSurfaceName } from '@/agents/coach-assistant/contracts';

const HistoryPanel = dynamic(() => import('./HistoryPanel').then(module => module.HistoryPanel));

export type CoachContextSlot = (props: { identity: string; controller: PreferenceController; state: PreferenceState; conversationId: string; turnId: string; surface: CoachSurfaceName; response: CoachConversationResponse; transport: PreferenceTransport }) => ReactNode;
export type CoachVoiceSlot = (props: { conversationId: string; onUse: (text: string) => boolean }) => ReactNode;
type Props = { identity: string; subjectId?: string; professional?: boolean; example?: ConversationTransport; preferenceTransport?: PreferenceTransport; memoryTransport?: MemoryTransport; dietTransport?: DietTransport; progressTransport?: ProgressTransport; foodTransport?:FoodTransport; photoFoodTransport?:PhotoFoodTransport; historyTransport?: HistoryTransport; contextSlot?: CoachContextSlot; voiceSlot?: CoachVoiceSlot; workspaceHint?: CoachContextHint['workspace'] };
export default function GlobalCoach(props: Props) {
  return <CoachSurface key={`${props.identity}:${props.subjectId ?? props.identity}:${props.professional ? 'professional' : 'self'}`} {...props} />;
}
function CoachSurface({ identity, subjectId, professional = false, example, preferenceTransport, memoryTransport, dietTransport, progressTransport, foodTransport, photoFoodTransport, historyTransport, contextSlot, voiceSlot, workspaceHint }: Props) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
  const publishedSelection = useSyncExternalStore(subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection);
  const selection = acceptedScreenSelection(publishedSelection, path, identity, subjectId);
  const [controller] = useState(() => new ConversationController());
  const [voice] = useState(() => new VoiceController());
  const [food] = useState(() => new FoodQuantityController());
  const foodState = useSyncExternalStore(food.subscribe, food.snapshot, food.snapshot);
  const [photoFood] = useState(() => new PhotoFoodController());
  const photoFoodState = useSyncExternalStore(photoFood.subscribe, photoFood.snapshot, photoFood.snapshot);
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
  const dietEnabled = process.env.NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED === '1' && (!example || Boolean(dietTransport)) && (!subjectId || subjectId === identity);
  const [progress] = useState(() => new ProgressController());
  const progressState = useSyncExternalStore(progress.subscribe, progress.snapshot, progress.snapshot);
  const progressEnabled = surface === 'progress' && process.env.NEXT_PUBLIC_COACH_PROGRESS_ACTIONS_ENABLED === '1' && (!example || Boolean(progressTransport)) && (!subjectId || subjectId === identity);
  const photoFoodEnabled = process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED === '1' && (!example || Boolean(photoFoodTransport)) && (!subjectId || subjectId === identity);
  const activeFoodTransport=foodTransport??requestFoodQuantity;
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
  const professionalMode = professional || Boolean(subjectId && subjectId !== identity);
  const missingProfessionalSubject = professionalMode && !subjectId;
  const serverScope = useRef<string | null>(null);
  useEffect(() => { controller.identify(scope); return () => controller.identify(null); }, [controller, scope]);
  useEffect(() => () => preferences.reset(), [preferences]);
  useEffect(() => () => attachments.reset(), [attachments]);
  useEffect(() => () => voice.reset(), [voice]);
  useEffect(() => () => food.reset(), [food]);
  useEffect(() => () => photoFood.reset(), [photoFood]);
  useEffect(() => () => memory.reset(), [memory]);
  useEffect(() => () => diet.reset(), [diet]);
  useEffect(() => () => progress.reset(), [progress]);
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
  useEffect(()=>{if(!photoFoodState.receipt||!photoFoodState.refreshEntryId)return;food.select(photoFoodState.refreshEntryId,state.conversationId,activeFoodTransport);},[activeFoodTransport,food,photoFoodState.receipt,photoFoodState.refreshEntryId,state.conversationId]);
  useEffect(()=>{if(!photoFoodState.receipt||!photoFoodState.refreshEntryId||foodState.pending||foodState.error||foodState.entry?.entryId!==photoFoodState.refreshEntryId)return;window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH,{detail:{actorId:identity,entryId:photoFoodState.refreshEntryId}}));},[foodState.entry,foodState.error,foodState.pending,identity,photoFoodState.receipt,photoFoodState.refreshEntryId]);
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
  const close = () => { controller.cancel(); preferences.cancel(); attachments.cancel(); voice.reset(); food.cancel(); photoFood.cancel(); memory.cancel(); diet.cancel(); progress.cancel(); setOpen(false); launcher.current?.focus(); };
  const send = () => !voiceActive && !missingProfessionalSubject && controller.send({ surface, includeScreen, ...(includeScreen && selection ? selection.anatomy ? { anatomy: selection.anatomy } : { entity: selection.entity } : {}), ...(includeScreen && workspaceHint ? { workspace: workspaceHint } : {}), ...(subjectId ? { clientId: subjectId } : {}) }, async (request, signal) => {
    const response = await (example ?? requestConversation)(request, signal);
    if (subjectId && subjectId !== identity && response.ok) {
      const snapshot = response.snapshot as (typeof response.snapshot & { scopeKey?: string });
      if (!snapshot || snapshot.subjectId !== subjectId || typeof snapshot.scopeKey !== 'string' || !snapshot.scopeKey
        || serverScope.current && serverScope.current !== snapshot.scopeKey) throw new Error('scope_mismatch');
      serverScope.current = snapshot.scopeKey;
    }
    return response;
  }, attachments.references(), historyEnabled ? (requestId, title, signal) => {
    const create = (historyTransport ?? requestHistory).create;
    if (!create) return Promise.reject(new Error('history_unavailable'));
    return create(requestId, title, signal);
  } : undefined);
  const latestTurn = state.turns.findLast(turn => turn.response?.ok);
  const latestResponse = latestTurn?.response;
  const professionalCapability = subjectId && subjectId !== identity
    ? latestResponse?.snapshot?.capabilities.find(item => item.key === surface as typeof item.key)
    : undefined;
  useEffect(() => { if (latestResponse) attachments.reconcile(latestResponse.attachments); }, [attachments, latestResponse]);
  const launch = <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="global-coach" onClick={() => open ? close() : setOpen(true)}>
      <Sparkles size={19} aria-hidden="true" />{t('global_coach.open')}
    </button>;
  return <div className={styles.root}>
    {anchor ? createPortal(launch, anchor) : launch}
    {open && <section id="global-coach" className={styles.panel} style={{ top: panelTop }} aria-labelledby="global-coach-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}><div><h2 id="global-coach-title">{t('global_coach.title')}</h2><p>{t(example ? 'global_coach.example' : 'global_coach.identity')}</p>{subjectId && subjectId !== identity && <p className={styles.subject}>{t('global_coach.professional_subject', { subject: subjectId.slice(0, 8) })}</p>}</div><button type="button" onClick={close} aria-label={t('global_coach.close')}><X size={22} /></button></header>
      {professionalMode && <p className={styles.professionalNotice}>{t(missingProfessionalSubject ? 'global_coach.professional_select_subject' : 'global_coach.professional_notice')}</p>}
      {professionalCapability && <p className={styles.capabilityStatus}>{t(`global_coach.${surface}`)} · {t(`global_coach.capability_${professionalCapability.status}`)}</p>}
      {latestResponse && latestTurn && <ContextCards response={latestResponse} conversationId={state.conversationId} subjectId={subjectId} hideMemories={memoryEnabled} onExpand={() => voice.reset()} controller={preferences} state={preferenceState} transport={preferenceTransport ?? requestPreference}>{contextSlot?.({ identity, controller: preferences, state: preferenceState, conversationId: state.conversationId, turnId: latestTurn.request.turnId, surface, response: latestResponse, transport: preferenceTransport ?? requestPreference })}</ContextCards>}
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => {
        const node = log.current; if (!node) return;
        followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        if (followLatest.current) setShowLatest(false);
      }}>
        {foodState.entryId && <FoodQuantityPanel key={foodState.entryId} controller={food} state={foodState} transport={activeFoodTransport} />}
        {photoFoodState.attachmentId&&<PhotoFoodPanel controller={photoFood} state={photoFoodState} transport={photoFoodTransport??requestPhotoFood}/>}
        {historyEnabled && <button type="button" onClick={() => {
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.reset(); memory.reset();
          controller.startNew(); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
        }}>{t('global_coach.new_chat')}</button>}
        {historyEnabled && <details open={historyOpen} className={styles.profile} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>{t('global_coach.saved_chats')}</summary>{historyOpen && <HistoryPanel transport={historyTransport ?? requestHistory} onInvalidate={threadId => {
          if (controller.snapshot().conversationId !== threadId) return;
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.reset(); memory.reset(); controller.startNew(); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId);
        }} onResume={page => {
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.reset(); memory.reset();
          controller.restore(page.thread.id, page.messages); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
        }} />}</details>}
        {dietEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!dietState.profileId) diet.select(identity, state.conversationId, dietTransport ?? requestDiet); else if (!dietState.profile) void diet.read(dietTransport ?? requestDiet); } }}>
          <summary>{t('global_coach.diet_title')}</summary>
          <DietPanel controller={diet} state={dietState} transport={dietTransport ?? requestDiet} />
        </details>}
        {progressEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!progressState.subjectId) progress.select(identity, state.conversationId); if (!progress.snapshot().snapshot) void progress.read(progressTransport ?? requestProgress); } }}>
          <summary>{t('global_coach.progress_title')}</summary>
          <ProgressPanel controller={progress} state={progressState} transport={progressTransport ?? requestProgress} onSaved={() => window.dispatchEvent(new CustomEvent(COACH_PROGRESS_REFRESH, { detail: { actorId: identity } }))} />
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
          {Boolean(turn.request.attachments?.length) && <p className={styles.context}>{t(photoFoodEnabled ? 'global_coach.photos_sent_review' : 'global_coach.photos_sent', { count: turn.request.attachments!.length })}</p>}
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
        {photoFoodEnabled&&attachmentState.items.filter(item=>item.state==='available'&&item.reference&&latestResponse?.attachments.some(reference=>reference.id===item.reference!.id&&reference.status==='available')).map(item=><button key={`food-${item.key}`} type="button" className={styles.contextToggle} disabled={photoFoodState.pending} onClick={()=>void photoFood.select(item.reference!.id,state.conversationId,photoFoodTransport??requestPhotoFood)}>{t('global_coach.photo_food_open')}</button>)}
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
        <div className={styles.actions}><span>{state.draft.length}/2000</span>{state.pending ? <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button> : <button type="submit" disabled={missingProfessionalSubject || state.recoveryRequired || !state.draft.trim() || attachmentState.pending || voiceActive}><Send size={17} aria-hidden="true" />{t('global_coach.send')}</button>}</div>
      </form>
    </section>}
  </div>;
}
