import type { SupabaseClient } from '@supabase/supabase-js';
import type { Exercise, WorkoutSession, WorkoutSet } from '@/lib/types';

export interface TerminalSession {
  id: string;
  session_date: string;
  completed_at: string | null;
}

export interface AnalyticsProgram {
  starts_on?: string | null;
  workout_program_days?: Array<{ weekday: number }> | null;
}

export interface AnalyticsMeasurement {
  measured_date: string;
  weight_kg: number | null;
}

export type AnalyticsLoggedSet = WorkoutSet & {
  exercise: Exercise;
  session: WorkoutSession;
};

export interface WorkoutAnalyticsData {
  sessions: WorkoutSession[];
  sets: AnalyticsLoggedSet[];
  measurements: AnalyticsMeasurement[];
  programs: AnalyticsProgram[];
  issues: {
    schedule: boolean;
    measurements: boolean;
    historyTruncated: boolean;
    measurementsTruncated: boolean;
  };
}

export class WorkoutAnalyticsDataError extends Error {
  constructor(readonly source: 'sessions' | 'sets', cause: unknown) {
    super(`Workout analytics ${source} query failed`, { cause });
    this.name = 'WorkoutAnalyticsDataError';
  }
}

function compareTerminalSessions<T extends TerminalSession>(left: T, right: T): number {
  return right.session_date.localeCompare(left.session_date)
    || (right.completed_at ?? '').localeCompare(left.completed_at ?? '')
    || right.id.localeCompare(left.id);
}

/** PostgREST filter for rows strictly older than a newest-first terminal-session boundary. */
export function terminalSessionCursorFilter(cursor: TerminalSession): string {
  const { session_date: sessionDate, completed_at: completedAt, id } = cursor;
  if (!completedAt) throw new Error('Terminal-session cursors require completed_at');
  return `session_date.lt.${sessionDate},and(session_date.eq.${sessionDate},completed_at.lt.${completedAt}),and(session_date.eq.${sessionDate},completed_at.eq.${completedAt},id.lt.${id})`;
}

/** Fetch every terminal-session page, dedupe overlapping rows, and stabilize tie order. */
export async function fetchAllTerminalSessionPages<T extends TerminalSession>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  const seen = new Set<string>();
  const result: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    for (const row of page) {
      if (row.completed_at !== null && !seen.has(row.id)) {
        seen.add(row.id);
        result.push(row);
      }
    }
    if (page.length < pageSize) return result.sort(compareTerminalSessions);
  }
}

/** Load a bounded newest-first window and report whether older rows exist. */
export async function fetchBoundedTerminalSessionPages<T extends TerminalSession>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 100,
  maxRows = 250,
): Promise<{ rows: T[]; truncated: boolean }> {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const take = Math.min(pageSize, maxRows - from);
    const page = await fetchPage(from, from + take);
    for (const row of page.slice(0, take)) {
      if (row.completed_at !== null && !seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
    if (page.length <= take) return { rows: rows.sort(compareTerminalSessions), truncated: false };
    if (from + take >= maxRows) return { rows: rows.sort(compareTerminalSessions), truncated: true };
  }
  return { rows: rows.sort(compareTerminalSessions), truncated: true };
}

export function chunkIds(ids: string[], size = 500): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Expand every active program's weekday recurrence for one local calendar month. */
export function expandScheduledDates(programs: AnalyticsProgram[], month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return [];
  const first = new Date(year, monthNumber - 1, 1, 12);
  const last = new Date(year, monthNumber, 0, 12);
  const scheduled = new Set<string>();
  for (const program of programs) {
    const weekdays = new Set((program.workout_program_days ?? []).map((day) => day.weekday));
    if (!weekdays.size) continue;
    for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
      const key = localDateKey(date);
      if ((!program.starts_on || key >= program.starts_on) && weekdays.has(date.getDay())) scheduled.add(key);
    }
  }
  return [...scheduled].sort();
}

interface LoadWorkoutAnalyticsOptions {
  client: SupabaseClient;
  userId: string;
  pageSize?: number;
  setBatchSize?: number;
  sessionLimit?: number;
  measurementLimit?: number;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Analytics load aborted', 'AbortError');
}

export async function loadWorkoutAnalyticsData({
  client,
  userId,
  pageSize = 500,
  setBatchSize = 500,
  sessionLimit = 250,
  measurementLimit = 250,
  signal,
}: LoadWorkoutAnalyticsOptions): Promise<WorkoutAnalyticsData> {
  throwIfAborted(signal);

  const sessionsPromise = fetchBoundedTerminalSessionPages(async (from, to) => {
    let query = client
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('session_date', { ascending: false })
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.range(from, to);
    if (error) throw new WorkoutAnalyticsDataError('sessions', error);
    return (data ?? []) as WorkoutSession[];
  }, pageSize, sessionLimit);

  let measurementsQuery = client
    .from('measurements')
    .select('measured_date, weight_kg')
    .eq('user_id', userId)
    .order('measured_date', { ascending: false })
    .limit(measurementLimit + 1);
  let programsQuery = client
    .from('workout_programs')
    .select('starts_on, workout_program_days(weekday)')
    .eq('client_id', userId)
    .eq('status', 'active')
    .order('starts_on', { ascending: true });
  if (signal) {
    measurementsQuery = measurementsQuery.abortSignal(signal);
    programsQuery = programsQuery.abortSignal(signal);
  }

  const [sessionWindow, measurementResult, programResult] = await Promise.all([
    sessionsPromise,
    measurementsQuery,
    programsQuery,
  ]);
  throwIfAborted(signal);
  const sessions = sessionWindow.rows;

  const bySessionId = new Map(sessions.map((session) => [session.id, session]));
  const sets: AnalyticsLoggedSet[] = [];
  for (const ids of chunkIds(sessions.map((session) => session.id), setBatchSize)) {
    let query = client
      .from('workout_sets')
      .select('*, exercise:exercises(*)')
      .in('session_id', ids)
      .order('session_id', { ascending: true })
      .order('exercise_id', { ascending: true })
      .order('set_number', { ascending: true })
      .order('id', { ascending: true });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new WorkoutAnalyticsDataError('sets', error);
    for (const raw of data ?? []) {
      const set = raw as WorkoutSet & { exercise: Exercise | null };
      const session = bySessionId.get(set.session_id);
      if (set.exercise && session) sets.push({ ...set, exercise: set.exercise, session });
    }
    throwIfAborted(signal);
  }

  const rawMeasurements = (measurementResult.data ?? []) as AnalyticsMeasurement[];
  return {
    sessions,
    sets,
    measurements: measurementResult.error ? [] : rawMeasurements.slice(0, measurementLimit).reverse(),
    programs: programResult.error ? [] : (programResult.data ?? []) as AnalyticsProgram[],
    issues: {
      schedule: Boolean(programResult.error),
      measurements: Boolean(measurementResult.error),
      historyTruncated: sessionWindow.truncated,
      measurementsTruncated: !measurementResult.error && rawMeasurements.length > measurementLimit,
    },
  };
}
