'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Dumbbell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Exercise, WorkoutSession, WorkoutSet } from '@/lib/types';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import { WorkoutCalendar } from './WorkoutCalendar';
import { ExerciseProgressChart } from './ExerciseProgressChart';
import { MuscleLoadChart, type MuscleLoadRange } from './MuscleLoadChart';
import { WorkoutSummaryMetrics } from './WorkoutSummaryMetrics';
import { useWeightUnit } from '@/lib/workout/units';

type LoggedSet = WorkoutSet & { exercise: Exercise; session: WorkoutSession };
const ranges: Array<{ value: MuscleLoadRange; label: string }> = [{ value: 'last', label: 'Last' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }];
const today = () => new Date().toLocaleDateString('en-CA');

export default function WorkoutAnalyticsSurface() {
  const router = useRouter();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<MuscleLoadRange>('week');
  const [exerciseId, setExerciseId] = useState('');
  const [selectedDate, setSelectedDate] = useState(today());
  const [measurements, setMeasurements] = useState<Array<{ measured_date: string; weight_kg: number | null }>>([]);
  const [measurementError, setMeasurementError] = useState(false);
  const [scheduled, setScheduled] = useState<string[]>([]);
  const [unit] = useWeightUnit();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: sessionData, error: sessionError } = await supabase.from('workout_sessions').select('*').eq('user_id', user.id).not('completed_at', 'is', null).order('session_date', { ascending: false }).order('id', { ascending: false });
      if (sessionError) throw sessionError;
      const loaded = (sessionData ?? []) as WorkoutSession[];
      setSessions(loaded);
      const [measurementResult, programResult] = await Promise.all([
        supabase.from('measurements').select('measured_date, weight_kg').eq('user_id', user.id).order('measured_date', { ascending: true }),
        supabase.from('workout_programs').select('starts_on, workout_program_days(weekday)').eq('client_id', user.id).eq('status', 'active').maybeSingle(),
      ]);
      setMeasurementError(Boolean(measurementResult.error));
      if (measurementResult.data) setMeasurements(measurementResult.data as Array<{ measured_date: string; weight_kg: number | null }>);
      const program = programResult.data as { starts_on?: string | null; workout_program_days?: Array<{ weekday: number }> } | null;
      if (program && !programResult.error) {
        const calendarMonth = today().slice(0, 7);
        const start = new Date(`${calendarMonth}-01T12:00:00`); const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        const dates: string[] = [];
        for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
          const key = date.toLocaleDateString('en-CA');
          if ((!program.starts_on || key >= program.starts_on) && program.workout_program_days?.some((day) => day.weekday === date.getDay())) dates.push(key);
        }
        setScheduled(dates);
      }
      if (!loaded.length) { setSets([]); return; }
      const byId = new Map(loaded.map((session) => [session.id, session]));
      const { data: rawSets, error: setsError } = await supabase.from('workout_sets').select('*, exercise:exercises(*)').in('session_id', loaded.map((session) => session.id)).order('set_number');
      if (setsError) throw setsError;
      setSets((rawSets ?? []).flatMap((raw) => {
        const set = raw as WorkoutSet & { exercise: Exercise | null };
        const session = byId.get(set.session_id);
        return set.exercise && session ? [{ ...set, exercise: set.exercise, session }] : [];
      }));
    } catch (cause) {
      console.error('Unable to load workout analytics', cause);
      setError('Workout analytics could not load. Check your connection and try again.');
    } finally { setLoading(false); }
  }, [router]);
  useEffect(() => {
    const request = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const exerciseOptions = useMemo(() => [...new Map(sets.map((set) => [set.exercise_id, set.exercise.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [sets]);
  const selected = exerciseId || exerciseOptions[0]?.[0] || '';
  const entries = useMemo(() => {
    const grouped = new Map<string, { date: string; exercise: Exercise; sets: Array<{ completed: boolean; isWarmup: boolean }> }>();
    for (const set of sets) {
      const key = `${set.session_id}:${set.exercise_id}`;
      const entry = grouped.get(key) ?? { date: set.session.session_date, exercise: set.exercise, sets: [] };
      // These persisted rows are logged-set evidence; keep task 1's `completed` boundary explicit.
      entry.sets.push({ completed: true, isWarmup: set.is_warmup });
      grouped.set(key, entry);
    }
    return [...grouped.values()];
  }, [sets]);
  const summary = useMemo(() => sessions.map((session) => ({ id: session.id, durationMinutes: session.duration_minutes, sets: sets.filter((set) => set.session_id === session.id).map((set) => ({ completed: true, isWarmup: set.is_warmup, weightKg: set.weight_kg, reps: set.reps, isPr: set.is_pr })) })), [sessions, sets]);
  const progress = useMemo(() => sets.filter((set) => set.exercise_id === selected && !set.is_warmup).map((set) => ({ date: set.session.session_date, weightKg: set.weight_kg, reps: set.reps })), [selected, sets]);
  const name = exerciseOptions.find(([id]) => id === selected)?.[1] ?? 'Exercise';
  const completed = useMemo(() => [...new Set(sessions.map((session) => session.session_date))], [sessions]);

  return <div className="min-h-screen bg-[var(--canvas)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-7 flex items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--content-primary)]">Analytics</h1><p className="mt-1 text-sm text-[var(--content-muted)]">Completed training evidence, grouped for review.</p></div><Link href="/dashboard/workout/history" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">History</Link></header>
      {loading ? <p role="status" className="py-16 text-center text-sm text-[var(--content-muted)]">Loading workout analytics…</p> : error ? <section role="alert" className="rounded-xl bg-[var(--surface-subtle)] p-5"><AlertCircle size={20} className="mb-2 text-[var(--status-danger-fg)]" /><p className="text-sm text-[var(--content-secondary)]">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--action-primary)] outline outline-1 outline-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button></section> : !sessions.length ? <section className="py-16 text-center"><Dumbbell size={34} className="mx-auto text-[var(--content-muted)]" /><h2 className="mt-4 text-lg font-semibold text-[var(--content-primary)]">No workout evidence yet</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[var(--content-muted)]">Finish and save a workout to see its calendar, working sets, volume, and progress here.</p><Link href="/dashboard/workout" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--action-primary)] px-4 text-sm font-semibold text-[var(--on-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Log a workout</Link></section> : <div className="space-y-7">
        <WorkoutSummaryMetrics sessions={summary} unit={unit} />
        <section><h2 className="text-lg font-semibold text-[var(--content-primary)]">Workout calendar</h2><p className="mb-3 mt-1 text-sm text-[var(--content-muted)]">Scheduled and completed workout evidence.</p><WorkoutCalendar month={selectedDate.slice(0, 7)} scheduled={scheduled} completed={completed} today={today()} selectedDate={selectedDate} onSelect={setSelectedDate} onMonthChange={(next) => setSelectedDate(`${next}-01`)} /></section>
        <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--content-primary)]">Muscle load</h2><p className="mt-1 text-sm text-[var(--content-muted)]">Completed sets weighted by curated primary, secondary, and stabilizer roles.</p></div><div role="group" aria-label="Muscle load range" className="flex rounded-lg bg-[var(--surface-subtle)] p-1">{ranges.map((item) => <button key={item.value} type="button" onClick={() => setRange(item.value)} aria-pressed={range === item.value} className={`min-h-11 rounded-md px-3 text-sm ${range === item.value ? 'bg-[var(--surface-2)] font-semibold text-[var(--content-primary)]' : 'text-[var(--content-muted)]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>{item.label}</button>)}</div></div><MuscleLoadChart range={range} data={entries} now={selectedDate} /></section>
        <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--content-primary)]">Exercise progress</h2><p className="mt-1 text-sm text-[var(--content-muted)]">Each point is a completed weighted set; estimated 1RM is not inferred.</p></div>{exerciseOptions.length > 1 ? <label className="text-sm text-[var(--content-secondary)]">Exercise<select value={selected} onChange={(event) => setExerciseId(event.target.value)} className="mt-1 block min-h-11 rounded-lg bg-[var(--surface-subtle)] px-3 text-base text-[var(--content-primary)] outline outline-1 outline-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{exerciseOptions.map(([id, optionName]) => <option key={id} value={id}>{optionName}</option>)}</select></label> : null}</div><ExerciseProgressChart exerciseName={name} data={progress} /></section>
        <section className="border-t border-[var(--border-default)] pt-5"><h2 className="text-lg font-semibold text-[var(--content-primary)]">Body weight</h2>{measurementError ? <p role="alert" className="mt-2 text-sm text-[var(--status-danger-fg)]">Body-weight measurements could not load. Try again.</p> : !measurements.filter((m) => m.weight_kg !== null).length ? <p className="mt-2 text-sm text-[var(--content-muted)]">No body-weight measurements recorded.</p> : <ul className="mt-2 space-y-1 text-sm text-[var(--content-secondary)]">{measurements.filter((m) => m.weight_kg !== null).map((m) => <li key={m.measured_date}>{m.measured_date}: {unit === 'lb' ? Math.round((m.weight_kg! / 0.45359237) * 10) / 10 : m.weight_kg} {unit}</li>)}</ul>}</section>
      </div>}
    </main>
    <BotNav routes={[{ href: '/dashboard', label: 'Home', icon: <Icon name="i-home" size={18} /> }, { href: '/dashboard/log', label: 'Log', icon: <Icon name="i-book" size={18} /> }, { href: '/dashboard/progress', label: 'Progress', icon: <Icon name="i-chart" size={18} /> }, { href: '/dashboard/profile', label: 'Me', icon: <Icon name="i-user" size={18} /> }]} />
  </div>;
}
