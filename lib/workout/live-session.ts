import {
  deleteEmptyWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  insertWorkoutSet,
  loadWorkoutSessionSets,
  loadPrMap,
  loadWorkoutSessionPainFlags,
  saveRetrospectiveWorkoutAtomic,
  startWorkoutSessionAtomic,
  updateWorkoutSessionPainFlags,
  updateLiveWorkoutStructureAtomic,
  updateWorkoutSupersetGroups,
  deleteWorkoutSets,
  type CompletedSetInput,
  type PersistedWorkoutSet,
  type SupersetGroupUpdate,
} from '@/components/workout/workout-persistence';
import type { PainFlag } from '@/lib/types';
import type { DraftExercise, WorkoutDraft } from '@/lib/workout/workspace-state';
import { supersetGroupFor } from '@/lib/workout/supersets';

export interface CompleteLiveSetInput {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  isPr?: boolean;
  supersetGroup?: number | null;
}

export interface FinishLiveSessionInput {
  sessionId: string;
  name: string;
  durationMinutes: number;
  painFlags: PainFlag[];
  templateId?: string | null;
  notes?: string | null;
}

export interface RetrospectiveWorkoutInput {
  idempotencyKey: string;
  draft: WorkoutDraft;
  sets: CompletedSetInput[];
  durationMinutes?: number;
  painFlags?: PainFlag[];
}

export interface StartLiveSessionInput {
  idempotencyKey: string;
  name: string;
  templateId?: string | null;
}

export interface LiveStructureExercise {
  exerciseId: string;
  supersetGroup: number | null;
}

function finiteOrNull(value: number | null | undefined): value is number | null | undefined {
  return value === null || value === undefined || Number.isFinite(value);
}

function validSet(input: CompleteLiveSetInput): boolean {
  return Boolean(input.sessionId.trim() && input.exerciseId.trim())
    && Number.isInteger(input.setNumber) && input.setNumber > 0
    && finiteOrNull(input.weightKg) && (input.weightKg === null || input.weightKg >= 0)
    && finiteOrNull(input.reps) && (input.reps === null || (Number.isInteger(input.reps) && input.reps > 0))
    && finiteOrNull(input.rpe) && (input.rpe === null || input.rpe === undefined || (input.rpe >= 1 && input.rpe <= 10));
}

