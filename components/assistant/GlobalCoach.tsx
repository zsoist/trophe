'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { History, Sparkles } from 'lucide-react';
import { ConversationController, coachSurface, type ConversationTransport } from './conversation-state';
import { requestConversation } from './client';
import { AskTropheMark } from './AskTropheMark';
import { AskTropheIcon } from './ask-trophe-icons';
import { ResponseText } from './ResponseText';
import { globalCoachTranslations } from '@/lib/locales/global-coach';
import { acceptedScreenSelection, subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection } from './screen-selection';
import { acceptedScreenDate, subscribeScreenDate, screenDateSnapshot, emptyScreenDate } from './screen-date';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';
import { requestAttachment } from './attachment-client';
import { AttachmentController } from './attachment-state';
import { hasAmbiguousSpokenNumber } from '@/agents/coach-assistant/voice-ambiguity';
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
import type { TextFoodDraft } from '@/agents/coach-assistant/text-food-contract';
import { TextFoodReview, TextFoodRecoveryNotice } from './TextFoodReview';
import { requestTextFood, type TextFoodTransport } from './text-food-client';
import { PhotoFoodPanel } from './PhotoFoodPanel';
import { requestPhotoFood, type PhotoFoodTransport } from './photo-food-client';
import type { CoachConversationResponse, CoachContextHint, CoachSurface as CoachSurfaceName } from '@/agents/coach-assistant/contracts';
import type { LiveTranscriptRow } from '@/lib/voice-live/client-types';
import { mergeVoiceTurns, voiceRowVisible, type VoiceChatEntry } from './LiveVoiceControl';
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
type GlobalCoachSessionRegistry = {
  conversationControllers: Map<string, ConversationController>;
  openCoachScopes: Map<string, string>;
  foodControllers: Map<string, FoodQuantityController>;
  messageControllers: Map<string, MessageController>;
};
declare global {
  interface Window { __tropheGlobalCoachSessionV1?: GlobalCoachSessionRegistry }
}
const createGlobalCoachSessionRegistry = (): GlobalCoachSessionRegistry => ({
  conversationControllers: new Map(),
  openCoachScopes: new Map(),
  foodControllers: new Map(),
  messageControllers: new Map(),
});
// Food and Workout load the coach through separate client chunks. The browser
// registry gives both chunks one private, tab-local session owner.
const globalCoachSession = typeof window === 'undefined'
  ? createGlobalCoachSessionRegistry()
  : (window.__tropheGlobalCoachSessionV1 ??= createGlobalCoachSessionRegistry());
const { conversationControllers, openCoachScopes, foodControllers, messageControllers } = globalCoachSession;
const conversationControllerFor = (scope: string) => {
  const current = conversationControllers.get(scope);
  if (current) return current;
  const controller = new ConversationController();
  controller.identify(scope);
  conversationControllers.set(scope, controller);
  return controller;
};
const foodControllerFor = (scope: string) => {
  const current = foodControllers.get(scope);
  if (current) return current;
  const controller = new FoodQuantityController();
  foodControllers.set(scope, controller);
  return controller;
};
const messageControllerFor = (scope: string) => {
  const current = messageControllers.get(scope);
  if (current) return current;
  const controller = new MessageController();
  messageControllers.set(scope, controller);
  return controller;
};

function resetGlobalCoachConversationSession(scope: string) {
  conversationControllers.get(scope)?.identify(null);
  conversationControllers.delete(scope);
  openCoachScopes.delete(scope);
}

/** Clears all in-memory private state when authentication moves away from an actor or subject. */
export function resetGlobalCoachSession(scope: string) {
  resetGlobalCoachConversationSession(scope);
  foodControllers.get(scope)?.reset();
  foodControllers.delete(scope);
  messageControllers.get(scope)?.reset();
  messageControllers.delete(scope);
}

export function resetGlobalCoachSessionsForActor(actorId: string) {
  const prefix = `${actorId}:`;
  const scopes = new Set([...conversationControllers.keys(), ...foodControllers.keys(), ...messageControllers.keys()]);
  for (const scope of scopes) {
    if (scope.startsWith(prefix)) resetGlobalCoachSession(scope);
  }
}

export type CoachContextSlot = (props: { identity: string; controller: PreferenceController; state: PreferenceState; conversationId: string; turnId: string; surface: CoachSurfaceName; response: CoachConversationResponse; transport: PreferenceTransport }) => ReactNode;
export type CoachVoiceSlot = (props: { onQuery: (text: string, signal: AbortSignal) => Promise<string>; conversationId: string; prepareConversation?: () => Promise<string | null>; onUse: (text: string) => boolean; onSend?: (result: Extract<CoachVoiceResult, { ok: true }>, text: string) => Promise<'sent' | 'ambiguous' | 'failed'>; onTranscript?: (row: LiveTranscriptRow) => void }) => ReactNode;
type Props = { identity: string; subjectId?: string; professional?: boolean; example?: ConversationTransport; preferenceTransport?: PreferenceTransport; memoryTransport?: MemoryTransport; dietTransport?: DietTransport; progressTransport?: ProgressTransport; foodTransport?:FoodTransport; photoFoodTransport?:PhotoFoodTransport; textFoodTransport?:TextFoodTransport; workoutSetTransport?:WorkoutSetTransport; messageTransport?:MessageTransport; historyTransport?: HistoryTransport; contextSlot?: CoachContextSlot; voiceSlot?: CoachVoiceSlot; voiceTranscriptionTransport?: VoiceTranscriptionTransport; reviewedVoiceTransport?: ReviewedVoiceTransport; workspaceHint?: CoachContextHint['workspace'] };

