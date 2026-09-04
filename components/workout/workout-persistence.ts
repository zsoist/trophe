/**
 * Crash-safe workout persistence — shared by guided mode (GuidedSession.tsx)
 * and the freestyle logger (app/dashboard/workout/page.tsx).
 *
 * Contract:
 *   - Guided/freestyle callers may create lazily; the recoverable workspace
 *     creates exactly once on explicit live start and verifies empty discard.
 *   - Every completed set is INSERTed immediately, so a crash/refresh loses
 *     at most the set currently being typed.
 *   - Finish = one UPDATE with name/duration/pain_flags/template_id.
 */

import { supabase } from '@/lib/supabase';
import { localToday } from '@/lib/utils/dates';
import type { PainFlag } from '@/lib/types';

export interface CompletedSetInput {
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
  is_pr: boolean;
  /** Superset pairing (migration 0056) — same id within a session = same superset. */
  superset_group?: number | null;
}

export interface SupersetGroupUpdate {
  id: string;
  superset_group: number | null;
}

export interface PersistedWorkoutSet extends CompletedSetInput {
  id: string;
  session_id: string;
  notes: string | null;
  created_at?: string;
}

export interface AtomicSessionStartInput {
  idempotencyKey: string;
  draftFingerprint: string;
  sessionDate: string;
  name: string;
  templateId?: string | null;
  kind: 'strength' | 'cardio';
  liveStructure: LiveExerciseStructureInput[];
}

export interface AtomicRetrospectiveWorkoutInput {
  idempotencyKey: string;
  sessionDate?: string;
  kind: 'strength' | 'cardio';
  name: string;
  templateId?: string | null;
  durationMinutes: number;
  painFlags: PainFlag[];
  activity: string | null;
  distanceKm: number | null;
  effort: number | null;
  sets: CompletedSetInput[];
}

export interface LiveExerciseStructureInput {
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  superset_group: number | null;
}

export type LiveStructureMutationResult =
  | { ok: true; version: number; structure: LiveExerciseStructureInput[] }
  | { ok: false };

export type WorkoutSetLoadResult = { ok: true; sets: PersistedWorkoutSet[] } | { ok: false };
export type LiveStructureLoadResult =
  | { ok: true; terminal: false; version: number; structure: LiveExerciseStructureInput[] }
  /** The row is frozen history (migrations 0079-0081); no live write can ever succeed against it. */
  | { ok: true; terminal: true; completedAt: string | null; durationMinutes: number | null }
  /** `missing`: the owner cannot see such a row. `transport`: the answer is unknown and must be retried. */
  | { ok: false; reason: 'missing' | 'transport' }
  | { ok: false; reason: 'legacy'; legacy: true };

/** A server answer that can never change by retrying the same request. */
export interface PersistenceRejection { ok: false; kind: 'rejected'; code: string }
/** Network, timeout, or malformed replies: the request outcome is unknown. */
export interface PersistenceTransientFailure { ok: false; kind: 'transient' }
export type PersistenceFailure = PersistenceRejection | PersistenceTransientFailure;
export type SessionStartResult = { ok: true; sessionId: string } | PersistenceFailure;

/**
 * Postgres/PostgREST error codes that are definitive: data exceptions (22xxx),
 * integrity violations (23xxx), RLS/privilege denial (42501) and RAISE
 * EXCEPTION defaults (P0001). Everything else (connection, timeout,
 * serialization, PGRST transport, missing code) stays transient so the exact
 * idempotent envelope is retried.
 */
export function classifyPersistenceError(error: unknown): PersistenceFailure {
  if (!error || typeof error !== 'object') return { ok: false, kind: 'transient' };
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return { ok: false, kind: 'transient' };
  if (/^(22|23)\d{3}$/.test(code) || code === '42501' || code === 'P0001') return { ok: false, kind: 'rejected', code };
  return { ok: false, kind: 'transient' };
}

export interface AtomicLiveSetInput {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
  isPr: boolean;
  supersetGroup: number | null;
}

/** Idempotent live-session start. The RPC derives the owner from auth.uid(). */
export async function startWorkoutSessionAtomic(input: AtomicSessionStartInput): Promise<SessionStartResult> {
  const { data, error } = await supabase.rpc('start_workout_session', {
    p_idempotency_key: input.idempotencyKey,
    p_draft_fingerprint: input.draftFingerprint,
    p_session_date: input.sessionDate,
    p_name: input.name,
    p_template_id: input.templateId ?? null,
    p_kind: input.kind,
    p_live_structure: input.liveStructure,
  });
  if (error) return classifyPersistenceError(error);
  return typeof data === 'string' && data.trim() ? { ok: true, sessionId: data } : { ok: false, kind: 'transient' };
}

