'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { CoachSpeechDescriptor } from '@/agents/coach-assistant/voice-turn';
import type { ReviewedVoiceTransport, VoiceTranscriptionTransport } from './voice-client';
import { requestReviewedVoiceTurn } from './voice-client';
import { VoiceAnswerPlayback } from './VoiceAnswerPlayback';
import { WorkoutSetController, type WorkoutSetTransport } from './workout-set-state';
import { WorkoutSetPanel } from './WorkoutSetPanel';
import { requestWorkoutSet } from './workout-set-client';
import { acceptedWorkoutSetIntent } from './workout-set-intent';
import { COACH_WORKOUT_SET_REFRESH } from './workout-events';
import { acceptedFoodQuantityIntent } from './food-intent';
import { MessageController, type MessageTransport } from './message-state';
import { MessagePanel } from './MessagePanel';
import { requestCoachMessage } from './message-client';
import { acceptedMessageProposal } from './message-capability';
import { COACH_MESSAGE_REFRESH } from './message-events';

const HistoryPanel = dynamic(() => import('./HistoryPanel').then(module => module.HistoryPanel));
const foodControllers = new Map<string, FoodQuantityController>();
const foodControllerFor = (scope: string) => {
  const current = foodControllers.get(scope);
  if (current) return current;
  const controller = new FoodQuantityController();
  foodControllers.set(scope, controller);
  return controller;
};
const messageControllers = new Map<string, MessageController>();
const messageControllerFor = (scope: string) => {
  const current = messageControllers.get(scope);
  if (current) return current;
  const controller = new MessageController();
  messageControllers.set(scope, controller);
  return controller;
};

export type CoachContextSlot = (props: { identity: string; controller: PreferenceController; state: PreferenceState; conversationId: string; turnId: string; surface: CoachSurfaceName; response: CoachConversationResponse; transport: PreferenceTransport }) => ReactNode;
export type CoachVoiceSlot = (props: { conversationId: string; onUse: (text: string) => boolean; onSend?: (result: Extract<CoachVoiceResult, { ok: true }>, text: string) => Promise<'sent' | 'ambiguous' | 'failed'> }) => ReactNode;
type Props = { identity: string; subjectId?: string; professional?: boolean; example?: ConversationTransport; preferenceTransport?: PreferenceTransport; memoryTransport?: MemoryTransport; dietTransport?: DietTransport; progressTransport?: ProgressTransport; foodTransport?:FoodTransport; photoFoodTransport?:PhotoFoodTransport; workoutSetTransport?:WorkoutSetTransport; messageTransport?:MessageTransport; historyTransport?: HistoryTransport; contextSlot?: CoachContextSlot; voiceSlot?: CoachVoiceSlot; voiceTranscriptionTransport?: VoiceTranscriptionTransport; reviewedVoiceTransport?: ReviewedVoiceTransport; workspaceHint?: CoachContextHint['workspace'] };

