import type { Exercise, MuscleGroup } from '@/lib/types';

export type WorkoutStage = 'home' | 'draft' | 'review' | 'live' | 'paused' | 'finishing' | 'completed';
export type WorkoutKind = 'strength' | 'cardio';

export interface DraftExercise {
  exerciseId: string;
  exerciseName?: string;
  muscleGroup?: MuscleGroup;
  targetSets: number;
  targetReps: string;
  /** True when this exercise is linked to the next exercise in the live order. */
  linkedBelow?: boolean;
}

interface WorkoutDraftBase {
  version: 2;
  name: string;
  templateKey?: string;
  templateId?: string | null;
  updatedAt: number;
}

export interface StrengthDraft extends WorkoutDraftBase {
  kind: 'strength';
  exercises: DraftExercise[];
}

export interface CardioDraft extends WorkoutDraftBase {
  kind: 'cardio';
  activity: 'walk' | 'run' | 'cycle' | 'hiit' | 'swim' | 'other';
  durationMinutes: number;
  distanceKm: number | null;
  effort: number | null;
}

export type WorkoutDraft = StrengthDraft | CardioDraft;

export interface LiveClock {
  runningSince: number | null;
  accumulatedMs: number;
}

export interface LiveStartStructureExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  supersetGroup: number | null;
}

export interface LiveStartRequestEnvelope {
  idempotencyKey: string;
  draftFingerprint: string;
  sessionDate: string;
  name: string;
  templateId: string | null;
  kind: WorkoutKind;
  liveStructure: LiveStartStructureExercise[];
}

export interface WorkoutWorkspaceState {
  stage: WorkoutStage;
  draft: WorkoutDraft | null;
  sessionId: string | null;
  clock: LiveClock | null;
  /** Clock mode to restore when a guarded finish is cancelled. */
  finishingFrom?: 'live' | 'paused' | null;
  /** Persisted before a create request so an ambiguous response can be retried safely. */
  clientRequestId: string | null;
  /** Complete immutable live-start request persisted before transport. */
  startRequest?: LiveStartRequestEnvelope | null;
}

export const WORKOUT_DRAFT_VERSION = 2 as const;

type DraftCreatedPayload = {
  name: string;
  kind: WorkoutKind;
  templateKey?: string;
  templateId?: string | null;
  updatedAt?: number;
};

export type WorkoutWorkspaceEvent =
  | { type: 'draft.created'; payload: DraftCreatedPayload }
  | { type: 'draft.updated'; payload: { draft: WorkoutDraft } }
  | { type: 'draft.reviewed' }
  | { type: 'request.keyed'; payload: { clientRequestId: string } }
  | { type: 'request.prepared'; payload: { startRequest: LiveStartRequestEnvelope } }
  | { type: 'live.started'; payload: { sessionId: string; now: number } }
  | { type: 'live.draftUpdated'; payload: { draft: WorkoutDraft } }
  | { type: 'live.paused'; payload: { now: number } }
  | { type: 'live.resumed'; payload: { now: number } }
  | { type: 'live.finishing'; payload: { now: number } }
  | { type: 'live.finishCancelled'; payload: { now: number } }
  | { type: 'live.completed' }
  | { type: 'live.discarded' }
  | { type: 'completed.acknowledged' };

export function createEmptyDraft(kind: WorkoutKind = 'strength', name = '', templateKey?: string, updatedAt = 0, templateId?: string | null): WorkoutDraft {
  if (kind === 'cardio') {
    return { version: WORKOUT_DRAFT_VERSION, name, kind, templateKey, templateId, updatedAt, activity: 'walk', durationMinutes: 0, distanceKm: null, effort: null };
  }
  return { version: WORKOUT_DRAFT_VERSION, name, kind, templateKey, templateId, updatedAt, exercises: [] };
}

export function createInitialWorkspaceState(): WorkoutWorkspaceState {
  return { stage: 'home', draft: null, sessionId: null, clock: null, finishingFrom: null, clientRequestId: null, startRequest: null };
}

export function elapsedActiveMs(clock: LiveClock | null, now: number): number {
  if (!clock) return 0;
  return clock.accumulatedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}

function requireDraft(state: WorkoutWorkspaceState): WorkoutDraft {
  if (!state.draft) throw new Error('A workout draft is required');
  return state.draft;
}