/** One transactional create + set insert + finish boundary for completed history. */
export async function saveRetrospectiveWorkoutAtomic(input: AtomicRetrospectiveWorkoutInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_retrospective_workout', {
    p_idempotency_key: input.idempotencyKey,
    p_session_date: input.sessionDate ?? localToday(),
    p_kind: input.kind,
    p_name: input.name,
    p_template_id: input.templateId ?? null,
    p_duration_minutes: input.durationMinutes,
    p_pain_flags: input.painFlags,
    p_activity: input.activity,
    p_distance_km: input.distanceKm,
    p_effort: input.effort,
    p_sets: input.sets.map((set) => ({ ...set, superset_group: set.superset_group ?? null })),
  });
  return error || typeof data !== 'string' || !data.trim() ? null : data;
}

/** Atomically deletes removed rows and applies normalized superset groups. */
export async function updateLiveWorkoutStructureAtomic(
  sessionId: string,
  expectedVersion: number,
  exercises: LiveExerciseStructureInput[],
  removeExerciseId?: string | null,
): Promise<LiveStructureMutationResult> {
  const { data, error } = await supabase.rpc('update_live_workout_structure', {
    p_session_id: sessionId,
    p_expected_version: expectedVersion,
    p_exercises: exercises,
    p_remove_exercise_id: removeExerciseId ?? null,
  });
  if (error || !data || typeof data !== 'object') return { ok: false };
  const result = data as { version?: unknown; structure?: unknown };
  if (!Number.isInteger(result.version) || !Array.isArray(result.structure)) return { ok: false };
  return { ok: true, version: result.version as number, structure: result.structure as LiveExerciseStructureInput[] };
}

export async function saveLiveWorkoutSetAtomic(input: AtomicLiveSetInput): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_live_workout_set', {
    p_session_id: input.sessionId,
    p_exercise_id: input.exerciseId,
    p_set_number: input.setNumber,
    p_weight_kg: input.weightKg,
    p_reps: input.reps,
    p_rpe: input.rpe,
    p_is_warmup: input.isWarmup,
    p_is_pr: input.isPr,
    p_superset_group: input.supersetGroup,
  });
  return error || typeof data !== 'string' || !data.trim() ? null : data;
}

export async function appendWorkoutSessionPainFlag(
  sessionId: string,
  mutationId: string,
  flag: PainFlag,
): Promise<PainFlagLoadResult> {
  const { data, error } = await supabase.rpc('append_live_pain_flag', {
    p_session_id: sessionId,
    p_mutation_id: mutationId,
    p_flag: flag,
  });
  return error || !Array.isArray(data) ? { ok: false } : { ok: true, flags: data as PainFlag[] };
}

export async function finishLiveWorkoutSessionAtomic(
  sessionId: string,
  input: {
    name: string;
    durationMinutes: number;
    templateId?: string | null;
    cardio?: { activity: string; distanceKm: number | null; effort: number | null } | null;
  },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_live_workout_session', {
    p_session_id: sessionId,
    p_name: input.name,
    p_duration_minutes: input.durationMinutes,
    p_template_id: input.templateId ?? null,
    p_cardio_activity: input.cardio?.activity ?? null,
    p_cardio_distance_km: input.cardio?.distanceKm ?? null,
    p_cardio_effort: input.cardio?.effort ?? null,
  });
  return !error && data === true;
}

/** Delete a live set only while its owner session is still active. */
export async function deleteLiveWorkoutSetAtomic(sessionId: string, setId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_live_workout_set', {
    p_session_id: sessionId,
    p_set_id: setId,
  });
  return !error && data === true;
}

export async function updateWorkoutSupersetGroups(
  updates: SupersetGroupUpdate[],
): Promise<boolean> {
  if (updates.length === 0) return true;

  const idsByGroup = new Map<number | null, string[]>();
  for (const update of updates) {
    const ids = idsByGroup.get(update.superset_group) ?? [];
    ids.push(update.id);
    idsByGroup.set(update.superset_group, ids);
  }

  const results = await Promise.all(
    Array.from(idsByGroup, async ([supersetGroup, ids]) => {
      const { data, error } = await supabase
        .from('workout_sets')
        .update({ superset_group: supersetGroup })
        .in('id', ids)
        .select('id');
      return !error && data?.length === ids.length;
    }),
  );
  return results.every(Boolean);
}