export async function completeLiveSet(input: CompleteLiveSetInput): Promise<{ ok: true; setId: string } | { ok: false }> {
  if (!validSet(input)) return { ok: false };
  try {
    const setId = await insertWorkoutSet(input.sessionId, {
      exercise_id: input.exerciseId,
      set_number: input.setNumber,
      weight_kg: input.weightKg,
      reps: input.reps,
      rpe: input.rpe ?? null,
      is_warmup: input.isWarmup ?? false,
      is_pr: input.isPr ?? false,
      superset_group: input.supersetGroup ?? null,
    });
    return setId ? { ok: true, setId } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function uncompleteLiveSet(setId: string): Promise<boolean> {
  if (!setId.trim()) return false;
  try { return await deleteWorkoutSet(setId); } catch { return false; }
}

export async function loadLiveSessionSets(sessionId: string): Promise<PersistedWorkoutSet[]> {
  if (!sessionId.trim()) return [];
  try { return await loadWorkoutSessionSets(sessionId); } catch { return []; }
}

export async function loadLivePrMap(userId: string, exerciseIds: string[]): Promise<Record<string, number>> {
  if (!userId.trim()) return {};
  try { return await loadPrMap(userId, exerciseIds); } catch { return {}; }
}

export type LivePainFlagLoadResult = { ok: true; flags: PainFlag[] } | { ok: false };

export async function loadLivePainFlags(sessionId: string): Promise<LivePainFlagLoadResult> {
  if (!sessionId.trim()) return { ok: false };
  try { return await loadWorkoutSessionPainFlags(sessionId); } catch { return { ok: false }; }
}

export async function saveLivePainFlags(sessionId: string, flags: PainFlag[]): Promise<boolean> {
  if (!sessionId.trim()) return false;
  try { return await updateWorkoutSessionPainFlags(sessionId, flags); } catch { return false; }
}

export async function updateLiveSupersets(updates: SupersetGroupUpdate[]): Promise<boolean> {
  try { return await updateWorkoutSupersetGroups(updates); } catch { return false; }
}

export async function removeLiveExerciseSets(setIds: string[]): Promise<boolean> {
  try { return await deleteWorkoutSets(setIds); } catch { return false; }
}

export function recoverLiveSupersetLinks(
  exerciseIds: string[],
  sets: PersistedWorkoutSet[],
): string[] {
  const groupByExercise = new Map<string, number>();
  for (const set of sets) {
    if (typeof set.superset_group === 'number' && !groupByExercise.has(set.exercise_id)) {
      groupByExercise.set(set.exercise_id, set.superset_group);
    }
  }

  return exerciseIds.slice(0, -1).filter((exerciseId, index) => {
    const group = groupByExercise.get(exerciseId);
    return group !== undefined && groupByExercise.get(exerciseIds[index + 1]) === group;
  });
}

export function recoverLiveExtraRows(
  exercises: DraftExercise[],
  sets: PersistedWorkoutSet[],
): Array<{ exerciseId: string; setNumber: number }> {
  const targetByExercise = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise.targetSets]));
  const exerciseOrder = new Map(exercises.map((exercise, index) => [exercise.exerciseId, index]));
  const seen = new Set<string>();

  return sets.flatMap((set) => {
    const targetSets = targetByExercise.get(set.exercise_id);
    const key = `${set.exercise_id}:${set.set_number}`;
    if (targetSets === undefined || set.set_number <= targetSets || seen.has(key)) return [];
    seen.add(key);
    return [{ exerciseId: set.exercise_id, setNumber: set.set_number }];
  }).sort((left, right) => (
    (exerciseOrder.get(left.exerciseId) ?? Number.MAX_SAFE_INTEGER)
      - (exerciseOrder.get(right.exerciseId) ?? Number.MAX_SAFE_INTEGER)
      || left.setNumber - right.setNumber
  ));
}

export async function finishLiveSession(
  input: FinishLiveSessionInput,
  onVerified?: () => void,
): Promise<{ ok: boolean }> {
  if (!input.sessionId.trim() || !input.name.trim() || !Number.isFinite(input.durationMinutes) || input.durationMinutes < 0) {
    return { ok: false };
  }
  let ok = false;
  try {
    ok = await finishWorkoutSession(input.sessionId, {
      name: input.name.trim(),
      duration_minutes: Math.round(input.durationMinutes),
      pain_flags: input.painFlags,
      template_id: input.templateId ?? null,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    });
  } catch {
    return { ok: false };
  }
  if (!ok) return { ok: false };
  onVerified?.();
  return { ok: true };
}

export async function discardEmptyLiveSession(sessionId: string): Promise<boolean> {
  if (!sessionId.trim()) return false;
  try { return await deleteEmptyWorkoutSession(sessionId); } catch { return false; }
}