function requireClock(state: WorkoutWorkspaceState): LiveClock {
  if (!state.clock) throw new Error('A live clock is required');
  return state.clock;
}

export function workoutWorkspaceReducer(
  state: WorkoutWorkspaceState,
  event: WorkoutWorkspaceEvent,
): WorkoutWorkspaceState {
  switch (event.type) {
    case 'draft.created':
      if (state.stage !== 'home') throw new Error(`Cannot create a draft from ${state.stage}`);
      return { stage: 'draft', draft: createEmptyDraft(event.payload.kind, event.payload.name, event.payload.templateKey, event.payload.updatedAt ?? 0, event.payload.templateId), sessionId: null, clock: null, finishingFrom: null, clientRequestId: null, startRequest: null };
    case 'draft.updated':
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot update a draft from ${state.stage}`);
      return { ...state, draft: event.payload.draft };
    case 'draft.reviewed':
      requireDraft(state);
      if (state.stage !== 'draft') throw new Error(`Cannot review a draft from ${state.stage}`);
      return { ...state, stage: 'review' };
    case 'request.keyed':
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot key a request from ${state.stage}`);
      if (!event.payload.clientRequestId.trim()) throw new Error('A client request id is required');
      return { ...state, clientRequestId: event.payload.clientRequestId };
    case 'request.prepared':
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot prepare a request from ${state.stage}`);
      if (!event.payload.startRequest.idempotencyKey.trim() || !event.payload.startRequest.draftFingerprint.trim()) {
        throw new Error('A complete client request is required');
      }
      return {
        ...state,
        clientRequestId: event.payload.startRequest.idempotencyKey,
        startRequest: event.payload.startRequest,
      };
    case 'live.started':
      if (!event.payload.sessionId.trim()) throw new Error('A session id is required');
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot start live workout from ${state.stage}`);
      return { ...state, stage: 'live', sessionId: event.payload.sessionId, clock: { runningSince: event.payload.now, accumulatedMs: 0 }, finishingFrom: null };
    case 'live.draftUpdated':
      requireDraft(state);
      if (state.stage !== 'live' && state.stage !== 'paused') throw new Error(`Cannot update a live draft from ${state.stage}`);
      return { ...state, draft: event.payload.draft };
    case 'live.paused': {
      if (state.stage !== 'live') throw new Error(`Cannot pause from ${state.stage}`);
      const clock = requireClock(state);
      return { ...state, stage: 'paused', clock: { runningSince: null, accumulatedMs: elapsedActiveMs(clock, event.payload.now) }, finishingFrom: null };
    }
    case 'live.resumed':
      if (state.stage !== 'paused') throw new Error(`Cannot resume from ${state.stage}`);
      return { ...state, stage: 'live', clock: { ...requireClock(state), runningSince: event.payload.now }, finishingFrom: null };
    case 'live.finishing':
      if (state.stage !== 'live' && state.stage !== 'paused') throw new Error(`Cannot finish from ${state.stage}`);
      return {
        ...state,
        stage: 'finishing',
        clock: state.clock && { runningSince: null, accumulatedMs: elapsedActiveMs(state.clock, event.payload.now) },
        finishingFrom: state.stage,
      };
    case 'live.finishCancelled': {
      if (state.stage !== 'finishing' || (state.finishingFrom !== 'live' && state.finishingFrom !== 'paused')) {
        throw new Error(`Cannot cancel finish from ${state.stage}`);
      }
      const origin = state.finishingFrom;
      return {
        ...state,
        stage: origin,
        clock: { ...requireClock(state), runningSince: origin === 'live' ? event.payload.now : null },
        finishingFrom: null,
      };
    }
    case 'live.completed':
      if (state.stage !== 'finishing') throw new Error(`Cannot complete from ${state.stage}`);
      return { ...state, stage: 'completed', finishingFrom: null };
    case 'live.discarded':
      if (state.stage !== 'finishing') throw new Error(`Cannot discard from ${state.stage}`);
      return createInitialWorkspaceState();
    case 'completed.acknowledged':
      if (state.stage !== 'completed') throw new Error(`Cannot acknowledge completion from ${state.stage}`);
      return createInitialWorkspaceState();
  }
}

// Keep the identity-only exercise dependency explicit for consumers that build events from library rows.
export type ExerciseIdentity = Pick<Exercise, 'id'>;