export default function GlobalCoach(props: Props) {
  const [workoutSet] = useState(() => new WorkoutSetController());
  const foodScope = `${props.identity}:${props.subjectId ?? props.identity}`;
  const food = useMemo(() => foodControllerFor(foodScope), [foodScope]);
  const message = useMemo(() => messageControllerFor(foodScope), [foodScope]);
  return <CoachSurface key={`${foodScope}:${props.professional ? 'professional' : 'self'}`} {...props} foodController={food} workoutSetController={workoutSet} messageController={message} />;
}
function CoachSurface({ identity, subjectId, professional = false, example, preferenceTransport, memoryTransport, dietTransport, progressTransport, foodTransport, photoFoodTransport, workoutSetTransport, messageTransport, historyTransport, contextSlot, voiceSlot, voiceTranscriptionTransport, reviewedVoiceTransport, workspaceHint, foodController: food, workoutSetController, messageController }: Props & { foodController: FoodQuantityController; workoutSetController: WorkoutSetController; messageController: MessageController }) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
  const publishedSelection = useSyncExternalStore(subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection);
  const selection = acceptedScreenSelection(publishedSelection, path, identity, subjectId);
  const [controller] = useState(() => new ConversationController());
  const [voice] = useState(() => new VoiceController());
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
  const workoutSetState = useSyncExternalStore(workoutSetController.subscribe, workoutSetController.snapshot, workoutSetController.snapshot);
  const messageState = useSyncExternalStore(messageController.subscribe, messageController.snapshot, messageController.snapshot);
  const messageEnabled = (process.env.NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED === '1' || Boolean(example && messageTransport)) && (!subjectId || subjectId === identity);
  const activeMessageTransport = messageTransport ?? requestCoachMessage;
  const activeWorkoutSetTransport = workoutSetTransport ?? requestWorkoutSet;
  const workoutSetSelf = !subjectId || subjectId === identity;
  const workoutSetBlocked = workoutSetSelf && (workoutSetState.pending || Boolean(workoutSetState.proposal) || workoutSetState.uncertain || Boolean(workoutSetState.receipt && workoutSetState.error));
  const activeFoodTransport=foodTransport??requestFoodQuantity;
  const foodBlocked = foodState.pending || Boolean(foodState.proposal) || foodState.uncertain || Boolean(foodState.receipt && foodState.error);
  const messageBlocked = messageEnabled && (messageState.pending || Boolean(messageState.proposal) || messageState.uncertain || Boolean(messageState.receipt && messageState.error));
  const coachActionBlocked = workoutSetBlocked || foodBlocked || messageBlocked;
  const composerInputBlocked = workoutSetBlocked || messageBlocked || foodState.pending || foodState.uncertain || Boolean(foodState.receipt && foodState.error);
  const composerSubmitBlocked = composerInputBlocked;
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
  const [speechByTurn, setSpeechByTurn] = useState<Record<string, CoachSpeechDescriptor>>({});
  const scope = `${identity}:${subjectId ?? identity}`;
  const professionalMode = professional || Boolean(subjectId && subjectId !== identity);
  const missingProfessionalSubject = professionalMode && !subjectId;
  const serverScope = useRef<string | null>(null);
  useEffect(() => { controller.identify(scope); return () => controller.identify(null); }, [controller, scope]);
  useEffect(() => () => preferences.reset(), [preferences]);
  useEffect(() => () => attachments.reset(), [attachments]);
  useEffect(() => () => voice.reset(), [voice]);
  useEffect(() => () => photoFood.reset(), [photoFood]);
  useEffect(() => () => memory.reset(), [memory]);
  useEffect(() => () => diet.reset(), [diet]);
  useEffect(() => () => progress.reset(), [progress]);
  useEffect(() => () => workoutSetController.moveConversation(), [workoutSetController]);
  useEffect(() => () => { messageController.cancel(); }, [messageController]);
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
  const close = () => { controller.cancel(); preferences.cancel(); attachments.cancel(); voice.reset(); food.discard(); food.cancel(); photoFood.cancel(); memory.cancel(); diet.cancel(); progress.cancel(); workoutSetController.cancel(); messageController.cancel(); setOpen(false); launcher.current?.focus(); };
  const currentContext = (): CoachContextHint => {
    const contextualSelection = includeScreen && selection
      ? selection.anatomy ? { anatomy: selection.anatomy } : { entity: selection.entity }
      : includeScreen && surface === 'food' && foodState.entry
        ? { entity: { kind: 'meal' as const, id: foodState.entry.entryId } }
        : {};
    const foodReceipt = includeScreen && surface === 'food' && foodState.receipt?.status === 'applied' && foodState.entry
      ? { foodReceipt: { entryId: foodState.entry.entryId, actionId: foodState.receipt.actionId } }
      : {};
    return { surface, includeScreen, ...contextualSelection, ...foodReceipt, ...(includeScreen && workspaceHint ? { workspace: workspaceHint } : {}), ...(subjectId ? { clientId: subjectId } : {}) };
  };
  const send = () => {
    if (voiceActive || missingProfessionalSubject || composerSubmitBlocked) return;
    if (foodState.proposal) food.discard();
    return controller.send(currentContext(), async (request, signal) => {
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
  };
  const sendVoice = async (result: Extract<CoachVoiceResult, { ok: true }>, text: string): Promise<'sent' | 'ambiguous' | 'failed'> => {
    if (voiceActive || state.pending || coachActionBlocked || missingProfessionalSubject || subjectId && subjectId !== identity) return 'failed';
    controller.setDraft(text);
    let outcome: 'sent' | 'ambiguous' | 'failed' = 'failed';
    const transport = reviewedVoiceTransport ?? (!example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? requestReviewedVoiceTurn : undefined);
    if (!transport) return 'failed';
    await controller.send(currentContext(), async (request, signal) => {
      const { message: _message, ...requestTail } = request;
      void _message;
      const reviewed = await transport({ voice: result, editedText: text, reviewed: true, request: requestTail, offerSpeech: true }, signal);
      if (!reviewed.ok) { outcome = reviewed.error === 'ambiguous_number' ? 'ambiguous' : 'failed'; throw new Error(reviewed.error); }
      outcome = reviewed.response.ok ? 'sent' : 'failed';
      const speech = reviewed.speech;
      if (speech) setSpeechByTurn(current => ({ ...current, [request.turnId]: speech }));
      return reviewed.response;
    }, [], undefined, result.turnId);
    return outcome;
  };
  const latestTurn = state.turns.findLast(turn => turn.response?.ok);
  const latestResponse = latestTurn?.response;
  const professionalCapability = subjectId && subjectId !== identity
    ? latestResponse?.snapshot?.capabilities.find(item => item.key === surface as typeof item.key)
    : undefined;
  useEffect(() => { if (latestResponse) attachments.reconcile(latestResponse.attachments); }, [attachments, latestResponse]);
  useEffect(() => {
    if (!latestResponse || !latestTurn || subjectId && subjectId !== identity) return;
    const intent = acceptedWorkoutSetIntent(latestResponse, identity, state.conversationId, latestTurn.request.turnId, surface);
    if (intent) void workoutSetController.activate(intent.id, state.conversationId, intent.target.reps, activeWorkoutSetTransport);
  }, [activeWorkoutSetTransport, identity, latestResponse, latestTurn, state.conversationId, subjectId, surface, workoutSetController]);
  useEffect(() => {
    if (!latestResponse || !latestTurn || subjectId && subjectId !== identity) return;
    const intent = acceptedFoodQuantityIntent(latestResponse, identity, state.conversationId, latestTurn.request.turnId, surface);
    if (intent) {
      const selectedEntryId = intent.target.entryHintId
        ?? (foodState.entry?.grams === intent.target.previousGrams ? foodState.entry.entryId : null);
      const loggedDateHint = selectedEntryId ? null : latestResponse.snapshot?.window.end;
      void food.activate(intent.id, state.conversationId, intent.target.previousGrams, intent.target.grams, activeFoodTransport, selectedEntryId, loggedDateHint);
    }
  }, [activeFoodTransport, food, foodState.entry, identity, latestResponse, latestTurn, state.conversationId, subjectId, surface]);
  useEffect(() => {
    if (!messageEnabled || !latestResponse || !latestTurn || subjectId && subjectId !== identity) return;
    const proposal = acceptedMessageProposal(latestResponse, identity, state.conversationId, latestTurn.request.turnId);
    if (proposal) messageController.adopt(proposal.hash, state.conversationId, proposal, identity);
  }, [identity, latestResponse, latestTurn, messageController, messageEnabled, state.conversationId, subjectId]);
  useEffect(() => {
    const refresh = workoutSetState.refresh;
    if (!workoutSetSelf || !refresh || !workoutSetState.receipt || workoutSetState.pending || workoutSetState.error) return;
    window.dispatchEvent(new CustomEvent(COACH_WORKOUT_SET_REFRESH, { detail: { actorId: identity, ...refresh } }));
  }, [identity, workoutSetSelf, workoutSetState.error, workoutSetState.pending, workoutSetState.receipt, workoutSetState.refresh]);
  useEffect(() => {
    const refresh = messageState.refresh;
    const receipt = messageState.receipt;
    if (!messageEnabled || !refresh || !receipt || messageState.pending || messageState.error
      || refresh.clientId !== identity || refresh.coachId !== receipt.coachId) return;
    window.dispatchEvent(new CustomEvent(COACH_MESSAGE_REFRESH, { detail: { ...refresh, messageId: receipt.messageId } }));
  }, [identity, messageEnabled, messageState.error, messageState.pending, messageState.receipt, messageState.refresh]);
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
        {(foodState.intentId || foodState.entryId) && <FoodQuantityPanel key={foodState.intentId ?? foodState.entryId} controller={food} state={foodState} transport={activeFoodTransport} />}
        {workoutSetSelf && workoutSetState.intentId && <WorkoutSetPanel controller={workoutSetController} state={workoutSetState} transport={activeWorkoutSetTransport} />}
        {messageEnabled && messageState.intentId && <MessagePanel controller={messageController} state={messageState} transport={activeMessageTransport} />}
        {photoFoodState.attachmentId&&<PhotoFoodPanel controller={photoFood} state={photoFoodState} transport={photoFoodTransport??requestPhotoFood} onReceipt={entryId=>food.select(entryId,state.conversationId,activeFoodTransport)}/>}
        {historyEnabled && <button type="button" disabled={coachActionBlocked} onClick={() => {
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.moveConversation(); memory.reset();
          workoutSetController.moveConversation(); controller.startNew(); messageController.moveConversation(controller.snapshot().conversationId); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
        }}>{t('global_coach.new_chat')}</button>}
        {historyEnabled && <details open={historyOpen} className={styles.profile} onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>{t('global_coach.saved_chats')}</summary>{historyOpen && <HistoryPanel transport={historyTransport ?? requestHistory} onInvalidate={threadId => {
          if (controller.snapshot().conversationId !== threadId) return;
          if (coachActionBlocked) return;
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.moveConversation(); memory.reset(); workoutSetController.moveConversation(); controller.startNew(); messageController.moveConversation(controller.snapshot().conversationId); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId);
        }} onResume={page => {
          if (coachActionBlocked) return;
          voice.reset(); attachments.reset(); preferences.moveConversation(); food.moveConversation(); memory.reset();
          workoutSetController.moveConversation(); controller.restore(page.thread.id, page.messages); messageController.moveConversation(controller.snapshot().conversationId); photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
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
            {speechByTurn[turn.request.turnId] && <VoiceAnswerPlayback descriptor={speechByTurn[turn.request.turnId]} text={turn.response.output.answer} />}
            {!example && turn.response.mode === 'offline' && <p className={styles.context}>{t('global_coach.offline')}</p>}
            {(turn.response.evidence.length > 0 || turn.response.output.limitations.length > 0) && <details>
              <summary>{t('global_coach.response_basis')}</summary>
              {turn.response.evidence.map(item => <p key={item.id}>{item.statement}</p>)}
              {turn.response.output.limitations.map((limitation, index) => <p className={styles.context} key={`${turn.request.turnId}-limitation-${index}`}>{limitation}</p>)}
            </details>}
          </div>}
        </article>)}
        {state.pending && <p role="status">{t('global_coach.pending')}</p>}
        {state.error && <p role="status">{t(state.recoveryRequired ? 'global_coach.history_recover' : `global_coach.${state.error}`)}</p>}
      </div>
      {showLatest && <button type="button" className="min-h-11 px-4 text-sm" onClick={() => { followLatest.current = true; setShowLatest(false); log.current?.scrollTo({ top: log.current.scrollHeight }); }}>{t('global_coach.latest')}</button>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        <AttachmentPicker controller={attachments} state={attachmentState} conversationId={state.conversationId} transport={!example && latestResponse?.uploads?.images ? requestAttachment : undefined} disabled={state.pending || coachActionBlocked} />
        {photoFoodEnabled&&attachmentState.items.filter(item=>item.state==='available'&&item.reference&&latestResponse?.attachments.some(reference=>reference.id===item.reference!.id&&reference.status==='available')).map(item=><button key={`food-${item.key}`} type="button" className={styles.contextToggle} disabled={photoFoodState.pending || coachActionBlocked} onClick={()=>void photoFood.select(item.reference!.id,state.conversationId,photoFoodTransport??requestPhotoFood)}>{t('global_coach.photo_food_open')}</button>)}
        <VoiceCapture key={state.conversationId} controller={voice} state={voiceState} disabled={state.pending || attachmentState.pending || coachActionBlocked} conversationId={state.conversationId} transcribe={subjectId && subjectId !== identity ? undefined : voiceTranscriptionTransport} onUse={text => {
          if (voiceActive || state.pending || coachActionBlocked) return false;
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${text}` : text;
          if (combined.length > 2000) return false;
          controller.setDraft(combined); return true;
        }} onSend={reviewedVoiceTransport || !example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? sendVoice : undefined} />
        {voiceSlot?.({ conversationId: state.conversationId, onUse: text => {
          if (voiceActive || state.pending || coachActionBlocked) return false;
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${text}` : text;
          if (combined.length > 2000) return false;
          controller.setDraft(combined);
          return true;
        }, onSend: reviewedVoiceTransport || !example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? sendVoice : undefined })}
        {includeScreen && selection && <button type="button" className={styles.contextToggle} onClick={() => setIncludeScreen(false)} aria-label={`${t('global_coach.remove_selection')}: ${selection.label}`}><span>{selection.label}</span><X size={16} aria-hidden="true" /></button>}
        <label className={styles.contextToggle}><input type="checkbox" checked={includeScreen} onChange={event => setIncludeScreen(event.target.checked)} />{t('global_coach.include')}<span>{t(`global_coach.${surface}`)}</span></label>
        <label className="sr-only" htmlFor="global-coach-question">{t('global_coach.question')}</label>
        <textarea id="global-coach-question" ref={input} disabled={composerInputBlocked} maxLength={2000} rows={3} value={state.draft} onChange={event => controller.setDraft(event.target.value)} placeholder={t('global_coach.placeholder')} />
        <div className={styles.actions}><span>{state.draft.length}/2000</span>{state.pending ? <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button> : <button type="submit" disabled={missingProfessionalSubject || state.recoveryRequired || !state.draft.trim() || attachmentState.pending || voiceActive || composerSubmitBlocked}><Send size={17} aria-hidden="true" />{t('global_coach.send')}</button>}</div>
      </form>
    </section>}
  </div>;
}
