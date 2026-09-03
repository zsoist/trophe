import type { Exercise, MuscleGroup, PainFlag } from '@/lib/types';

export type WorkoutStage = 'home' | 'draft' | 'review' | 'live' | 'paused' | 'finishing' | 'completed';
export type WorkoutKind = 'strength' | 'cardio';

export interface DraftExercise {
  exerciseId: string;
  exerciseName?: string;
  muscleGroup?: MuscleGroup;
  targetSets: number;
  targetReps: string;
  /** Draft-only rest prescription. Older v2 drafts omit it and use the UI default. */
  restSeconds?: number;
  /** Draft-only effort target. Null means no target was prescribed. */
  targetRpe?: number | null;
  /** Draft-only coaching/client note. Routine and live-start storage do not claim to persist it. */
  notes?: string;
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

export interface RetrospectiveSetEnvelope {
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  is_pr: boolean;
  superset_group: number | null;
}

/** Exact completed-workout request persisted before its transport begins. */
export interface RetrospectiveSaveRequestEnvelope {
  idempotencyKey: string;
  payloadFingerprint: string;
  sessionDate: string;
  kind: WorkoutKind;
  name: string;
  templateId: string | null;
  durationMinutes: number;
  painFlags: PainFlag[];
  activity: CardioDraft['activity'] | null;
  distanceKm: number | null;
  effort: number | null;
  sets: RetrospectiveSetEnvelope[];
}

export function retrospectivePayloadFingerprint(payload: Omit<RetrospectiveSaveRequestEnvelope, 'idempotencyKey' | 'payloadFingerprint'>): string {
  return JSON.stringify(payload);
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
  /** Complete immutable retrospective-save request persisted before transport. */
  retrospectiveRequest?: RetrospectiveSaveRequestEnvelope | null;
  /** Immutable facts retained after a retrospective request is reconciled. */
  completedRetrospective?: RetrospectiveSaveRequestEnvelope | null;
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
  | { type: 'draft.reopened' }
  | { type: 'request.keyed'; payload: { clientRequestId: string } }
  | { type: 'request.prepared'; payload: { startRequest: LiveStartRequestEnvelope } }
  | { type: 'retrospective.prepared'; payload: { retrospectiveRequest: RetrospectiveSaveRequestEnvelope } }
  | { type: 'retrospective.saved'; payload: { sessionId: string } }
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
  return { stage: 'home', draft: null, sessionId: null, clock: null, finishingFrom: null, clientRequestId: null, startRequest: null, retrospectiveRequest: null, completedRetrospective: null };
}

export function elapsedActiveMs(clock: LiveClock | null, now: number): number {
  if (!clock) return 0;
  return clock.accumulatedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}

export function isWorkoutDraftReady(draft: WorkoutDraft): boolean {
  if (!draft.name.trim()) return false;
  if (draft.kind === 'cardio') return Number.isFinite(draft.durationMinutes) && draft.durationMinutes > 0;
  return draft.exercises.length > 0 && draft.exercises.every((exercise) =>
    Number.isInteger(exercise.targetSets)
    && exercise.targetSets > 0
    && exercise.targetReps.trim().length > 0);
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
      return { stage: 'draft', draft: createEmptyDraft(event.payload.kind, event.payload.name, event.payload.templateKey, event.payload.updatedAt ?? 0, event.payload.templateId), sessionId: null, clock: null, finishingFrom: null, clientRequestId: null, startRequest: null, retrospectiveRequest: null, completedRetrospective: null };
    case 'draft.updated':
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot update a draft from ${state.stage}`);
      if (state.startRequest || state.retrospectiveRequest) throw new Error('Cannot update a draft while its request is pending');
      return { ...state, draft: event.payload.draft };
    case 'draft.reviewed':
      requireDraft(state);
      if (state.stage !== 'draft') throw new Error(`Cannot review a draft from ${state.stage}`);
      if (state.startRequest || state.retrospectiveRequest) throw new Error('Cannot review a draft while its request is pending');
      return { ...state, stage: 'review' };
    case 'draft.reopened':
      requireDraft(state);
      if (state.stage !== 'review') throw new Error(`Cannot reopen a draft from ${state.stage}`);
      if (state.startRequest || state.retrospectiveRequest) throw new Error('Cannot reopen a draft while its request is pending');
      return { ...state, stage: 'draft' };
    case 'request.keyed':
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot key a request from ${state.stage}`);
      if (state.retrospectiveRequest) throw new Error('Cannot key a live start while a retrospective save is pending');
      if (!event.payload.clientRequestId.trim()) throw new Error('A client request id is required');
      return { ...state, clientRequestId: event.payload.clientRequestId };
    case 'request.prepared':
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot prepare a request from ${state.stage}`);
      if (state.retrospectiveRequest) throw new Error('Cannot prepare a live start while a retrospective save is pending');
      if (!event.payload.startRequest.idempotencyKey.trim() || !event.payload.startRequest.draftFingerprint.trim()) {
        throw new Error('A complete client request is required');
      }
      if (state.startRequest && JSON.stringify(state.startRequest) !== JSON.stringify(event.payload.startRequest)) {
        throw new Error('Cannot replace a pending start request');
      }
      return {
        ...state,
        clientRequestId: event.payload.startRequest.idempotencyKey,
        startRequest: event.payload.startRequest,
      };
    case 'retrospective.prepared': {
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot prepare retrospective save from ${state.stage}`);
      if (state.startRequest) throw new Error('Cannot prepare retrospective save while a live start is pending');
      const request = event.payload.retrospectiveRequest;
      if (!request.idempotencyKey.trim() || !request.payloadFingerprint.trim()) throw new Error('A complete retrospective request is required');
      if (state.retrospectiveRequest && JSON.stringify(state.retrospectiveRequest) !== JSON.stringify(request)) {
        throw new Error('Cannot replace a pending retrospective request');
      }
      return { ...state, clientRequestId: null, retrospectiveRequest: request };
    }
    case 'retrospective.saved': {
      requireDraft(state);
      if ((state.stage !== 'draft' && state.stage !== 'review') || !state.retrospectiveRequest) {
        throw new Error(`Cannot reconcile retrospective save from ${state.stage}`);
      }
      if (!event.payload.sessionId.trim()) throw new Error('A session id is required');
      const completedRetrospective = state.retrospectiveRequest;
      return {
        ...state,
        stage: 'completed',
        sessionId: event.payload.sessionId,
        clock: { runningSince: null, accumulatedMs: completedRetrospective.durationMinutes * 60_000 },
        clientRequestId: null,
        startRequest: null,
        retrospectiveRequest: null,
        completedRetrospective,
      };
    }
    case 'live.started':
      if (!event.payload.sessionId.trim()) throw new Error('A session id is required');
      requireDraft(state);
      if (state.stage !== 'draft' && state.stage !== 'review') throw new Error(`Cannot start live workout from ${state.stage}`);
      if (state.retrospectiveRequest) throw new Error('Cannot start live workout while a retrospective save is pending');
      return {
        ...state,
        stage: 'live',
        sessionId: event.payload.sessionId,
        clock: { runningSince: event.payload.now, accumulatedMs: 0 },
        finishingFrom: null,
        // Acceptance is the only safe point to retire the immutable retry
        // envelope. Ambiguous failures remain byte-for-byte replayable.
        clientRequestId: null,
        startRequest: null,
      };
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
