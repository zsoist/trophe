/**
 * Crash-safe workout persistence — shared by guided mode (GuidedSession.tsx)
 * and the freestyle logger (app/dashboard/workout/page.tsx).
 *
 * Contract:
 *   - The workout_sessions row is created LAZILY at the first completed set,
 *     never on "Start" (the old flow leaked empty sessions on abandon).
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
}

export interface GhostSet {
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

/** Create the session row. Call lazily at the FIRST completed set. */
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
): Promise<void> {
  if (sets.length === 0) return;
  const { error } = await supabase
    .from('workout_sets')
    .insert(sets.map((s) => ({ session_id: sessionId, notes: null, ...s })));
  if (error) console.error('insertWorkoutSets error:', error);
}

/** Un-complete a set — remove the persisted row. */
export async function deleteWorkoutSet(setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId);
  if (error) console.error('deleteWorkoutSet error:', error);
}

/** Final session UPDATE (name = template/session name, duration, flags, FK). */
export async function finishWorkoutSession(
  sessionId: string,
  patch: {
    name: string;
    duration_minutes: number;
    pain_flags: PainFlag[];
    template_id?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('workout_sessions')
    .update(patch)
    .eq('id', sessionId);
  if (error) console.error('finishWorkoutSession error:', error);
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
    .select('exercise_id, weight_kg, reps, rpe, set_number, session_id, workout_sessions!inner(user_id, session_date)')
    .in('exercise_id', exerciseIds)
    .eq('workout_sessions.user_id', userId)
    .eq('is_warmup', false)
    .limit(600);
  if (!data || data.length === 0) return {};

  type Row = {
    exercise_id: string;
    weight_kg: number | null;
    reps: number | null;
    rpe: number | null;
    set_number: number;
    session_id: string;
    workout_sessions: { session_date: string };
  };
  const rows = data as unknown as Row[];
  const map: Record<string, GhostSet[]> = {};
  for (const exId of new Set(rows.map((r) => r.exercise_id))) {
    const exRows = rows.filter((r) => r.exercise_id === exId);
    const latestDate = exRows.reduce(
      (max, r) => (r.workout_sessions.session_date > max ? r.workout_sessions.session_date : max),
      '',
    );
    map[exId] = exRows
      .filter((r) => r.workout_sessions.session_date === latestDate)
      .sort((a, b) => a.set_number - b.set_number)
      .map((r) => ({ weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe }));
  }
  return map;
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
