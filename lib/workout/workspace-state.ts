import type { Exercise } from '@/lib/types';

export type WorkoutStage = 'home' | 'draft' | 'review' | 'live' | 'paused' | 'finishing' | 'completed';
export type WorkoutKind = 'strength' | 'cardio';

export interface DraftExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
}

interface WorkoutDraftBase {
  version: 2;
  name: string;
  templateKey?: string;
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

export interface WorkoutWorkspaceState {
  stage: WorkoutStage;
  draft: WorkoutDraft | null;
  sessionId: string | null;
  clock: LiveClock | null;
}

export const WORKOUT_DRAFT_VERSION = 2 as const;

type DraftCreatedPayload = {
  name: string;
  kind: WorkoutKind;
  templateKey?: string;
  updatedAt?: number;
};

export type WorkoutWorkspaceEvent =
  | { type: 'draft.created'; payload: DraftCreatedPayload }
  | { type: 'draft.updated'; payload: { draft: WorkoutDraft } }
  | { type: 'draft.reviewed' }
  | { type: 'live.started'; payload: { sessionId: string; now: number } }
  | { type: 'live.paused'; payload: { now: number } }
  | { type: 'live.resumed'; payload: { now: number } }
  | { type: 'live.finishing'; payload: { now: number } }
  | { type: 'live.completed' }
  | { type: 'completed.acknowledged' };

export function createEmptyDraft(kind: WorkoutKind = 'strength', name = '', templateKey?: string, updatedAt = 0): WorkoutDraft {
  if (kind === 'cardio') {
    return { version: WORKOUT_DRAFT_VERSION, name, kind, templateKey, updatedAt, activity: 'walk', durationMinutes: 0, distanceKm: null, effort: null };
  }
  return { version: WORKOUT_DRAFT_VERSION, name, kind, templateKey, updatedAt, exercises: [] };
}

export function createInitialWorkspaceState(): WorkoutWorkspaceState {
  return { stage: 'home', draft: null, sessionId: null, clock: null };
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
      return { stage: 'draft', draft: createEmptyDraft(event.payload.kind, event.payload.name, event.payload.templateKey, event.payload.updatedAt ?? 0), sessionId: null, clock: null };
    case 'draft.updated':
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot update a draft from ${state.stage}`);
      return { ...state, draft: event.payload.draft };
    case 'draft.reviewed':
      requireDraft(state);
      if (state.stage !== 'draft') throw new Error(`Cannot review a draft from ${state.stage}`);
      return { ...state, stage: 'review' };
    case 'live.started':
      if (!event.payload.sessionId.trim()) throw new Error('A session id is required');
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot start live workout from ${state.stage}`);
      return { ...state, stage: 'live', sessionId: event.payload.sessionId, clock: { runningSince: event.payload.now, accumulatedMs: 0 } };
    case 'live.paused': {
      if (state.stage !== 'live') throw new Error(`Cannot pause from ${state.stage}`);
      const clock = requireClock(state);
      return { ...state, stage: 'paused', clock: { runningSince: null, accumulatedMs: elapsedActiveMs(clock, event.payload.now) } };
    }
    case 'live.resumed':
      if (state.stage !== 'paused') throw new Error(`Cannot resume from ${state.stage}`);
      return { ...state, stage: 'live', clock: { ...requireClock(state), runningSince: event.payload.now } };
    case 'live.finishing':
      if (state.stage !== 'live' && state.stage !== 'paused') throw new Error(`Cannot finish from ${state.stage}`);
      return {
        ...state,
        stage: 'finishing',
        clock: state.clock && { runningSince: null, accumulatedMs: elapsedActiveMs(state.clock, event.payload.now) },
      };
    case 'live.completed':
      if (state.stage !== 'finishing') throw new Error(`Cannot complete from ${state.stage}`);
      return { ...state, stage: 'completed' };
    case 'completed.acknowledged':
      if (state.stage !== 'completed') throw new Error(`Cannot acknowledge completion from ${state.stage}`);
      return createInitialWorkspaceState();
  }
}

// Keep the identity-only exercise dependency explicit for consumers that build events from library rows.
export type ExerciseIdentity = Pick<Exercise, 'id'>;