export interface GhostSet {
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface GhostHistoryRow {
  exercise_id: string;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  set_number: number;
  session_id: string;
  workout_sessions: {
    session_date: string;
    created_at: string;
  };
}

export function buildLastSetsMap(rows: GhostHistoryRow[]): Record<string, GhostSet[]> {
  const map: Record<string, GhostSet[]> = {};
  for (const exId of new Set(rows.map((row) => row.exercise_id))) {
    const exerciseRows = rows.filter((row) => row.exercise_id === exId);
    const latest = exerciseRows.reduce((best, row) => {
      const bestSession = best.workout_sessions;
      const rowSession = row.workout_sessions;
      if (rowSession.session_date !== bestSession.session_date) {
        return rowSession.session_date > bestSession.session_date ? row : best;
      }
      return rowSession.created_at > bestSession.created_at ? row : best;
    });

    map[exId] = exerciseRows
      .filter((row) => row.session_id === latest.session_id)
      .sort((a, b) => a.set_number - b.set_number)
      .map((row) => ({
        weight_kg: row.weight_kg,
        reps: row.reps,
        rpe: row.rpe,
      }));
  }
  return map;
}

/** Create one session row at the owning flow's explicit persistence boundary. */
export async function createWorkoutSession(
  userId: string,
  name: string,
  templateId?: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: userId,
      session_date: localToday(),
      name,
      pain_flags: [],
      ...(templateId ? { template_id: templateId } : {}),
    })
    .select('id')
    .maybeSingle();
  if (error || !data) {
    console.error('createWorkoutSession error:', error);
    return null;
  }
  return data.id as string;
}

/** Insert one completed set immediately. Returns the row id (for undo). */
export async function insertWorkoutSet(
  sessionId: string,
  set: CompletedSetInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('workout_sets')
    .insert({ session_id: sessionId, notes: null, ...set })
    .select('id')
    .maybeSingle();
  if (error || !data) {
    console.error('insertWorkoutSet error:', error);
    return null;
  }
  return data.id as string;
}

/** Bulk insert (freestyle finish: rows filled but never check-completed). */
export async function insertWorkoutSets(
  sessionId: string,
  sets: CompletedSetInput[],
): Promise<boolean> {
  if (sets.length === 0) return true;
  const { data, error } = await supabase
    .from('workout_sets')
    .insert(sets.map((s) => ({ session_id: sessionId, notes: null, ...s })))
    .select('id');
  return !error && data?.length === sets.length;
}

/** Un-complete a set — remove the persisted row. */
export async function deleteWorkoutSet(setId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('workout_sets')
    .delete()
    .eq('id', setId)
    .select('id');
  return !error && data?.length === 1;
}

/** Delete a group of persisted sets and confirm every requested row changed. */
export async function deleteWorkoutSets(setIds: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(setIds)];
  if (uniqueIds.length === 0) return true;
  const { data, error } = await supabase
    .from('workout_sets')
    .delete()
    .in('id', uniqueIds)
    .select('id');
  return !error && data?.length === uniqueIds.length;
}

/** Delete an empty/aborted session and verify that exactly one owned row changed. */
export async function deleteWorkoutSession(sessionId: string): Promise<boolean> {
  if (!sessionId.trim()) return false;
  const { data, error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('id', sessionId)
    .select('id');
  return !error && data?.length === 1;
}

/** Discard only after the database confirms the owned session has no sets. */
export async function deleteEmptyWorkoutSession(sessionId: string): Promise<boolean> {
  if (!sessionId.trim()) return false;
  const { data, error } = await supabase.rpc('discard_empty_workout_session', { p_session_id: sessionId });
  return !error && data === true;
}

/** Reload immediately persisted live sets after a crash or refresh. */
export async function loadWorkoutSessionSets(sessionId: string): Promise<WorkoutSetLoadResult> {
  if (!sessionId.trim()) return { ok: false };
  const { data, error } = await supabase
    .from('workout_sets')
    .select('id, session_id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, superset_group, notes, created_at')
    .eq('session_id', sessionId)
    .order('set_number');
  return error ? { ok: false } : { ok: true, sets: (data as PersistedWorkoutSet[] | null) ?? [] };
}

export async function loadWorkoutSessionStructure(sessionId: string): Promise<LiveStructureLoadResult> {
  // An empty id is a caller bug, not server evidence; fail closed without clearing anything.
  if (!sessionId.trim()) return { ok: false, reason: 'transport' };
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('live_structure, live_structure_version, duration_minutes, completed_at, client_request')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) return { ok: false, reason: 'transport' };
  if (!data) return { ok: false, reason: 'missing' };
  // Terminal authority (0079): completed_at is database-owned, and any
  // duration also stamps it. Either marker means the row is frozen history.
  if (data.completed_at !== null || data.duration_minutes !== null) {
    return {
      ok: true,
      terminal: true,
      completedAt: typeof data.completed_at === 'string' ? data.completed_at : null,
      durationMinutes: typeof data.duration_minutes === 'number' ? data.duration_minutes : null,
    };
  }
  if (data.live_structure === null) {
    const request = data.client_request;
    const isLegacyActiveLive = request !== null
      && typeof request === 'object'
      && !Array.isArray(request)
      && (request as { mode?: unknown }).mode === 'live';
    return isLegacyActiveLive ? { ok: false, reason: 'legacy', legacy: true } : { ok: false, reason: 'transport' };
  }
  if (!Array.isArray(data.live_structure) || !Number.isInteger(data.live_structure_version)) {
    // A malformed active row is not something the client can resolve; fail closed and allow retry.
    return { ok: false, reason: 'transport' };
  }
  return {
    ok: true,
    terminal: false,
    structure: data.live_structure as LiveExerciseStructureInput[],
    version: data.live_structure_version as number,
  };
}