export async function startLiveSession(input: StartLiveSessionInput): Promise<{ ok: true; sessionId: string } | { ok: false }> {
  if (!input.idempotencyKey.trim() || !input.name.trim()) return { ok: false };
  try {
    const sessionId = await startWorkoutSessionAtomic({
      idempotencyKey: input.idempotencyKey,
      name: input.name.trim(),
      templateId: input.templateId ?? null,
    });
    return sessionId ? { ok: true, sessionId } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function validRetrospectiveSet(set: CompletedSetInput): boolean {
  return Boolean(set.exercise_id.trim())
    && Number.isInteger(set.set_number) && set.set_number > 0
    && (set.weight_kg === null || (Number.isFinite(set.weight_kg) && set.weight_kg >= 0))
    && set.reps !== null && Number.isInteger(set.reps) && set.reps > 0
    && (set.rpe === null || (Number.isFinite(set.rpe) && set.rpe >= 1 && set.rpe <= 10))
    && (set.superset_group === undefined || set.superset_group === null
      || (Number.isInteger(set.superset_group) && set.superset_group > 0));
}

export function validateRetrospectiveWorkoutInput(input: RetrospectiveWorkoutInput): boolean {
  const duration = input.durationMinutes ?? (input.draft.kind === 'cardio' ? input.draft.durationMinutes : Number.NaN);
  if (!input.idempotencyKey.trim() || !input.draft.name.trim() || !Number.isFinite(duration) || duration <= 0) return false;
  if (input.draft.kind === 'strength') {
    if (input.sets.length === 0 || !input.sets.every(validRetrospectiveSet)) return false;
    const setKeys = input.sets.map((set) => `${set.exercise_id}:${set.set_number}`);
    return new Set(setKeys).size === setKeys.length;
  }
  return input.sets.length === 0
    && (input.draft.distanceKm === null || (Number.isFinite(input.draft.distanceKm) && input.draft.distanceKm >= 0))
    && (input.draft.effort === null || (Number.isFinite(input.draft.effort) && input.draft.effort >= 1 && input.draft.effort <= 10));
}

export async function updateLiveStructure(
  sessionId: string,
  exercises: LiveStructureExercise[],
  removeExerciseId?: string | null,
): Promise<boolean> {
  if (!sessionId.trim() || exercises.some((exercise) => !exercise.exerciseId.trim()
    || (exercise.supersetGroup !== null && (!Number.isInteger(exercise.supersetGroup) || exercise.supersetGroup <= 0)))) return false;
  try {
    return await updateLiveWorkoutStructureAtomic(
      sessionId,
      exercises.map((exercise) => ({ exercise_id: exercise.exerciseId, superset_group: exercise.supersetGroup })),
      removeExerciseId ?? null,
    );
  } catch {
    return false;
  }
}

export function removeAndNormalizeLiveExercises(exercises: DraftExercise[], removeExerciseId: string): DraftExercise[] {
  const oldGroupById = new Map(exercises.map((exercise, index) => [
    exercise.exerciseId,
    supersetGroupFor(exercises, index),
  ]));
  const remaining = exercises.filter((exercise) => exercise.exerciseId !== removeExerciseId);
  return remaining.map((exercise, index) => {
    const next = remaining[index + 1];
    const group = oldGroupById.get(exercise.exerciseId) ?? null;
    const linkedBelow = Boolean(next && group !== null && oldGroupById.get(next.exerciseId) === group);
    return { ...exercise, linkedBelow };
  });
}

export async function saveRetrospectiveWorkout(input: RetrospectiveWorkoutInput): Promise<{ ok: true; sessionId: string } | { ok: false }> {
  if (!validateRetrospectiveWorkoutInput(input)) return { ok: false };

  try {
    const durationMinutes = Math.round(input.durationMinutes ?? (input.draft.kind === 'cardio' ? input.draft.durationMinutes : 0));
    const sessionId = await saveRetrospectiveWorkoutAtomic({
      idempotencyKey: input.idempotencyKey,
      kind: input.draft.kind,
      name: input.draft.name.trim(),
      templateId: input.draft.templateId ?? null,
      durationMinutes,
      painFlags: input.painFlags ?? [],
      activity: input.draft.kind === 'cardio' ? input.draft.activity : null,
      distanceKm: input.draft.kind === 'cardio' ? input.draft.distanceKm : null,
      effort: input.draft.kind === 'cardio' ? input.draft.effort : null,
      sets: input.draft.kind === 'strength' ? input.sets : [],
    });
    if (!sessionId) return { ok: false };
    return { ok: true, sessionId };
  } catch {
    return { ok: false };
  }
}
