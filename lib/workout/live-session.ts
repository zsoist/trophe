import {
  deleteEmptyWorkoutSession,
  deleteLiveWorkoutSetAtomic,
  appendWorkoutSessionPainFlag,
  finishLiveWorkoutSessionAtomic,
  loadWorkoutSessionSets,
  loadWorkoutSessionStructure,
  resumeLegacyLiveWorkoutStructureAtomic,
  loadPrMap,
  loadWorkoutSessionPainFlags,
  saveRetrospectiveWorkoutAtomic,
  saveLiveWorkoutSetAtomic,
  startWorkoutSessionAtomic,
  updateLiveWorkoutStructureAtomic,
  updateWorkoutSupersetGroups,
  deleteWorkoutSets,
  type CompletedSetInput,
  type PersistedWorkoutSet,
  type LiveStructureLoadResult as PersistedLiveStructureLoadResult,
  type LiveStructureMutationResult,
  type PersistenceFailure,
  type SupersetGroupUpdate,
} from '@/components/workout/workout-persistence';
import type { PainFlag } from '@/lib/types';
import { retrospectivePayloadFingerprint, type DraftExercise, type RetrospectiveSaveRequestEnvelope, type WorkoutDraft } from '@/lib/workout/workspace-state';
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
  cardio?: { activity: string; distanceKm: number | null; effort: number | null };
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
  draftFingerprint: string;
  sessionDate: string;
  name: string;
  templateId?: string | null;
  kind: 'strength' | 'cardio';
  liveStructure: LiveStructureExercise[];
}

export interface LiveStructureExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  supersetGroup: number | null;
}

function finiteOrNull(value: number | null | undefined): value is number | null | undefined {
  return value === null || value === undefined || Number.isFinite(value);
}

function validSet(input: CompleteLiveSetInput): boolean {
  return Boolean(input.sessionId.trim() && input.exerciseId.trim())
    && Number.isInteger(input.setNumber) && input.setNumber > 0
    && finiteOrNull(input.weightKg) && (input.weightKg === null || input.weightKg >= 0)
    && typeof input.reps === 'number' && Number.isInteger(input.reps) && input.reps > 0
    && finiteOrNull(input.rpe) && (input.rpe === null || input.rpe === undefined || (input.rpe >= 1 && input.rpe <= 10))
    && (input.isWarmup === undefined || typeof input.isWarmup === 'boolean')
    && (input.isPr === undefined || typeof input.isPr === 'boolean')
    && (input.supersetGroup === undefined || input.supersetGroup === null
      || (Number.isInteger(input.supersetGroup) && input.supersetGroup > 0));
}

