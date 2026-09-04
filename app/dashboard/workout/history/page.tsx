'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronDown, ChevronUp, Clock, Dumbbell, RotateCcw, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import { groupWorkoutSessionsByMonth } from '@/components/workout/analytics/history-grouping';
import { exerciseDisplayName } from '@/components/workout/muscle-groups';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import { supabase } from '@/lib/supabase';
import type { Exercise, PainFlag, WorkoutSession, WorkoutSet } from '@/lib/types';
import { chunkIds, terminalSessionCursorFilter } from '@/lib/workout/analytics-data';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';

type SetWithExercise = WorkoutSet & { exercise: Exercise };
interface SessionWithSets extends WorkoutSession { sets: SetWithExercise[] }
const HISTORY_PAGE_SIZE = 30;

function SessionCard({ session, lang }: { session: SessionWithSets; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const [unit] = useWeightUnit();
  const router = useRouter();
  const locale = localeForLanguage(lang);
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);

  let totalVolume = 0;
  let hasVolume = false;
  for (const set of session.sets) {
    if (set.weight_kg !== null && set.reps !== null) {
      totalVolume += set.weight_kg * set.reps;
      hasVolume = true;
    }
  }
  const exerciseCount = new Set(session.sets.map((set) => set.exercise_id)).size;
  const prCount = session.sets.filter((set) => set.is_pr).length;
  const isCardio = session.workout_kind === 'cardio';
  const grouped = useMemo(() => {
    const map = new Map<string, { exercise: Exercise; sets: SetWithExercise[] }>();
    for (const set of session.sets) {
      const existing = map.get(set.exercise_id);
      if (existing) existing.sets.push(set);
      else map.set(set.exercise_id, { exercise: set.exercise, sets: [set] });
    }
    return [...map.values()];
  }, [session.sets]);

  const getExerciseName = (exercise: Exercise) => exerciseDisplayName(exercise, lang);
  const formatDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const difference = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
    if (difference === 0) return t('general.today');
    if (difference === 1) return t('general.yesterday');
    return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  };
  const summaryValue = isCardio
    ? session.cardio_distance_km !== null && session.cardio_distance_km !== undefined
      ? t('workout.distance_summary', { distance: number.format(session.cardio_distance_km) })
      : session.cardio_effort !== null && session.cardio_effort !== undefined
        ? t('workout.effort_summary', { effort: session.cardio_effort })
        : t('workout.analytics_history_not_recorded')
    : hasVolume
      ? t('workout.analytics_history_volume_value', { value: number.format(kgToDisplay(totalVolume, unit)), unit })
      : t('workout.analytics_history_not_recorded');

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass overflow-hidden" data-history-card>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={`${session.name || t('workout.title')}. ${t(expanded ? 'workout.history_hide_set_details' : 'workout.history_show_set_details')}`} className="grid min-h-11 min-w-11 w-full grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 p-4 text-left min-[375px]:grid-cols-[2.5rem_minmax(0,1fr)_auto] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--action-primary) 10%, transparent)' }}><Dumbbell size={18} className="gold-text" /></div>
        <div className="min-w-0" data-history-primary>
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--content-primary)]">{session.name || t('workout.title')}</p>
            {prCount > 0 ? <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--action-primary) 15%, transparent)', color: 'var(--action-primary)' }}><Trophy size={9} /> {number.format(prCount)}</span> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--content-muted)]">
            <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(session.session_date)}</span>
            {session.duration_minutes !== null ? <span className="flex items-center gap-1"><Clock size={10} />{t('workout.history_minutes', { n: number.format(session.duration_minutes) })}</span> : null}
            {isCardio ? <span>{t(`workout.cardio_${session.cardio_activity ?? 'other'}`)}</span> : <span>{t('workout.analytics_history_exercise_count', { count: number.format(exerciseCount) })}</span>}
          </div>
        </div>
        <div className="col-start-2 flex min-w-0 items-center justify-between gap-2 text-xs min-[375px]:col-start-3 min-[375px]:row-start-1 min-[375px]:block min-[375px]:shrink-0 min-[375px]:text-right" data-history-summary>
          <p className="shrink-0 text-sm font-semibold gold-text">{summaryValue}</p>
          <p className="min-w-0 truncate text-[var(--content-muted)]">{isCardio ? t('workout.cardio_summary') : t('workout.volume')}</p>
          {expanded ? <ChevronUp size={14} className="shrink-0 text-[var(--content-muted)] min-[375px]:mt-1" /> : <ChevronDown size={14} className="shrink-0 text-[var(--content-muted)] min-[375px]:mt-1" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 px-4 pb-4">
              {isCardio ? <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-subtle)] p-3 text-xs">
                <div><dt className="text-[var(--content-muted)]">{t('workout.activity')}</dt><dd className="mt-1 font-semibold text-[var(--content-primary)]">{t(`workout.cardio_${session.cardio_activity ?? 'other'}`)}</dd></div>
                <div><dt className="text-[var(--content-muted)]">{t('workout.duration_minutes')}</dt><dd className="mt-1 font-semibold text-[var(--content-primary)]">{session.duration_minutes === null ? t('workout.analytics_history_not_recorded') : t('workout.history_minutes', { n: number.format(session.duration_minutes) })}</dd></div>
                {session.cardio_distance_km !== null && session.cardio_distance_km !== undefined ? <div><dt className="text-[var(--content-muted)]">{t('workout.distance')}</dt><dd className="mt-1 font-semibold text-[var(--content-primary)]">{t('workout.distance_summary', { distance: number.format(session.cardio_distance_km) })}</dd></div> : null}
                {session.cardio_effort !== null && session.cardio_effort !== undefined ? <div><dt className="text-[var(--content-muted)]">{t('workout.effort')}</dt><dd className="mt-1 font-semibold text-[var(--content-primary)]">{number.format(session.cardio_effort)}/10</dd></div> : null}
              </dl> : null}
              {grouped.map(({ exercise, sets }) => <div key={exercise.id}>
                <p className="mb-1 text-xs font-medium text-[var(--content-secondary)]">{getExerciseName(exercise)}</p>
                <div className="space-y-0.5">{sets.map((set) => <div key={set.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="w-5 text-right text-[var(--content-muted)]">{number.format(set.set_number)}</span>
                  {set.is_warmup ? <span className="text-xs font-medium text-[var(--content-secondary)]">{t('workout.history_warmup')}</span> : null}
                  <span className={set.is_pr ? 'font-semibold text-[var(--action-primary)]' : 'text-[var(--content-secondary)]'}>{set.weight_kg === null ? t('workout.analytics_history_not_recorded') : `${number.format(kgToDisplay(set.weight_kg, unit))} ${unit}`}</span>
                  <span aria-hidden="true" className="text-[var(--content-muted)]">×</span>
                  <span className="text-[var(--content-secondary)]">{set.reps === null ? t('workout.analytics_history_not_recorded') : number.format(set.reps)}</span>
                  {set.rpe !== null ? <span className="text-[var(--content-muted)]">@{number.format(set.rpe)}</span> : null}
                  {set.is_pr ? <Trophy size={10} className="text-[var(--action-primary)]" /> : null}
                </div>)}</div>
              </div>)}
              {session.pain_flags.length > 0 ? <div className="border-t pt-2" style={{ borderColor: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
                <p className="mb-1 text-xs text-[var(--status-danger-fg)]">{t('workout.analytics_history_pain_flags')}</p>
                {session.pain_flags.map((flag, index) => <p key={`${flag.body_part}-${index}`} className="text-xs text-[var(--content-muted)]">{t('workout.analytics_history_pain_entry', { bodyPart: flag.body_part, severity: number.format(flag.severity) })}{flag.notes ? ` — ${flag.notes}` : ''}</p>)}
              </div> : null}
              <button type="button" onClick={() => router.push(`/dashboard/workout?repeat=${session.id}`)} className="flex min-h-11 min-w-11 w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--action-primary) 10%, transparent)', color: 'var(--action-primary)', border: '1px solid color-mix(in srgb, var(--action-primary) 20%, transparent)' }}><RotateCcw size={12} />{t('workout.repeat')}</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function WorkoutHistoryPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const cursor = useRef<WorkoutSession | null>(null);
  const locale = localeForLanguage(lang);
  const latestSession = sessions[0] ?? null;
  const latestEvidence = useMemo(() => {
    if (!latestSession) return null;
    const exercises = new Map<string, string>();
    let workingSets = 0;
    let personalRecords = 0;
    for (const set of latestSession.sets) {
      if (!set.is_warmup) workingSets += 1;
      if (set.is_pr) personalRecords += 1;
      exercises.set(set.exercise_id, exerciseDisplayName(set.exercise, lang));
    }
    return { exercises: [...exercises.values()], workingSets, personalRecords };
  }, [lang, latestSession]);
  const latestDate = useMemo(() => latestSession
    ? new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${latestSession.session_date}T12:00:00`))
    : '', [latestSession, locale]);

  const load = useCallback(async (reset = true) => {
    const request = ++requestId.current;
    if (reset) {
      setLoading(true);
      setError(false);
    } else {
      setLoadingMore(true);
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (request !== requestId.current) return;
      if (!user) { router.push('/login'); return; }
      let sessionsQuery = supabase.from('workout_sessions').select('*').eq('user_id', user.id).not('completed_at', 'is', null).order('session_date', { ascending: false }).order('completed_at', { ascending: false }).order('id', { ascending: false });
      if (!reset && cursor.current) sessionsQuery = sessionsQuery.or(terminalSessionCursorFilter(cursor.current));
      const { data, error: sessionsError } = await sessionsQuery.limit(HISTORY_PAGE_SIZE + 1);
      if (sessionsError || data === null) throw sessionsError ?? new Error('sessions unavailable');
      const terminalSessions = (data as WorkoutSession[]).slice(0, HISTORY_PAGE_SIZE);
      if (request !== requestId.current) return;
      const bySession = new Map<string, SetWithExercise[]>();
      for (const ids of chunkIds(terminalSessions.map((session) => session.id))) {
        const { data, error: setsError } = await supabase.from('workout_sets').select('*, exercise:exercises(*)').in('session_id', ids).order('session_id', { ascending: true }).order('exercise_id', { ascending: true }).order('set_number', { ascending: true }).order('id', { ascending: true });
        if (setsError || data === null) throw setsError ?? new Error('sets unavailable');
        for (const rawSet of data) {
          const set = rawSet as WorkoutSet & { exercise: Exercise | null };
          if (!set.exercise) continue;
          const resolved = { ...set, exercise: set.exercise };
          const existing = bySession.get(set.session_id);
          if (existing) existing.push(resolved);
          else bySession.set(set.session_id, [resolved]);
        }
      }
      if (request !== requestId.current) return;
      const next = terminalSessions.map((session) => ({ ...session, pain_flags: (session.pain_flags as unknown as PainFlag[]) ?? [], sets: bySession.get(session.id) ?? [] }));
      cursor.current = terminalSessions.at(-1) ?? cursor.current;
      setHasMore(data.length > HISTORY_PAGE_SIZE);
      setSessions((current) => reset ? next : [...current, ...next.filter((session) => !current.some((existing) => existing.id === session.id))]);
    } catch {
      if (request === requestId.current && reset) setError(true);
    } finally {
      if (request === requestId.current) {
        if (reset) setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(true); }, 0);
    return () => { window.clearTimeout(timer); requestId.current += 1; };
  }, [load]);

  return <div data-testid="workout-history-canvas" className="min-h-screen bg-[var(--workout-canvas)] pb-28">
    <div data-testid="workout-history-layout" className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.65fr)] lg:items-start lg:gap-8 lg:pt-6">
      <div className="min-w-0">
      {loading ? <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-[var(--content-muted)]"><div aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--action-primary)]" />{t('workout.analytics_history_loading')}</div> : null}
      {!loading && error ? <div role="alert" className="py-10 text-center text-sm text-[var(--status-danger-fg)]"><p>{t('workout.analytics_history_load_failed')}</p><button type="button" onClick={() => void load(true)} className="mt-3 min-h-11 px-3 text-[var(--action-primary)]">{t('workout.retry')}</button></div> : null}
      {!loading && !error && sessions.length === 0 ? <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center"><Dumbbell size={48} className="mx-auto mb-4 text-[var(--content-muted)]" /><p className="text-sm text-[var(--content-muted)]">{t('workout.no_sessions')}</p><Link href="/dashboard/workout" className="btn-gold mt-4 inline-flex min-h-11 min-w-11 items-center justify-center px-6 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.start')}</Link></motion.div> : null}
      {!loading && !error && sessions.length > 0 ? <div className="space-y-7">{groupWorkoutSessionsByMonth(sessions, locale).map((group) => <section key={group.monthKey} aria-labelledby={`history-${group.monthKey}`}><h2 id={`history-${group.monthKey}`} className="mb-3 text-sm font-semibold text-[var(--content-primary)]">{group.month}</h2><div className="space-y-3">{group.sessions.map((session) => <SessionCard key={session.id} session={session} lang={lang} />)}</div></section>)}{hasMore ? <button type="button" disabled={loadingMore} onClick={() => void load(false)} className="mx-auto flex min-h-11 items-center justify-center rounded-xl border border-[var(--workout-rail)] px-5 text-sm font-semibold text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t(loadingMore ? 'workout.analytics_history_loading_older' : 'workout.analytics_history_load_older')}</button> : null}</div> : null}
      </div>
      {!loading && !error ? <aside aria-labelledby="recent-training-evidence" className="sticky top-20 hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)] p-5 lg:block">
        <h2 id="recent-training-evidence" className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.home_recent_progress')}</h2>
        {latestSession && latestEvidence ? <>
          <p className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--content-primary)]">{latestSession.name || t('workout.title')}</p>
          <time className="mt-1 block text-sm text-[var(--content-muted)]" dateTime={latestSession.session_date}>{latestDate}</time>
          <dl className="mt-5 divide-y divide-[var(--workout-rail)] border-y border-[var(--workout-rail)] text-sm">
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_duration')}</dt><dd className="font-mono font-semibold tabular-nums text-[var(--content-primary)]">{latestSession.duration_minutes === null ? t('workout.analytics_history_not_recorded') : t('workout.history_minutes', { n: latestSession.duration_minutes })}</dd></div>
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_sets')}</dt><dd className="font-mono font-semibold tabular-nums text-[var(--content-primary)]">{latestEvidence.workingSets}</dd></div>
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_prs')}</dt><dd className="font-mono font-semibold tabular-nums text-[var(--content-primary)]">{latestEvidence.personalRecords}</dd></div>
            <div className="flex items-center justify-between gap-3 py-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_pain')}</dt><dd className="font-mono font-semibold tabular-nums text-[var(--content-primary)]">{latestSession.pain_flags.length}</dd></div>
          </dl>
          {latestEvidence.exercises.length ? <ul className="mt-4 space-y-2 text-sm text-[var(--content-secondary)]">{latestEvidence.exercises.slice(0, 4).map((name) => <li key={name} className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--action-primary)]" />{name}</li>)}</ul> : null}
        </> : <p className="mt-4 text-sm leading-6 text-[var(--content-muted)]">{t('workout.no_sessions')}</p>}
        <Link href="/dashboard/workout/stats" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--workout-rail)] px-4 text-sm font-semibold text-[var(--action-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.home_training_progress')}</Link>
      </aside> : null}
    </div>
    <BotNav routes={[
      { href: '/dashboard', label: t('nav.home'), icon: <Icon name="i-home" size={18} /> },
      { href: '/dashboard/log', label: t('nav.log'), icon: <Icon name="i-book" size={18} /> },
      { href: '/dashboard/progress', label: t('nav.progress'), icon: <Icon name="i-chart" size={18} /> },
      { href: '/dashboard/profile', label: t('nav.me'), icon: <Icon name="i-user" size={18} /> },
    ]} />
  </div>;
}
