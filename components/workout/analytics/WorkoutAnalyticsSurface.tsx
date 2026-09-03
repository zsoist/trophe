'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Dumbbell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import { WorkoutCalendar } from './WorkoutCalendar';
import { ExerciseProgressChart } from './ExerciseProgressChart';
import { MuscleLoadChart, type MuscleLoadRange } from './MuscleLoadChart';
import { WorkoutSummaryMetrics } from './WorkoutSummaryMetrics';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';
import {
  expandScheduledDates,
  loadWorkoutAnalyticsData,
  type WorkoutAnalyticsData,
} from '@/lib/workout/analytics-data';

const emptyData: WorkoutAnalyticsData = {
  sessions: [],
  sets: [],
  measurements: [],
  programs: [],
  issues: { schedule: false, measurements: false, historyTruncated: false, measurementsTruncated: false },
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function WorkoutAnalyticsSurface() {
  const router = useRouter();
  const { lang, t } = useI18n();
  const locale = localeForLanguage(lang);
  const [data, setData] = useState<WorkoutAnalyticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<MuscleLoadRange>('week');
  const [exerciseId, setExerciseId] = useState('');
  const today = localDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [unit] = useWeightUnit();
  const requestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true);
    setError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (controller.signal.aborted || id !== requestId.current) return;
      if (!user) {
        router.push('/login');
        return;
      }
      const loaded = await loadWorkoutAnalyticsData({ client: supabase, userId: user.id, signal: controller.signal });
      if (controller.signal.aborted || id !== requestId.current) return;
      setData(loaded);
    } catch (cause) {
      if (controller.signal.aborted || id !== requestId.current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      console.error('Unable to load workout analytics', cause);
      setError(true);
    } finally {
      if (!controller.signal.aborted && id === requestId.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
      activeController.current?.abort();
    };
  }, [load]);

  const indexed = useMemo(() => {
    const setsBySession = new Map<string, WorkoutAnalyticsData['sets']>();
    const entries = new Map<string, { sessionId: string; date: string; exercise: WorkoutAnalyticsData['sets'][number]['exercise']; sets: Array<{ completed: boolean; isWarmup: boolean }> }>();
    const exerciseNames = new Map<string, string>();
    const progressByExercise = new Map<string, Array<{ sessionId: string; date: string; weightKg: number | null; reps: number | null }>>();
    for (const set of data.sets) {
      const sessionSets = setsBySession.get(set.session_id);
      if (sessionSets) sessionSets.push(set); else setsBySession.set(set.session_id, [set]);

      const entryKey = `${set.session_id}:${set.exercise_id}`;
      const entry = entries.get(entryKey) ?? { sessionId: set.session_id, date: set.session.session_date, exercise: set.exercise, sets: [] };
      entry.sets.push({ completed: true, isWarmup: set.is_warmup });
      entries.set(entryKey, entry);
      exerciseNames.set(set.exercise_id, set.exercise.name);

      if (!set.is_warmup) {
        const points = progressByExercise.get(set.exercise_id);
        const point = { sessionId: set.session_id, date: set.session.session_date, weightKg: set.weight_kg, reps: set.reps };
        if (points) points.push(point); else progressByExercise.set(set.exercise_id, [point]);
      }
    }
    return { setsBySession, entries: [...entries.values()], exerciseNames, progressByExercise };
  }, [data.sets]);

  const exerciseOptions = useMemo(() => [...indexed.exerciseNames.entries()].sort((left, right) => left[1].localeCompare(right[1], locale)), [indexed.exerciseNames, locale]);
  const selectedExercise = exerciseId || exerciseOptions[0]?.[0] || '';
  const summary = useMemo(() => data.sessions.map((session) => ({
    id: session.id,
    durationMinutes: session.duration_minutes,
    sets: (indexed.setsBySession.get(session.id) ?? []).map((set) => ({ completed: true, isWarmup: set.is_warmup, weightKg: set.weight_kg, reps: set.reps, isPr: set.is_pr })),
  })), [data.sessions, indexed.setsBySession]);
  const completed = useMemo(() => [...new Set(data.sessions.map((session) => session.session_date))], [data.sessions]);
  const scheduled = useMemo(() => expandScheduledDates(data.programs, selectedDate.slice(0, 7)), [data.programs, selectedDate]);
  const measurements = useMemo(() => data.measurements.filter((measurement) => measurement.weight_kg !== null), [data.measurements]);
  const latestCompletedSessionId = data.sessions[0]?.id;
  const hasPartialIssue = data.issues.schedule || data.issues.measurements;
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }), [locale]);
  const ranges: MuscleLoadRange[] = ['last', 'week', 'month', 'all'];

  return <div data-testid="training-progress-canvas" className="min-h-screen bg-[var(--workout-canvas)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-7 flex items-end justify-between gap-4 lg:mb-9">
        <div>
          <p data-testid="training-progress-title" aria-hidden="true" className="text-2xl font-semibold tracking-[-0.02em] text-[var(--content-primary)]">{t('workout.stats')}</p>
          <p className="mt-1 max-w-[65ch] text-sm text-[var(--content-muted)]">{t('workout.analytics_intro')}</p>
        </div>
        <Link href="/dashboard/workout/history" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.history')}</Link>
      </header>
      {loading ? <p role="status" className="py-16 text-center text-sm text-[var(--content-muted)]">{t('workout.analytics_loading')}</p> : error ? <section role="alert" className="rounded-xl bg-[var(--surface-subtle)] p-5"><AlertCircle size={20} className="mb-2 text-[var(--status-danger-fg)]" /><p className="text-sm text-[var(--content-secondary)]">{t('workout.analytics_load_failed')}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--action-primary)] outline outline-1 outline-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.retry')}</button></section> : <>
        {data.issues.historyTruncated ? <p role="status" className="mb-7 rounded-xl bg-[var(--surface-subtle)] p-4 text-sm text-[var(--content-secondary)]">{t('workout.analytics_history_limited')}</p> : null}
        {data.issues.measurementsTruncated ? <p role="status" className="mb-7 rounded-xl bg-[var(--surface-subtle)] p-4 text-sm text-[var(--content-secondary)]">{t('workout.analytics_measurements_limited')}</p> : null}
        {hasPartialIssue ? <section role="alert" className="mb-7 rounded-xl bg-[var(--surface-subtle)] p-4 text-sm text-[var(--status-danger-fg)]">{data.issues.schedule ? <p>{t('workout.analytics_schedule_failed')}</p> : null}{data.issues.measurements ? <p>{t('workout.analytics_body_weight_failed')}</p> : null}<button type="button" onClick={() => void load()} className="mt-3 min-h-11 px-3 font-medium text-[var(--action-primary)]">{t('workout.retry')}</button></section> : null}
        <div data-testid="training-progress-layout" className="space-y-7 lg:grid lg:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] lg:items-start lg:gap-10 lg:space-y-0">
          <div className="min-w-0 space-y-7 lg:space-y-10">
            {!data.sessions.length ? <section className="py-10 text-center"><Dumbbell size={34} className="mx-auto text-[var(--content-muted)]" /><h2 className="mt-4 text-lg font-semibold text-[var(--content-primary)]">{t('workout.analytics_no_evidence_title')}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[var(--content-muted)]">{t('workout.analytics_no_evidence_body')}</p><Link href="/dashboard/workout" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--action-primary)] px-4 text-sm font-semibold text-[var(--on-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.analytics_log_workout')}</Link></section> : <WorkoutSummaryMetrics sessions={summary} unit={unit} />}
            <section><h2 className="text-lg font-semibold text-[var(--content-primary)]">{t('workout.analytics_calendar_title')}</h2><p className="mb-3 mt-1 text-sm text-[var(--content-muted)]">{t('workout.analytics_calendar_intro')}</p><WorkoutCalendar month={selectedDate.slice(0, 7)} scheduled={scheduled} completed={completed} today={today} selectedDate={selectedDate} onSelect={setSelectedDate} onMonthChange={(next) => setSelectedDate(`${next}-01`)} />{!data.issues.schedule && scheduled.length === 0 ? <p className="mt-2 text-sm text-[var(--content-muted)]">{t('workout.analytics_schedule_empty')}</p> : null}</section>
            <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--content-primary)]">{t('workout.analytics_muscle_load_title')}</h2><p className="mt-1 text-sm text-[var(--content-muted)]">{t('workout.analytics_muscle_load_intro')}</p></div><div role="group" aria-label={t('workout.analytics_range_label')} className="flex rounded-lg bg-[var(--surface-subtle)] p-1">{ranges.map((item) => <button key={item} type="button" onClick={() => setRange(item)} aria-pressed={range === item} className={`min-h-11 rounded-md px-3 text-sm ${range === item ? 'bg-[var(--surface-2)] font-semibold text-[var(--content-primary)]' : 'text-[var(--content-muted)]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>{t(`workout.analytics_range_${item}`)}</button>)}</div></div><MuscleLoadChart range={range} data={indexed.entries} now={selectedDate} latestCompletedSessionId={latestCompletedSessionId} /></section>
          </div>
          <div className="min-w-0 space-y-7 lg:border-l lg:border-[var(--workout-rail)] lg:pl-10">
            <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--content-primary)]">{t('workout.analytics_progress_title')}</h2><p className="mt-1 text-sm text-[var(--content-muted)]">{t('workout.analytics_progress_intro')}</p></div>{exerciseOptions.length > 1 ? <label className="text-sm text-[var(--content-secondary)]">{t('workout.analytics_exercise_label')}<select value={selectedExercise} onChange={(event) => setExerciseId(event.target.value)} className="mt-1 block min-h-11 rounded-lg bg-[var(--surface-subtle)] px-3 text-base text-[var(--content-primary)] outline outline-1 outline-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{exerciseOptions.map(([id, optionName]) => <option key={id} value={id}>{optionName}</option>)}</select></label> : null}</div><ExerciseProgressChart exerciseName={indexed.exerciseNames.get(selectedExercise) ?? t('workout.analytics_exercise_fallback')} data={indexed.progressByExercise.get(selectedExercise) ?? []} unit={unit} /></section>
            <section className="border-t border-[var(--border-default)] pt-5"><h2 className="text-lg font-semibold text-[var(--content-primary)]">{t('workout.analytics_body_weight_title')}</h2>{!data.issues.measurements && measurements.length === 0 ? <p className="mt-2 text-sm text-[var(--content-muted)]">{t('workout.analytics_body_weight_empty')}</p> : <ul className="mt-2 space-y-1 text-sm text-[var(--content-secondary)]">{measurements.map((measurement) => <li key={measurement.measured_date}>{t('workout.analytics_body_weight_row', { date: date.format(new Date(`${measurement.measured_date}T12:00:00`)), value: number.format(kgToDisplay(measurement.weight_kg!, unit)), unit })}</li>)}</ul>}</section>
          </div>
        </div>
      </>}
    </main>
    <BotNav routes={[{ href: '/dashboard', label: t('nav.home'), icon: <Icon name="i-home" size={18} /> }, { href: '/dashboard/log', label: t('nav.log'), icon: <Icon name="i-book" size={18} /> }, { href: '/dashboard/progress', label: t('nav.progress'), icon: <Icon name="i-chart" size={18} /> }, { href: '/dashboard/profile', label: t('nav.me'), icon: <Icon name="i-user" size={18} /> }]} />
  </div>;
}