export async function completeLiveSet(input: CompleteLiveSetInput): Promise<{ ok: true; setId: string } | { ok: false }> {
  if (!validSet(input)) return { ok: false };
  try {
    const setId = await saveLiveWorkoutSetAtomic({
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      weightKg: input.weightKg,
      reps: input.reps as number,
      rpe: input.rpe ?? null,
      isWarmup: input.isWarmup ?? false,
      isPr: input.isPr ?? false,
      supersetGroup: input.supersetGroup ?? null,
    });
    return setId ? { ok: true, setId } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function uncompleteLiveSet(sessionId: string, setId: string): Promise<boolean> {
  if (!sessionId.trim() || !setId.trim()) return false;
  try { return await deleteLiveWorkoutSetAtomic(sessionId, setId); } catch { return false; }
}

const pendingSetStorageVersion = 1;

function pendingSetStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function pendingSetStorageKey(sessionId: string): string {
  return `trophe:live-workout:${sessionId}:pending-sets:v${pendingSetStorageVersion}`;
}

function pendingSetLogicalKey(input: CompleteLiveSetInput): string {
  return `${input.exerciseId}:${input.setNumber}`;
}

export function loadPendingLiveSets(sessionId: string, storage?: Storage): CompleteLiveSetInput[] {
  if (!sessionId.trim()) return [];
  const target = pendingSetStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(pendingSetStorageKey(sessionId));
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((candidate): candidate is CompleteLiveSetInput => {
      if (!candidate || typeof candidate !== 'object') return false;
      const input = candidate as CompleteLiveSetInput;
      return input.sessionId === sessionId && validSet(input);
    });
  } catch {
    return [];
  }
}

export function persistPendingLiveSet(input: CompleteLiveSetInput, storage?: Storage): boolean {
  if (!validSet(input)) return false;
  const target = pendingSetStorage(storage);
  if (!target) return false;
  try {
    const existing = loadPendingLiveSets(input.sessionId, target);
    const key = pendingSetLogicalKey(input);
    const next = [...existing.filter((entry) => pendingSetLogicalKey(entry) !== key), input];
    target.setItem(pendingSetStorageKey(input.sessionId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Drop every queued set for a session the server will never accept writes for again. */
export function clearPendingLiveSets(sessionId: string, storage?: Storage): boolean {
  if (!sessionId.trim()) return false;
  const target = pendingSetStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(pendingSetStorageKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

export function removePendingLiveSet(input: CompleteLiveSetInput, storage?: Storage): boolean {
  const target = pendingSetStorage(storage);
  if (!target) return false;
  try {
    const key = pendingSetLogicalKey(input);
    const next = loadPendingLiveSets(input.sessionId, target)
      .filter((entry) => pendingSetLogicalKey(entry) !== key);
    if (next.length === 0) target.removeItem(pendingSetStorageKey(input.sessionId));
    else target.setItem(pendingSetStorageKey(input.sessionId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export async function replayPendingLiveSets(
  sessionId: string,
  persist: (input: CompleteLiveSetInput) => Promise<{ ok: true; setId: string } | { ok: false }> = completeLiveSet,
  storage?: Storage,
): Promise<{
  saved: Array<{ input: CompleteLiveSetInput; setId: string }>;
  failed: CompleteLiveSetInput[];
}> {
  const pending = loadPendingLiveSets(sessionId, storage);
  const saved: Array<{ input: CompleteLiveSetInput; setId: string }> = [];
  const failed: CompleteLiveSetInput[] = [];
  for (const input of pending) {
    let result: { ok: true; setId: string } | { ok: false } = { ok: false };
    try { result = await persist(input); } catch { /* retain the exact envelope */ }
    if (result.ok) {
      saved.push({ input, setId: result.setId });
      removePendingLiveSet(input, storage);
    } else {
      failed.push(input);
    }
  }
  return { saved, failed };
}

export type LiveSetLoadResult = { ok: true; sets: PersistedWorkoutSet[] } | { ok: false };

export async function loadLiveSessionSets(sessionId: string): Promise<LiveSetLoadResult> {
  if (!sessionId.trim()) return { ok: false };
  try { return await loadWorkoutSessionSets(sessionId); } catch { return { ok: false }; }
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

export async function appendLivePainFlag(
  sessionId: string,
  mutationId: string,
  flag: PainFlag,
): Promise<LivePainFlagLoadResult> {
  if (!sessionId.trim() || !mutationId.trim()) return { ok: false };
  try { return await appendWorkoutSessionPainFlag(sessionId, mutationId, flag); } catch { return { ok: false }; }
}

export type LiveStructureLoadResult = PersistedLiveStructureLoadResult;

export async function loadLiveStructure(
  sessionId: string,
  kind?: 'strength' | 'cardio',
  exercises: LiveStructureExercise[] = [],
): Promise<LiveStructureLoadResult> {
  if (!sessionId.trim()) return { ok: false, reason: 'transport' };
  try {
    const loaded = await loadWorkoutSessionStructure(sessionId);
    if (loaded.ok || loaded.reason !== 'legacy' || !kind) return loaded;
    const resumed = await resumeLegacyLiveWorkoutStructureAtomic(
      sessionId,
      kind,
      exercises.map((exercise) => ({
        exercise_id: exercise.exerciseId,
        target_sets: exercise.targetSets,
        target_reps: exercise.targetReps,
        superset_group: exercise.supersetGroup,
      })),
    );
    return resumed.ok
      ? { ok: true, terminal: false, version: resumed.version, structure: resumed.structure }
      : { ok: false, reason: 'transport' };
  } catch {
    return { ok: false, reason: 'transport' };
  }
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
  const warmupCountByExercise = new Map<string, number>();
  for (const set of sets) {
    if (set.is_warmup && targetByExercise.has(set.exercise_id)) {
      warmupCountByExercise.set(set.exercise_id, (warmupCountByExercise.get(set.exercise_id) ?? 0) + 1);
    }
  }
  const seen = new Set<string>();

  return sets.flatMap((set) => {
    const targetSets = targetByExercise.get(set.exercise_id);
    const key = `${set.exercise_id}:${set.set_number}`;
    const firstExtraSetNumber = (warmupCountByExercise.get(set.exercise_id) ?? 0) + (targetSets ?? 0) + 1;
    if (targetSets === undefined || set.is_warmup || set.set_number < firstExtraSetNumber || seen.has(key)) return [];
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
  if (!input.sessionId.trim() || !input.name.trim() || !Number.isFinite(input.durationMinutes) || input.durationMinutes < 0
    || (input.cardio !== undefined && (!input.cardio.activity.trim() || !validateLiveCardioMetrics(input.cardio)))) {
    return { ok: false };
  }
  let ok = false;
  try {
    ok = await finishLiveWorkoutSessionAtomic(input.sessionId, {
      name: input.name.trim(),
      durationMinutes: Math.round(input.durationMinutes),
      templateId: input.templateId ?? null,
      cardio: input.cardio ?? null,
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

export type StartLiveSessionResult = { ok: true; sessionId: string } | PersistenceFailure;

export async function startLiveSession(input: StartLiveSessionInput): Promise<StartLiveSessionResult> {
  // The RPC rejects these shapes unconditionally, so the answer is already definitive.
  if (!input.idempotencyKey.trim() || !input.draftFingerprint.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)
    || !input.name.trim() || (input.kind === 'strength' ? input.liveStructure.length === 0 : input.liveStructure.length !== 0)) {
    return { ok: false, kind: 'rejected', code: 'invalid_request' };
  }
  try {
    const result = await startWorkoutSessionAtomic({
      idempotencyKey: input.idempotencyKey,
      draftFingerprint: input.draftFingerprint,
      sessionDate: input.sessionDate,
      name: input.name.trim(),
      templateId: input.templateId ?? null,
      kind: input.kind,
      liveStructure: input.liveStructure.map((exercise) => ({
        exercise_id: exercise.exerciseId,
        target_sets: exercise.targetSets,
        target_reps: exercise.targetReps,
        superset_group: exercise.supersetGroup,
      })),
    });
    if (!result.ok) return result;
    return result.sessionId.trim() ? { ok: true, sessionId: result.sessionId } : { ok: false, kind: 'transient' };
  } catch {
    return { ok: false, kind: 'transient' };
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
  expectedVersion: number,
  removeExerciseId?: string | null,
): Promise<LiveStructureMutationResult> {
  if (!sessionId.trim() || exercises.some((exercise) => !exercise.exerciseId.trim()
    || !Number.isInteger(exercise.targetSets) || exercise.targetSets <= 0 || !exercise.targetReps.trim()
    || (exercise.supersetGroup !== null && (!Number.isInteger(exercise.supersetGroup) || exercise.supersetGroup <= 0)))
    || !Number.isInteger(expectedVersion) || expectedVersion < 0) return { ok: false };
  try {
    return await updateLiveWorkoutStructureAtomic(
      sessionId,
      expectedVersion,
      exercises.map((exercise) => ({
        exercise_id: exercise.exerciseId,
        target_sets: exercise.targetSets,
        target_reps: exercise.targetReps,
        superset_group: exercise.supersetGroup,
      })),
      removeExerciseId ?? null,
    );
  } catch {
    return { ok: false };
  }
}

export function validateLiveCardioMetrics(input: { distanceKm: number | null; effort: number | null }): boolean {
  return (input.distanceKm === null || (Number.isFinite(input.distanceKm) && input.distanceKm >= 0))
    && (input.effort === null || (Number.isFinite(input.effort) && input.effort >= 1 && input.effort <= 10));
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

/** Replays an already-prepared retrospective request without re-deriving data. */
export async function savePreparedRetrospectiveWorkout(input: RetrospectiveSaveRequestEnvelope): Promise<{ ok: true; sessionId: string } | { ok: false }> {
  const { idempotencyKey, payloadFingerprint, ...payload } = input;
  if (retrospectivePayloadFingerprint(payload) !== payloadFingerprint) return { ok: false };
  try {
    const sessionId = await saveRetrospectiveWorkoutAtomic({
      idempotencyKey,
      sessionDate: input.sessionDate,
      kind: input.kind,
      name: input.name,
      templateId: input.templateId,
      durationMinutes: input.durationMinutes,
      painFlags: input.painFlags,
      activity: input.activity,
      distanceKm: input.distanceKm,
      effort: input.effort,
      sets: input.sets,
    });
    return sessionId ? { ok: true, sessionId } : { ok: false };
  } catch {
    return { ok: false };
  }
}