/** One-time, owner-scoped upgrade of an active pre-0076 live session. */
export async function resumeLegacyLiveWorkoutStructureAtomic(
  sessionId: string,
  kind: 'strength' | 'cardio',
  exercises: LiveExerciseStructureInput[],
): Promise<LiveStructureMutationResult> {
  const { data, error } = await supabase.rpc('resume_legacy_live_workout_session', {
    p_session_id: sessionId,
    p_kind: kind,
    p_live_structure: exercises,
  });
  if (error || !data || typeof data !== 'object') return { ok: false };
  const result = data as { version?: unknown; structure?: unknown };
  if (!Number.isInteger(result.version) || !Array.isArray(result.structure)) return { ok: false };
  return {
    ok: true,
    version: result.version as number,
    structure: result.structure as LiveExerciseStructureInput[],
  };
}

/** Recovery-safe pain flags are written to the session as soon as they change. */
export type PainFlagLoadResult = { ok: true; flags: PainFlag[] } | { ok: false };

export async function loadWorkoutSessionPainFlags(sessionId: string): Promise<PainFlagLoadResult> {
  if (!sessionId.trim()) return { ok: false };
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('pain_flags')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !data) return { ok: false };
  return { ok: true, flags: (data.pain_flags as PainFlag[] | null) ?? [] };
}

export async function updateWorkoutSessionPainFlags(sessionId: string, painFlags: PainFlag[]): Promise<boolean> {
  if (!sessionId.trim()) return false;
  const { data, error } = await supabase
    .from('workout_sessions')
    .update({ pain_flags: painFlags })
    .eq('id', sessionId)
    .select('id');
  return !error && data?.length === 1;
}

/** Final session UPDATE (name = template/session name, duration, flags, FK). */
export async function finishWorkoutSession(
  sessionId: string,
  patch: {
    name: string;
    duration_minutes: number;
    pain_flags: PainFlag[];
    template_id?: string | null;
    notes?: string | null;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('id');
  return !error && data?.length === 1;
}

/**
 * Ghost values — the user's LAST logged session per exercise, batched.
 * Same shape as the original single-exercise query on the workout page.
 */
export async function loadLastSetsMap(
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, GhostSet[]>> {
  if (exerciseIds.length === 0) return {};
  const { data } = await supabase
    .from('workout_sets')
    .select('exercise_id, weight_kg, reps, rpe, set_number, session_id, workout_sessions!inner(user_id, session_date, created_at)')
    .in('exercise_id', exerciseIds)
    .eq('workout_sessions.user_id', userId)
    .eq('is_warmup', false)
    .order('session_date', { ascending: false, referencedTable: 'workout_sessions' })
    .order('created_at', { ascending: false, referencedTable: 'workout_sessions' })
    .limit(600);
  if (!data || data.length === 0) return {};

  return buildLastSetsMap(data as unknown as GhostHistoryRow[]);
}

/** Max non-warmup weight per exercise — the PR baseline (client-side detection). */
export async function loadPrMap(
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const { data } = await supabase
    .from('workout_sets')
    .select('exercise_id, weight_kg, session_id, workout_sessions!inner(user_id)')
    .in('exercise_id', exerciseIds)
    .eq('workout_sessions.user_id', userId)
    .eq('is_warmup', false)
    .not('weight_kg', 'is', null);
  if (!data) return {};

  const maxWeights: Record<string, number> = {};
  (data as unknown as Array<{ exercise_id: string; weight_kg: number | null }>).forEach((s) => {
    if (s.weight_kg !== null) {
      maxWeights[s.exercise_id] = Math.max(maxWeights[s.exercise_id] || 0, s.weight_kg);
    }
  });
  return maxWeights;
}
