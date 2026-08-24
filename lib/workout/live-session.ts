import {
  createWorkoutSession,
  deleteEmptyWorkoutSession,
  deleteWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  insertWorkoutSet,
  insertWorkoutSets,
  loadWorkoutSessionSets,
  loadPrMap,
  loadWorkoutSessionPainFlags,
  updateWorkoutSessionPainFlags,
  updateWorkoutSupersetGroups,
  deleteWorkoutSets,
  type CompletedSetInput,
  type PersistedWorkoutSet,
  type SupersetGroupUpdate,
} from '@/components/workout/workout-persistence';
import type { PainFlag } from '@/lib/types';
import type { DraftExercise, WorkoutDraft } from '@/lib/workout/workspace-state';

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
  userId: string;
  draft: WorkoutDraft;
  sets: CompletedSetInput[];
  durationMinutes?: number;
  painFlags?: PainFlag[];
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

export async function loadLivePainFlags(sessionId: string): Promise<PainFlag[]> {
  if (!sessionId.trim()) return [];
  try { return await loadWorkoutSessionPainFlags(sessionId); } catch { return []; }
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
  if (!input.sessionId.trim() || !input.name.trim() || !Number.isFinite(input.durationMinutes) || input.durationMinutes < 1) {
    return { ok: false };
  }
  let ok = false;
  try {
    ok = await finishWorkoutSession(input.sessionId, {
      name: input.name.trim(),
      duration_minutes: Math.max(1, Math.round(input.durationMinutes)),
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

function cardioNotes(draft: Extract<WorkoutDraft, { kind: 'cardio' }>): string {
  return [
    `Activity: ${draft.activity}`,
    ...(draft.distanceKm === null ? [] : [`Distance: ${draft.distanceKm} km`]),
    ...(draft.effort === null ? [] : [`Effort: ${draft.effort}/10`]),
  ].join(' · ');
}

export async function saveRetrospectiveWorkout(input: RetrospectiveWorkoutInput): Promise<{ ok: true; sessionId: string } | { ok: false }> {
  if (!input.userId.trim() || !input.draft.name.trim()) return { ok: false };
  if (input.draft.kind === 'strength' && input.sets.length === 0) return { ok: false };
  if (input.draft.kind === 'cardio' && input.draft.durationMinutes <= 0) return { ok: false };

  let sessionId: string | null = null;
  try {
    sessionId = await createWorkoutSession(input.userId, input.draft.name.trim(), input.draft.templateId ?? null);
    if (!sessionId) return { ok: false };

    const inserted = input.draft.kind === 'strength'
      ? await insertWorkoutSets(sessionId, input.sets)
      : true;
    const finished = inserted && await finishWorkoutSession(sessionId, {
      name: input.draft.name.trim(),
      duration_minutes: Math.max(1, Math.round(input.durationMinutes ?? (input.draft.kind === 'cardio' ? input.draft.durationMinutes : 1))),
      pain_flags: input.painFlags ?? [],
      template_id: input.draft.templateId ?? null,
      ...(input.draft.kind === 'cardio' ? { notes: cardioNotes(input.draft) } : {}),
    });

    if (finished) return { ok: true, sessionId };
  } catch {
    // The best-effort verified rollback below also covers thrown transports.
  }
  if (sessionId) {
    try { await deleteWorkoutSession(sessionId); } catch { /* recovery remains fail-closed */ }
  }
  return { ok: false };
}
