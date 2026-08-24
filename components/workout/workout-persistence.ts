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
  const { data: sets, error } = await supabase
    .from('workout_sets')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1);
  if (error || !sets || sets.length > 0) return false;
  return deleteWorkoutSession(sessionId);
}

/** Reload immediately persisted live sets after a crash or refresh. */
export async function loadWorkoutSessionSets(sessionId: string): Promise<PersistedWorkoutSet[]> {
  if (!sessionId.trim()) return [];
  const { data, error } = await supabase
    .from('workout_sets')
    .select('id, session_id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, superset_group, notes, created_at')
    .eq('session_id', sessionId)
    .order('set_number');
  return error ? [] : (data as PersistedWorkoutSet[] | null) ?? [];
}

/** Recovery-safe pain flags are written to the session as soon as they change. */
export async function loadWorkoutSessionPainFlags(sessionId: string): Promise<PainFlag[]> {
  if (!sessionId.trim()) return [];
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('pain_flags')
    .eq('id', sessionId)
    .maybeSingle();
  return error ? [] : ((data?.pain_flags as PainFlag[] | null) ?? []);
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
