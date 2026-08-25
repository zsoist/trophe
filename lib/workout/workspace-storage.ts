import type {
  CardioDraft,
  DraftExercise,
  LiveClock,
  LiveStartRequestEnvelope,
  WorkoutDraft,
  WorkoutStage,
  WorkoutWorkspaceState,
} from '@/lib/workout/workspace-state';
import { WORKOUT_DRAFT_VERSION } from '@/lib/workout/workspace-state';
import { normalizeUuid } from '@/lib/workout/uuid';

export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PersistedWorkspaceState = WorkoutWorkspaceState & { version: typeof WORKOUT_DRAFT_VERSION };

const WORKSPACE_STORAGE_PREFIX = 'trophe:workout-workspace:';
const WORKOUT_STAGES: readonly WorkoutStage[] = ['home', 'draft', 'review', 'live', 'paused', 'finishing', 'completed'];
const CARDIO_ACTIVITIES = ['walk', 'run', 'cycle', 'hiit', 'swim', 'other'] as const;

export function workspaceStorageKey(userId: string): string {
  return `${WORKSPACE_STORAGE_PREFIX}${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isDraftExercise(value: unknown): value is DraftExercise {
  if (!isRecord(value) || !hasOnlyKeys(value, ['exerciseId', 'exerciseName', 'muscleGroup', 'targetSets', 'targetReps', 'linkedBelow'])) return false;
  return typeof value.exerciseId === 'string'
    && (value.exerciseName === undefined || typeof value.exerciseName === 'string')
    && (value.muscleGroup === undefined || typeof value.muscleGroup === 'string')
    && typeof value.targetSets === 'number' && Number.isInteger(value.targetSets) && value.targetSets > 0
    && typeof value.targetReps === 'string' && value.targetReps.trim().length > 0
    && (value.linkedBelow === undefined || typeof value.linkedBelow === 'boolean');
}

function isDraft(value: unknown): value is WorkoutDraft {
  if (!isRecord(value) || value.version !== WORKOUT_DRAFT_VERSION
    || typeof value.name !== 'string' || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
    || !hasOnlyKeys(value, value.kind === 'strength'
      ? ['version', 'name', 'templateKey', 'templateId', 'updatedAt', 'kind', 'exercises']
      : ['version', 'name', 'templateKey', 'templateId', 'updatedAt', 'kind', 'activity', 'durationMinutes', 'distanceKm', 'effort'])) return false;
  if (value.templateKey !== undefined && typeof value.templateKey !== 'string') return false;
  if (value.templateId !== undefined && value.templateId !== null && normalizeUuid(value.templateId as string) === null) return false;
  if (value.kind === 'strength') {
    return Array.isArray(value.exercises) && value.exercises.every(isDraftExercise);
  }
  if (value.kind === 'cardio') {
    return CARDIO_ACTIVITIES.includes(value.activity as CardioDraft['activity'])
      && typeof value.durationMinutes === 'number' && Number.isFinite(value.durationMinutes) && value.durationMinutes >= 0
      && (value.distanceKm === null || (typeof value.distanceKm === 'number' && Number.isFinite(value.distanceKm) && value.distanceKm >= 0))
      && (value.effort === null || (typeof value.effort === 'number' && Number.isFinite(value.effort)));
  }
  return false;
}

function isClock(value: unknown): value is LiveClock {
  return isRecord(value) && hasOnlyKeys(value, ['runningSince', 'accumulatedMs'])
    && (value.runningSince === null || (typeof value.runningSince === 'number' && Number.isFinite(value.runningSince) && value.runningSince >= 0))
    && typeof value.accumulatedMs === 'number' && Number.isFinite(value.accumulatedMs) && value.accumulatedMs >= 0;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isStartRequest(value: unknown): value is LiveStartRequestEnvelope {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'idempotencyKey', 'draftFingerprint', 'sessionDate', 'name',
    'templateId', 'kind', 'liveStructure',
  ])) return false;
  if (normalizeUuid(value.idempotencyKey as string) === null
    || typeof value.draftFingerprint !== 'string' || !value.draftFingerprint.trim()
    || !isIsoDate(value.sessionDate)
    || typeof value.name !== 'string' || !value.name.trim()
    || (value.templateId !== null && normalizeUuid(value.templateId as string) === null)
    || (value.kind !== 'strength' && value.kind !== 'cardio')
    || !Array.isArray(value.liveStructure)) return false;
  const validStructure = value.liveStructure.every((item) => isRecord(item)
    && hasOnlyKeys(item, ['exerciseId', 'targetSets', 'targetReps', 'supersetGroup'])
    && typeof item.exerciseId === 'string' && item.exerciseId.trim().length > 0
    && typeof item.targetSets === 'number' && Number.isInteger(item.targetSets) && item.targetSets > 0
    && typeof item.targetReps === 'string' && item.targetReps.trim().length > 0
    && (item.supersetGroup === null || (typeof item.supersetGroup === 'number' && Number.isInteger(item.supersetGroup) && item.supersetGroup > 0)));
  return validStructure
    && (value.kind === 'strength' ? value.liveStructure.length > 0 : value.liveStructure.length === 0);
}

function parseState(value: unknown): WorkoutWorkspaceState | null {
  if (!isRecord(value) || value.version !== WORKOUT_DRAFT_VERSION
    || !hasOnlyKeys(value, ['version', 'stage', 'draft', 'sessionId', 'clock', 'finishingFrom', 'clientRequestId', 'startRequest'])
    || !WORKOUT_STAGES.includes(value.stage as WorkoutStage)
    || (value.draft !== null && !isDraft(value.draft))
    || (value.sessionId !== null && (typeof value.sessionId !== 'string' || value.sessionId !== value.sessionId.trim() || !value.sessionId))
    || (value.clock !== null && !isClock(value.clock))
    || (value.finishingFrom !== undefined && value.finishingFrom !== null && value.finishingFrom !== 'live' && value.finishingFrom !== 'paused')
    || (value.clientRequestId !== undefined && value.clientRequestId !== null && normalizeUuid(value.clientRequestId as string) === null)
    || (value.startRequest !== undefined && value.startRequest !== null && !isStartRequest(value.startRequest))) return null;
  const hasDraft = value.draft !== null;
  const hasSession = typeof value.sessionId === 'string' && value.sessionId.trim().length > 0;
  const hasClock = value.clock !== null;
  const clockIsRunning = hasClock && (value.clock as LiveClock).runningSince !== null;
  const finishingFrom = value.finishingFrom ?? null;
  const startRequest = (value.startRequest as LiveStartRequestEnvelope | null | undefined) ?? null;
  if (startRequest && value.clientRequestId !== startRequest.idempotencyKey) return null;
  const validStage = value.stage === 'home'
    ? !hasDraft && !hasSession && !hasClock && finishingFrom === null
    : value.stage === 'draft' || value.stage === 'review'
      ? hasDraft && !hasSession && !hasClock && finishingFrom === null
      : hasDraft && hasSession && hasClock
        && (value.stage === 'live' ? clockIsRunning && finishingFrom === null
          : value.stage === 'finishing' ? !clockIsRunning && (finishingFrom === 'live' || finishingFrom === 'paused')
            : !clockIsRunning && finishingFrom === null);
  if (!validStage) return null;
  return {
    stage: value.stage as WorkoutStage,
    draft: value.draft as WorkoutDraft | null,
    sessionId: value.sessionId as string | null,
    clock: value.clock as LiveClock | null,
    finishingFrom,
    clientRequestId: (value.clientRequestId as string | null | undefined) ?? null,
    startRequest,
  };
}

function persistDraft(draft: WorkoutDraft | null): WorkoutDraft | null {
  if (!draft) return null;
  if (draft.kind === 'strength') {
    return {
      version: WORKOUT_DRAFT_VERSION,
      name: draft.name,
      ...(draft.templateKey === undefined ? {} : { templateKey: draft.templateKey }),
      ...(draft.templateId === undefined ? {} : { templateId: draft.templateId }),
      updatedAt: draft.updatedAt,
      kind: 'strength',
      exercises: draft.exercises.map(({ exerciseId, exerciseName, muscleGroup, targetSets, targetReps, linkedBelow }) => ({
        exerciseId,
        ...(exerciseName === undefined ? {} : { exerciseName }),
        ...(muscleGroup === undefined ? {} : { muscleGroup }),
        targetSets,
        targetReps,
        ...(linkedBelow === undefined ? {} : { linkedBelow }),
      })),
    };
  }
  return {
    version: WORKOUT_DRAFT_VERSION,
    name: draft.name,
    ...(draft.templateKey === undefined ? {} : { templateKey: draft.templateKey }),
    ...(draft.templateId === undefined ? {} : { templateId: draft.templateId }),
    updatedAt: draft.updatedAt,
    kind: 'cardio',
    activity: draft.activity,
    durationMinutes: draft.durationMinutes,
    distanceKm: draft.distanceKm,
    effort: draft.effort,
  };
}

export function loadWorkspaceState(storage: WorkspaceStorage, userId: string): WorkoutWorkspaceState | null {
  const key = workspaceStorageKey(userId);
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const state = parseState(JSON.parse(raw));
    if (state) return state;
  } catch {
    // Corrupt storage is discarded below.
  }
  storage.removeItem(key);
  return null;
}

export function saveWorkspaceState(storage: WorkspaceStorage, userId: string, state: WorkoutWorkspaceState): void {
  const payload: PersistedWorkspaceState = {
    version: WORKOUT_DRAFT_VERSION,
    stage: state.stage,
    draft: persistDraft(state.draft),
    sessionId: state.sessionId,
    clock: state.clock && { runningSince: state.clock.runningSince, accumulatedMs: state.clock.accumulatedMs },
    finishingFrom: state.finishingFrom ?? null,
    clientRequestId: state.clientRequestId,
    startRequest: state.startRequest ?? null,
  };
  storage.setItem(workspaceStorageKey(userId), JSON.stringify(payload));
}

export function clearWorkspaceState(storage: WorkspaceStorage, userId: string): void {
  storage.removeItem(workspaceStorageKey(userId));
}