export default function GlobalCoach(props: Props) {
  const [workoutSet] = useState(() => new WorkoutSetController());
  const foodScope = `${props.identity}:${props.subjectId ?? props.identity}`;
  const previousScope = useRef(foodScope);
  const controller = useMemo(() => conversationControllerFor(foodScope), [foodScope]);
  const food = useMemo(() => foodControllerFor(foodScope), [foodScope]);
  const message = useMemo(() => messageControllerFor(foodScope), [foodScope]);
  useEffect(() => {
    if (previousScope.current === foodScope) return;
    resetGlobalCoachConversationSession(previousScope.current);
    previousScope.current = foodScope;
  }, [foodScope]);
  return <CoachSurface key={`${foodScope}:${props.professional ? 'professional' : 'self'}`} {...props} sessionScope={foodScope} conversationController={controller} foodController={food} workoutSetController={workoutSet} messageController={message} />;
}
function CoachSurface({ identity, subjectId, professional = false, example, preferenceTransport, memoryTransport, dietTransport, progressTransport, foodTransport, photoFoodTransport, textFoodTransport, workoutSetTransport, messageTransport, historyTransport, contextSlot, voiceSlot, voiceTranscriptionTransport, reviewedVoiceTransport, workspaceHint, sessionScope, conversationController: controller, foodController: food, workoutSetController, messageController }: Props & { sessionScope: string; conversationController: ConversationController; foodController: FoodQuantityController; workoutSetController: WorkoutSetController; messageController: MessageController }) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
  const publishedSelection = useSyncExternalStore(subscribeScreenSelection, screenSelectionSnapshot, emptyScreenSelection);
  const selection = acceptedScreenSelection(publishedSelection, path, identity, subjectId);
  const publishedDate=useSyncExternalStore(subscribeScreenDate,screenDateSnapshot,emptyScreenDate);
  const screenDate=surface==='food'?acceptedScreenDate(publishedDate,path):null;
  const [voice] = useState(() => new VoiceController());
  const foodState = useSyncExternalStore(food.subscribe, food.snapshot, food.snapshot);
  const [textFoodDraft,setTextFoodDraft]=useState<{conversationId:string;draft:TextFoodDraft}|null>(null);
  const [textFoodBlocked,setTextFoodBlocked]=useState(false);
  const [photoFood] = useState(() => new PhotoFoodController());
  const photoFoodState = useSyncExternalStore(photoFood.subscribe, photoFood.snapshot, photoFood.snapshot);
  const voiceState = useSyncExternalStore(voice.subscribe, voice.snapshot, voice.snapshot);
  const voiceActive = ['requesting', 'recording', 'stopping'].includes(voiceState.phase);
  const [attachments] = useState(() => new AttachmentController(1));
  const [sentPhotos, setSentPhotos] = useState<Record<string, string>>({});
  const sentPhotoUrls = useRef<string[]>([]);
  const [includePhoto, setIncludePhoto] = useState(true);
  const [voiceDraft, setVoiceDraft] = useState<Extract<CoachVoiceResult, { ok: true }> | null>(null);
  const [voiceHost, setVoiceHost] = useState<HTMLDivElement | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceDraftError, setVoiceDraftError] = useState(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const preparingPhotosRef = useRef(false);
  const attachmentState = useSyncExternalStore(attachments.subscribe, attachments.snapshot, attachments.snapshot);
  const [preferences] = useState(() => new PreferenceController());
  const preferenceState = useSyncExternalStore(preferences.subscribe, preferences.snapshot, preferences.snapshot);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => () => { sentPhotoUrls.current.forEach(url => URL.revokeObjectURL(url)); sentPhotoUrls.current = []; }, [state.conversationId]);
  const [memory] = useState(() => new MemoryController(state.conversationId));
  const memoryState = useSyncExternalStore(memory.subscribe, memory.snapshot, memory.snapshot);
  const photoFoodEnabled = process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED === '1' && (!example || Boolean(photoFoodTransport)) && (!subjectId || subjectId === identity);
  const historyEnabled = process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED === '1' && (!example || Boolean(historyTransport)) && (!subjectId || subjectId === identity);
  const prepareVoiceConversation = historyEnabled ? () => {
    const create = (historyTransport ?? requestHistory).create;
    if (!create) return Promise.resolve(null);
    return controller.prepareDurable(t('global_coach.voice_thread_title'), (requestId, title, signal) => create(requestId, title, signal));
  } : undefined;
  const preparePhotoConversation = photoFoodEnabled ? () => {
    const create = (historyTransport ?? requestHistory).create;
    if (!create) return Promise.resolve(null);
    return controller.prepareDurable(t('global_coach.photo_food_title'), (requestId, title, signal) => create(requestId, title, signal));
  } : undefined;
  // The composer and the Send path must agree on exactly one capability: the
  // server advertises private-attachment uploads (`uploads.images`) independently
  // of the client photo-food action flag, so "upload only" is a real state. A
  // photo is attachable precisely when this browser can also upload and send it.
  const uploadsAdvertised = Boolean(state.turns.findLast(turn => turn.response?.ok)?.response?.uploads?.images);
  const photoTransportEnabled = !example
    && (photoFoodEnabled || uploadsAdvertised)
    && (state.durable || Boolean((historyTransport ?? requestHistory).create));
  const memoryEnabled = process.env.NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED === '1' && (!historyEnabled || state.durable) && (!example || Boolean(memoryTransport)) && (!subjectId || subjectId === identity);
  const [diet] = useState(() => new DietController());
  const dietState = useSyncExternalStore(diet.subscribe, diet.snapshot, diet.snapshot);
  const dietEnabled = process.env.NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED === '1' && (!example || Boolean(dietTransport)) && (!subjectId || subjectId === identity);
  const [progress] = useState(() => new ProgressController());
  const progressState = useSyncExternalStore(progress.subscribe, progress.snapshot, progress.snapshot);
  const progressEnabled = surface === 'progress' && process.env.NEXT_PUBLIC_COACH_PROGRESS_ACTIONS_ENABLED === '1' && (!example || Boolean(progressTransport)) && (!subjectId || subjectId === identity);
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
  const coachActionBlocked = textFoodBlocked || preparingPhotos || workoutSetBlocked || foodBlocked || messageBlocked;
  const composerInputBlocked = textFoodBlocked || preparingPhotos || workoutSetBlocked || messageBlocked || foodState.pending || foodState.uncertain || Boolean(foodState.receipt && foodState.error);
  const composerSubmitBlocked = composerInputBlocked;
  const [open, setOpenState] = useState(() => {
    const priorPath = openCoachScopes.get(sessionScope);
    if (!priorPath || priorPath === path) {
      openCoachScopes.delete(sessionScope);
      return false;
    }
    openCoachScopes.set(sessionScope, path);
    return true;
  });
  const setOpen = useCallback((next: boolean) => {
    if (next) openCoachScopes.set(sessionScope, path);
    else openCoachScopes.delete(sessionScope);
    setOpenState(next);
  }, [path, sessionScope]);
  useEffect(() => {
    if (open) openCoachScopes.set(sessionScope, path);
  }, [open, path, sessionScope]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [includeScreen, setIncludeScreen] = useState(true);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Mobile history replaces the thread (its CSS hides .log/.composer); the desktop history column
  // does not. Only the mobile layout gets an inert, out-of-tab-order thread.
  const [mobileThreadHidden, setMobileThreadHidden] = useState(false);
  const [viewportMetrics, setViewportMetrics] = useState<{ height: number; keyboardInset: number; top: number } | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const [speechByTurn, setSpeechByTurn] = useState<Record<string, CoachSpeechDescriptor>>({});
  // Live voice turns stream into the ONE chat history; nothing is stored twice and nothing here
  // ever triggers backend work (the delegated chat turn does that).
  const [voiceRows, setVoiceRows] = useState<VoiceChatEntry[]>([]);
  const appendVoiceRow = useCallback((row: LiveTranscriptRow) => { setVoiceRows(current => mergeVoiceTurns(current, [row])); }, []);
  const professionalMode = professional || Boolean(subjectId && subjectId !== identity);
  const missingProfessionalSubject = professionalMode && !subjectId;
  const serverScope = useRef<string | null>(null);
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
  useEffect(() => { setVoiceRows([]); }, [state.conversationId]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED !== '1' || example || subjectId && subjectId !== identity) return;
    const select = (event: Event) => {
      const selection = readFoodSelection(event);
      if (!selection || selection.actorId !== identity) return;
      voice.reset(); food.select(selection.entryId, state.conversationId, requestFoodQuantity); setOpen(true);
    };
    window.addEventListener(COACH_FOOD_SELECT, select);
    return () => window.removeEventListener(COACH_FOOD_SELECT, select);
  }, [example, food, identity, setOpen, state.conversationId, subjectId, voice]);
  useEffect(() => {
    if (!foodState.receipt || foodState.pending || foodState.error || !foodState.entry) return;
    window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: identity, entryId: foodState.entry.entryId } }));
  }, [foodState.receipt, foodState.pending, foodState.error, foodState.entry, identity]);
  useEffect(()=>{if(!photoFoodState.receipt||!photoFoodState.refreshEntryId||foodState.pending||foodState.error||foodState.entry?.entryId!==photoFoodState.refreshEntryId)return;window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH,{detail:{actorId:identity,entryId:photoFoodState.refreshEntryId}}));},[foodState.entry,foodState.error,foodState.pending,identity,photoFoodState.receipt,photoFoodState.refreshEntryId]);
  useEffect(() => { setAnchor(document.getElementById('global-coach-anchor')); }, []);
  useEffect(() => {
    if (!open) return;
    const visualViewport = window.visualViewport;
    const measure = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const keyboardInset = visualViewport ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop) : 0;
      const top = visualViewport?.offsetTop ?? 0;
      setViewportMetrics(previous => previous?.height === height && previous.keyboardInset === keyboardInset && previous.top === top ? previous : { height, keyboardInset, top });
    };
    let frame=0;
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
    measure();
    visualViewport?.addEventListener('resize', schedule);
    visualViewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      visualViewport?.removeEventListener('resize', schedule);
      visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [open]);
  useEffect(() => { if (open) panel.current?.focus({ preventScroll: true }); }, [open]);
  // Narrow-viewport detection for the mobile history swap; jsdom/older hosts without matchMedia stay
  // on the layout the CSS serves by default (thread visible, history column or in-flow menu).
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileThreadHidden(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const node=input.current;if(!open||!node)return;
    node.style.height='auto';node.style.height=`${Math.min(node.scrollHeight,112)}px`;
  },[open,state.draft]);
  useEffect(() => {
    if (!open) return;
    if (followLatest.current && !window.getSelection()?.toString()) log.current?.scrollTo({ top: log.current.scrollHeight });
    else setShowLatest(true);
  }, [open, state.turns, state.pending]);
  // Hiding the panel must not abort a user-initiated durable turn. Explicit cancel remains in the composer.
  useEffect(() => {
    const node = panel.current;
    if (!open || !node) return;
    const toggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.open || !target.hasAttribute('data-coach-popover')) return;
      setHistoryOpen(false);
      node.querySelectorAll<HTMLDetailsElement>('[data-coach-popover][open]').forEach(item => { if (item !== target) item.open = false; });
    };
    node.addEventListener('toggle', toggle, true);
    return () => node.removeEventListener('toggle', toggle, true);
  }, [open]);
  useEffect(() => {
    const read = (historyTransport ?? requestHistory).recover;
    if (open && historyEnabled && state.recoveryRequired && read) void controller.recover(read);
  }, [open, historyEnabled, state.recoveryRequired, controller, historyTransport]);
  const close = () => { if(textFoodBlocked)return; preferences.cancel(); attachments.cancel(); voice.reset(); food.discard(); food.cancel(); photoFood.cancel(); memory.cancel(); diet.cancel(); progress.cancel(); workoutSetController.cancel(); messageController.cancel(); setOpen(false); };
  useEffect(() => {
    if (!open || !panel.current || !backdrop.current) return;
    const overlayNodes = new Set([panel.current, backdrop.current]);
    const background = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && !overlayNodes.has(node));
    const previous = background.map(node => ({ node, inert: node.hasAttribute('inert') }));
    background.forEach(node => node.setAttribute('inert', ''));
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const body = document.body;
    const saved = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: `-${scrollX}px`, width: '100%', overflow: 'hidden' });
    return () => {
      previous.forEach(({ node, inert }) => inert ? node.setAttribute('inert', '') : node.removeAttribute('inert'));
      Object.assign(body.style, saved);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      if (launcher.current?.isConnected) launcher.current.focus({ preventScroll: true });
    };
  }, [open]);
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), summary, textarea:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter(node => {
      // Only real, visible focus targets may anchor the loop. Hidden regions (mobile history hides
      // the thread/composer) are inert or display:none, and closed disclosures hide their body.
      if (node.hasAttribute('hidden') || node.closest('[hidden], [inert]')) return false;
      const closedDisclosure = node.closest('details:not([open])');
      if (closedDisclosure && closedDisclosure.firstElementChild !== node) return false;
      for (let element: HTMLElement | null = node; element && element !== panel.current; element = element.parentElement) {
        const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      }
      return true;
    });
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const panelStyle = viewportMetrics ? {
    '--coach-viewport-height': `${viewportMetrics.height}px`,
    '--coach-viewport-top': `${viewportMetrics.top}px`,
    '--coach-keyboard-inset': `${viewportMetrics.keyboardInset}px`,
  } as CSSProperties : undefined;
  // On mobile the history view replaces the thread; mark the hidden thread/composer inert so no
  // keyboard or assistive traversal can reach display:none descendants.
  const threadInert = historyOpen && mobileThreadHidden;
  const currentContext = (): CoachContextHint => {
    const contextualSelection = includeScreen && selection
      ? selection.anatomy ? { anatomy: selection.anatomy } : { entity: selection.entity }
      : includeScreen && surface === 'food' && foodState.entry
        ? { entity: { kind: 'meal' as const, id: foodState.entry.entryId } }
        : {};
    const foodReceipt = includeScreen && surface === 'food' && foodState.receipt?.status === 'applied' && foodState.entry
      ? { foodReceipt: { entryId: foodState.entry.entryId, actionId: foodState.receipt.actionId } }
      : {};
    return { surface, includeScreen, ...(includeScreen&&screenDate?{screenDate}:{}), ...contextualSelection, ...foodReceipt, ...(includeScreen && workspaceHint ? { workspace: workspaceHint } : {}), ...(subjectId ? { clientId: subjectId } : {}) };
  };
  const receiveTextFood=(response:CoachConversationResponse)=>{
    const result=response.textFood;
    if(process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED!=='1'||example&&!textFoodTransport||subjectId&&subjectId!==identity||response.snapshot?.subjectId!==identity||!result?.ok||!('draft'in result))return;
    setTextFoodDraft({conversationId:response.conversationId,draft:result.draft});setTextFoodBlocked(!result.draft.clarification);
  };
  const send = async () => {
    if (voiceActive || voiceBusy || missingProfessionalSubject || composerSubmitBlocked || preparingPhotosRef.current || controller.snapshot().pending || controller.snapshot().recoveryRequired || !controller.snapshot().draft.trim()) return;
    if (voiceDraft && hasAmbiguousSpokenNumber(controller.snapshot().draft)) { setVoiceDraftError(true); return; }
    const selectedPhotos = attachments.snapshot().items;
    if (selectedPhotos.length) {
      if (!photoTransportEnabled || attachments.snapshot().pending) return;
      preparingPhotosRef.current = true; setPreparingPhotos(true);
      try {
        const create = (historyTransport ?? requestHistory).create;
        const conversationId = controller.snapshot().durable ? controller.snapshot().conversationId
          : create ? await controller.prepareDurable(controller.snapshot().draft, create) : null;
        if (!conversationId) return;
        for (const selected of selectedPhotos) {
          const item = attachments.snapshot().items.find(current => current.key === selected.key);
          if (!item || controller.snapshot().conversationId !== conversationId) return;
          if (item.state === 'uncertain') await attachments.check(item.key, conversationId, requestAttachment);
          const current = attachments.snapshot().items.find(value => value.key === item.key);
          if (current?.state === 'selected' || current?.state === 'retryable') await attachments.upload(item.key, conversationId, requestAttachment);
          if (attachments.snapshot().items.find(value => value.key === item.key)?.state !== 'available') return;
        }
        if (attachments.references().length !== selectedPhotos.length) return;
      } finally { preparingPhotosRef.current = false; setPreparingPhotos(false); }
    }
    const currentPhotos = attachments.references();
    const earlierPhoto = controller.snapshot().turns.findLast(turn => turn.response?.ok && turn.request.attachments?.length)?.request.attachments ?? [];
    const messagePhotos = currentPhotos.length ? currentPhotos : includePhoto ? earlierPhoto : [];
    if (currentPhotos.length) setIncludePhoto(true);
    if (foodState.proposal) food.discard();
    return controller.send(currentContext(), async (request, signal) => {
      if (selectedPhotos.length) {
        const photos: Record<string, string> = {};
        for (const item of attachments.snapshot().items) if (item.reference) {
          const url = URL.createObjectURL(item.file); sentPhotoUrls.current.push(url); photos[item.reference.id] = url;
        }
        setSentPhotos(current => ({ ...current, ...photos }));
        attachments.reset();
      }
      const voiceTransport = reviewedVoiceTransport ?? (!example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? requestReviewedVoiceTurn : undefined);
      let response: CoachConversationResponse;
      if (voiceDraft && !voiceTransport) throw new Error('voice_review_unavailable');
      if (voiceDraft && voiceTransport) {
        const { message, ...requestTail } = request;
        const reviewed = await voiceTransport({ voice: voiceDraft, editedText: message, reviewed: true, request: requestTail, offerSpeech: true }, signal);
        if (!reviewed.ok) throw new Error(reviewed.error);
        response = reviewed.response;
        if (reviewed.speech) setSpeechByTurn(current => ({ ...current, [request.turnId]: reviewed.speech! }));
      } else response = await (example ?? requestConversation)(request, signal);
      if (response.ok) { receiveTextFood(response); setVoiceDraft(null); setVoiceDraftError(false); }
      if (subjectId && subjectId !== identity && response.ok) {
        const snapshot = response.snapshot as (typeof response.snapshot & { scopeKey?: string });
        if (!snapshot || snapshot.subjectId !== subjectId || typeof snapshot.scopeKey !== 'string' || !snapshot.scopeKey
          || serverScope.current && serverScope.current !== snapshot.scopeKey) throw new Error('scope_mismatch');
        serverScope.current = snapshot.scopeKey;
      }
      return response;
    }, messagePhotos, historyEnabled ? (requestId, title, signal) => {
      const create = (historyTransport ?? requestHistory).create;
      if (!create) return Promise.reject(new Error('history_unavailable'));
      return create(requestId, title, signal);
    } : undefined, voiceDraft?.turnId);
  };
  const sendVoice = async (result: Extract<CoachVoiceResult, { ok: true }>, text: string): Promise<'sent' | 'ambiguous' | 'failed'> => {
    if (voiceActive || controller.snapshot().pending || controller.snapshot().recoveryRequired || coachActionBlocked || missingProfessionalSubject || subjectId && subjectId !== identity) return 'failed';
    controller.setDraft(text);
    let outcome: 'sent' | 'ambiguous' | 'failed' = 'failed';
    const transport = reviewedVoiceTransport ?? (!example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? requestReviewedVoiceTurn : undefined);
    if (!transport) return 'failed';
    await controller.send(currentContext(), async (request, signal) => {
      const { message: _message, ...requestTail } = request;
      void _message;
      const reviewed = await transport({ voice: result, editedText: text, reviewed: true, request: requestTail, offerSpeech: true }, signal);
      if (!reviewed.ok) { outcome = reviewed.error === 'ambiguous_number' ? 'ambiguous' : 'failed'; throw new Error(reviewed.error); }
      if(reviewed.response.ok)receiveTextFood(reviewed.response);
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
  const startNewConversation = () => {
    if (controller.snapshot().pending || controller.snapshot().recovering) return;
    voice.reset(); setVoiceDraft(null); setVoiceDraftError(false); setIncludePhoto(true); attachments.reset(); preferences.moveConversation(); food.moveConversation(); memory.reset();
    setVoiceRows([]);
    workoutSetController.moveConversation(); controller.startNew(); messageController.moveConversation(controller.snapshot().conversationId);
    photoFood.moveConversation(controller.snapshot().conversationId); diet.moveConversation(controller.snapshot().conversationId);
    progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
  };
  // Voice turns already present in the thread (the delegated question and the answer with its
  // proposals/cards) are not repeated; only live speech the thread does not yet carry is shown.
  const visibleVoiceRows = voiceRows.filter(row => voiceRowVisible(row, {
    user: [...state.turns.map(turn => turn.request.message), ...state.restored.filter(message => message.role === 'user').map(message => message.text)],
    assistant: [
      ...state.turns.map(turn => turn.response?.output?.answer).filter((text): text is string => Boolean(text)),
      ...state.restored.filter(message => message.role === 'assistant').map(message => message.text),
    ],
  }));
  const launch = <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="global-coach" onClick={() => open ? close() : setOpen(true)}>
      <AskTropheMark size={32} />{t('global_coach.open')}
    </button>;
  return <div className={styles.root}>
    {anchor ? createPortal(launch, anchor) : launch}
    {open && createPortal(<>
      <button ref={backdrop} type="button" className={styles.backdrop} onClick={close} aria-hidden="true" tabIndex={-1} />
      <section ref={panel} id="global-coach" className={styles.panel} data-history={historyOpen ? 'true' : 'false'} style={panelStyle} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="global-coach-title" onKeyDown={handleDialogKeyDown}>
      <header className={styles.header}>
        <div className={styles.identity}><span className={styles.mark}><AskTropheMark size={32} /></span><div><h2 id="global-coach-title">{t('global_coach.title')}</h2><p>{t(example ? 'global_coach.example' : 'global_coach.identity')}</p>{subjectId && subjectId !== identity && <p className={styles.subject}>{t('global_coach.professional_subject', { subject: subjectId.slice(0, 8) })}</p>}</div></div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconButton} aria-label={t('global_coach.saved_chats')} aria-expanded={historyOpen} onClick={() => { panel.current?.querySelectorAll<HTMLDetailsElement>('[data-coach-popover][open]').forEach(node => { node.open = false; }); setHistoryOpen(current => !current); }}><AskTropheIcon name="history" size={20} /></button>
          <button type="button" className={styles.iconButton} onClick={close} aria-label={t('global_coach.close')}><AskTropheIcon name="close" size={20} /></button>
        </div>
      </header>
      {historyOpen && (
            <aside className={styles.sidebar} aria-label={t('global_coach.saved_chats')}>
            <div className={styles.menuBody}>
              <label className={styles.contextToggle}><input type="checkbox" checked={includePhoto} onChange={event => setIncludePhoto(event.target.checked)} />{t('global_coach.photo_context')}</label>
              <label className={styles.contextToggle}><input type="checkbox" checked={includeScreen} onChange={event => setIncludeScreen(event.target.checked)} />{t('global_coach.include')} · {selection?.label ?? t(`global_coach.${surface}`)}</label>
              {historyEnabled && <button type="button" disabled={coachActionBlocked || state.pending || state.recovering} onClick={startNewConversation}><Sparkles size={16} aria-hidden="true" />{t('global_coach.new_chat')}</button>}
              {historyEnabled && <section><h3 className={styles.historyHeading}><History size={16} aria-hidden="true" />{t('global_coach.saved_chats')}</h3><HistoryPanel transport={historyTransport ?? requestHistory} onInvalidate={threadId => {
                if (controller.snapshot().conversationId !== threadId || coachActionBlocked) return;
                startNewConversation();
              }} onResume={page => {
                if (coachActionBlocked) return;
                if (!controller.restore(page.thread.id, page.messages)) {
                  if (page.thread.id === controller.snapshot().conversationId) { setHistoryOpen(false); input.current?.focus(); }
                  return;
                }
                voice.reset(); setVoiceDraft(null); setVoiceDraftError(false); setIncludePhoto(true); attachments.reset(); preferences.moveConversation(); food.moveConversation(); memory.reset(); workoutSetController.moveConversation(); messageController.moveConversation(controller.snapshot().conversationId); photoFood.moveConversation(controller.snapshot().conversationId);
                setVoiceRows([]);
                diet.moveConversation(controller.snapshot().conversationId); progress.moveConversation(controller.snapshot().conversationId); setHistoryOpen(false); input.current?.focus();
              }} /></section>}
              {dietEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!dietState.profileId) diet.select(identity, state.conversationId, dietTransport ?? requestDiet); else if (!dietState.profile) void diet.read(dietTransport ?? requestDiet); } }}><summary>{t('global_coach.diet_title')}</summary><DietPanel controller={diet} state={dietState} transport={dietTransport ?? requestDiet} /></details>}
              {progressEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!progressState.subjectId) progress.select(identity, state.conversationId); if (!progress.snapshot().snapshot) void progress.read(progressTransport ?? requestProgress); } }}><summary>{t('global_coach.progress_title')}</summary><ProgressPanel controller={progress} state={progressState} transport={progressTransport ?? requestProgress} onSaved={() => window.dispatchEvent(new CustomEvent(COACH_PROGRESS_REFRESH, { detail: { actorId: identity } }))} /></details>}
              {memoryEnabled && <details className={styles.profile} onToggle={event => { if (event.currentTarget.open) { voice.reset(); if (!memoryState.loaded) void memory.read(memoryTransport ?? requestMemory); } }}><summary>{t('global_coach.memory')}</summary><MemoryPanel controller={memory} state={memoryState} transport={memoryTransport ?? requestMemory} /></details>}
            </div>
            {latestResponse && latestTurn && <ContextCards response={latestResponse} conversationId={state.conversationId} subjectId={subjectId} hideMemories={memoryEnabled} onExpand={() => voice.reset()} controller={preferences} state={preferenceState} transport={preferenceTransport ?? requestPreference}>{contextSlot?.({ identity, controller: preferences, state: preferenceState, conversationId: state.conversationId, turnId: latestTurn.request.turnId, surface, response: latestResponse, transport: preferenceTransport ?? requestPreference })}</ContextCards>}
            </aside>
      )}
      {professionalMode && <p className={styles.professionalNotice}>{t(missingProfessionalSubject ? 'global_coach.professional_select_subject' : 'global_coach.professional_notice')}</p>}
      {professionalCapability && <p className={styles.capabilityStatus}>{t(`global_coach.${surface}`)} · {t(`global_coach.capability_${professionalCapability.status}`)}</p>}
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-relevant="additions text" inert={threadInert || undefined} onScroll={() => {
        const node = log.current; if (!node) return;
        followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        if (followLatest.current) setShowLatest(false);
      }}>
        {process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED==='1'&&(!example||textFoodTransport)&&(!subjectId||subjectId===identity)&&textFoodDraft?.conversationId!==state.conversationId&&<TextFoodRecoveryNotice key={state.conversationId} conversationId={state.conversationId} transport={textFoodTransport??requestTextFood} onReceipt={receipt=>{for(const entryId of receipt.entryIds)window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH,{detail:{actorId:identity,entryId}}));}}/>}
        {textFoodDraft?.conversationId===state.conversationId&&<TextFoodReview key={`${state.conversationId}:${textFoodDraft.draft.id}`} draft={textFoodDraft.draft} conversationId={state.conversationId} transport={textFoodTransport??requestTextFood} onDismiss={()=>{setTextFoodDraft(null);setTextFoodBlocked(false);}} onReceipt={receipt=>{setTextFoodBlocked(false);for(const entryId of receipt.entryIds)window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH,{detail:{actorId:identity,entryId}}));}}/>}
        {(foodState.intentId || foodState.entryId) && <FoodQuantityPanel key={foodState.intentId ?? foodState.entryId} controller={food} state={foodState} transport={activeFoodTransport} />}
        {workoutSetSelf && workoutSetState.intentId && <WorkoutSetPanel controller={workoutSetController} state={workoutSetState} transport={activeWorkoutSetTransport} />}
        {messageEnabled && messageState.intentId && <MessagePanel controller={messageController} state={messageState} transport={activeMessageTransport} />}

        {!state.turns.length && !state.restored.length && <p className={styles.intro}>{t('global_coach.intro')}</p>}
        {state.restored.map(item => <article className={styles.turn} key={item.id}><p className={styles.context}>{t('global_coach.saved_message')} · {t(item.role === 'user' ? 'global_coach.you' : 'global_coach.title')}</p><ResponseText text={item.text} assistant={item.role === 'assistant'} userStatement={state.restored.find(message => message.turnId === item.turnId && message.role === 'user')?.text} /></article>)}
        {state.turns.map(turn => <article className={styles.turn} key={turn.request.turnId}>
          <p className={styles.question}>{turn.request.message}</p>

          {turn.request.attachments?.filter(ref => state.turns.find(item => item.request.attachments?.some(photo => photo.id === ref.id))?.request.turnId === turn.request.turnId).map(ref => <div key={ref.id} className={styles.messagePhoto}>
            {sentPhotos[ref.id] && <details><summary aria-label={t('global_coach.photo_expand')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sentPhotos[ref.id]} alt={t('global_coach.photos')} width={64} height={64} />
            </summary><div className={styles.expandedPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sentPhotos[ref.id]} alt={t('global_coach.photos')} />
            </div></details>}
            {photoFoodEnabled && ref.status === 'available' && !state.pending && <button type="button" className={styles.contextToggle} disabled={photoFoodState.pending} onClick={() => void photoFood.select(ref.id, state.conversationId, photoFoodTransport ?? requestPhotoFood)}>{t('global_coach.photo_food_open')}</button>}
            {photoFoodState.attachmentId === ref.id && <PhotoFoodPanel onOpenFoodLog={!professionalMode&&!example?close:undefined} controller={photoFood} state={photoFoodState} transport={photoFoodTransport??requestPhotoFood} onReceipt={entryId=>food.select(entryId,state.conversationId,activeFoodTransport)}/>}
          </div>)}
          {String(turn.response?.error?.code) === 'attachment_analysis_failed' && !turn.recovered && <p role="status" className={styles.answer}>{t('global_coach.photo_analysis_failed')}</p>}
          {turn.recovered && <div className={styles.answer}><ResponseText assistant userStatement={turn.request.message} text={turn.recovered.find(item => item.role === 'assistant')?.text ?? ''} /><p className={styles.context}>{t('global_coach.saved_message')}</p></div>}
          {!turn.recovered && turn.response?.output && <div className={styles.answer}>
            <ResponseText assistant userStatement={turn.request.message} text={turn.response.output.answer} />
            {speechByTurn[turn.request.turnId] && <VoiceAnswerPlayback descriptor={speechByTurn[turn.request.turnId]} text={turn.response.output.answer} />}
            {!example && turn.response.mode === 'offline' && <p className={styles.context}>{t('global_coach.offline')}</p>}
            {(turn.response.evidence.length > 0 || turn.response.output.limitations.length > 0) && <details>
              <summary>{t('global_coach.response_basis')}</summary>
              {turn.response.evidence.map(item => <p key={item.id}>{item.statement}</p>)}
              {turn.response.output.limitations.map((limitation, index) => <p className={styles.context} key={`${turn.request.turnId}-limitation-${index}`}>{globalCoachTranslations[`global_coach.limit_${limitation}`] ? t(`global_coach.limit_${limitation}`) : limitation.replace(/_/g, ' ')}</p>)}
            </details>}
          </div>}
        </article>)}
        {visibleVoiceRows.map(row => <article className={styles.turn} key={row.id}>
          <p className={styles.context}>{t(row.speaker === 'user' ? 'global_coach.live_you' : 'global_coach.live_assistant')}</p>
          <p className={row.speaker === 'user' ? styles.question : styles.answer}>{row.text}</p>
        </article>)}
        {state.pending && <p className={styles.pending} role="status"><span aria-hidden="true" />{t(state.turns.at(-1)?.request.attachments?.length ? 'global_coach.preparing_photo_answer' : 'global_coach.preparing_answer')}</p>}
        {state.error && <div role="status"><p>{t(state.recovering ? 'global_coach.history_checking' : state.recoveryRequired ? 'global_coach.history_waiting' : `global_coach.${state.error}`)}</p>{state.recoveryRequired && <button type="button" className={styles.recoveryButton} disabled={state.recovering} onClick={() => { const read = (historyTransport ?? requestHistory).recover; if (read) void controller.recover(read); }}>{t('global_coach.history_check')}</button>}</div>}
      </div>
      {showLatest && <button type="button" className={`${styles.latestButton} min-h-11 px-4 text-sm`} inert={historyOpen || undefined} onClick={() => { followLatest.current = true; setShowLatest(false); log.current?.scrollTo({ top: log.current.scrollHeight }); }}>{t('global_coach.latest')}</button>}
      <form className={styles.composer} inert={threadInert || undefined} onSubmit={event => { event.preventDefault(); void send(); }}>
        <AttachmentPicker compact deferUpload maxPhotos={1} controller={attachments} state={attachmentState} conversationId={state.conversationId} transport={photoTransportEnabled ? requestAttachment : undefined} analysisEnabled={photoFoodEnabled} prepareConversation={photoFoodEnabled && !state.durable ? preparePhotoConversation : undefined} disabled={state.pending || coachActionBlocked} />

        <div ref={setVoiceHost} />
        {voiceDraft && <p className={styles.context}>{t('global_coach.voice_edit')}</p>}
        {voiceDraftError && <p role="alert">{t('global_coach.voice_composer_full')}</p>}
        <div className={styles.composeRail}>

        <label className="sr-only" htmlFor="global-coach-question">{t('global_coach.question')}</label>
        <textarea id="global-coach-question" ref={input} disabled={composerInputBlocked || voiceBusy} maxLength={2000} rows={1} value={state.draft} onChange={event => { controller.setDraft(event.target.value); }} placeholder={t('global_coach.placeholder')} />
        <VoiceCapture statusHost={voiceHost} onBusy={setVoiceBusy} onTranscript={result => {
          if (!reviewedVoiceTransport && (example || process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED !== '1')) { setVoiceDraftError(true); return; }
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${result.transcript.text}` : result.transcript.text;
          if (combined.length > 2000) { setVoiceDraftError(true); return; }
          controller.setDraft(combined);
          setVoiceDraft(result); setVoiceDraftError(false);
          input.current?.focus({ preventScroll: true });
        }} compact key={state.conversationId} controller={voice} state={voiceState} disabled={state.pending || attachmentState.pending || coachActionBlocked} conversationId={state.conversationId} transcribe={subjectId && subjectId !== identity ? undefined : voiceTranscriptionTransport} prepareConversation={voiceTranscriptionTransport ? prepareVoiceConversation : undefined} onUse={text => {
          if (voiceActive || state.pending || coachActionBlocked) return false;
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${text}` : text;
          if (combined.length > 2000) return false;
          controller.setDraft(combined); return true;
        }} onSend={reviewedVoiceTransport || !example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? sendVoice : undefined} />
        {voiceSlot?.({ onQuery: async (text, signal) => {
          const before = controller.snapshot();
          signal.throwIfAborted();
          if (before.pending || before.recoveryRequired || before.draft.trim() || voiceActive || voiceBusy || coachActionBlocked || text.length > 2000) throw new Error('conversation_busy');
          controller.setDraft(text);
          const cancel = () => { if (controller.snapshot().conversationId === before.conversationId) controller.cancel(); };
          signal.addEventListener('abort', cancel, { once: true });
          try {
            await send();
            signal.throwIfAborted();
            const after = controller.snapshot();
            if (after.conversationId !== before.conversationId) throw new Error('conversation_changed');
            const response = after.turns.at(-1)?.response;
            if (!response?.ok || !response.output?.answer) throw new Error('response_unavailable');
            return response.output.answer;
          } finally { signal.removeEventListener('abort', cancel); }
        }, conversationId: state.conversationId, prepareConversation: prepareVoiceConversation, onUse: text => {
          if (voiceActive || state.pending || coachActionBlocked) return false;
          const current = controller.snapshot().draft;
          const combined = current.trim() ? `${current}\n${text}` : text;
          if (combined.length > 2000) return false;
          controller.setDraft(combined);
          return true;
        }, onSend: reviewedVoiceTransport || !example && process.env.NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED === '1' ? sendVoice : undefined, onTranscript: appendVoiceRow })}
        <button type={state.pending ? 'button' : 'submit'} className={styles.sendButton} onClick={state.pending ? () => controller.cancel() : undefined} disabled={preparingPhotos || !state.pending && (missingProfessionalSubject || state.recoveryRequired || !state.draft.trim() || attachmentState.pending || voiceActive || voiceBusy || composerSubmitBlocked)} aria-label={t(state.pending ? 'global_coach.cancel' : 'global_coach.send')}><AskTropheIcon name={state.pending ? 'end' : 'send'} size={17} /></button>
        </div>
      </form>
    </section></>, document.body)}
  </div>;
}
