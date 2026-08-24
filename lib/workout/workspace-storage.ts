import type {
  CardioDraft,
  DraftExercise,
  LiveClock,
  WorkoutDraft,
  WorkoutStage,
  WorkoutWorkspaceState,
} from '@/lib/workout/workspace-state';
import { WORKOUT_DRAFT_VERSION } from '@/lib/workout/workspace-state';

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
  if (!isRecord(value) || !hasOnlyKeys(value, ['exerciseId', 'targetSets', 'targetReps'])) return false;
  return typeof value.exerciseId === 'string'
    && typeof value.targetSets === 'number' && Number.isFinite(value.targetSets)
    && typeof value.targetReps === 'string';
}

function isDraft(value: unknown): value is WorkoutDraft {
  if (!isRecord(value) || value.version !== WORKOUT_DRAFT_VERSION
    || typeof value.name !== 'string' || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
    || !hasOnlyKeys(value, value.kind === 'strength'
      ? ['version', 'name', 'templateKey', 'updatedAt', 'kind', 'exercises']
      : ['version', 'name', 'templateKey', 'updatedAt', 'kind', 'activity', 'durationMinutes', 'distanceKm', 'effort'])) return false;
  if (value.templateKey !== undefined && typeof value.templateKey !== 'string') return false;
  if (value.kind === 'strength') {
    return Array.isArray(value.exercises) && value.exercises.every(isDraftExercise);
  }
  if (value.kind === 'cardio') {
    return CARDIO_ACTIVITIES.includes(value.activity as CardioDraft['activity'])
      && typeof value.durationMinutes === 'number' && Number.isFinite(value.durationMinutes)
      && (value.distanceKm === null || (typeof value.distanceKm === 'number' && Number.isFinite(value.distanceKm)))
      && (value.effort === null || (typeof value.effort === 'number' && Number.isFinite(value.effort)));
  }
  return false;
}

function isClock(value: unknown): value is LiveClock {
  return isRecord(value) && hasOnlyKeys(value, ['runningSince', 'accumulatedMs'])
    && (value.runningSince === null || (typeof value.runningSince === 'number' && Number.isFinite(value.runningSince)))
    && typeof value.accumulatedMs === 'number' && Number.isFinite(value.accumulatedMs);
}

function parseState(value: unknown): WorkoutWorkspaceState | null {
  if (!isRecord(value) || value.version !== WORKOUT_DRAFT_VERSION
    || !hasOnlyKeys(value, ['version', 'stage', 'draft', 'sessionId', 'clock'])
    || !WORKOUT_STAGES.includes(value.stage as WorkoutStage)
    || (value.draft !== null && !isDraft(value.draft))
    || (value.sessionId !== null && typeof value.sessionId !== 'string')
    || (value.clock !== null && !isClock(value.clock))) return null;
  return {
    stage: value.stage as WorkoutStage,
    draft: value.draft as WorkoutDraft | null,
    sessionId: value.sessionId as string | null,
    clock: value.clock as LiveClock | null,
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
  const payload: PersistedWorkspaceState = { version: WORKOUT_DRAFT_VERSION, ...state };
  storage.setItem(workspaceStorageKey(userId), JSON.stringify(payload));
}

export function clearWorkspaceState(storage: WorkspaceStorage, userId: string): void {
  storage.removeItem(workspaceStorageKey(userId));
}
