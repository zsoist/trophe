'use client';

/**
 * Dashboard home — today's training, finally connected.
 * Self-fetching (userId prop, RLS-scoped) so the dashboard page only mounts it.
 * Four states:
 *   trained  — session logged today: volume + sets + PRs count up, gold check
 *   assigned — active program has template(s) today: name, exercises, Start CTA
 *   rest     — program active, nothing today: next session + recovery framing
 *   free     — no program: weekly momentum + quick-start CTA
 * Accent-aware (var(--accent*)), i18n'd, zero emojis.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { Icon, AnimatedValue } from '@/components/ui';
import { localToday, localDateStr } from '@/lib/utils/dates';

interface TodayState {
  kind: 'trained' | 'assigned' | 'rest' | 'free';
  programName?: string;
  templateName?: string;
  exerciseCount?: number;
  difficulty?: string | null;
  nextWeekday?: number | null;
  // trained
  volumeKg?: number;
  sets?: number;
  prs?: number;
  // free / momentum
  weekSessions?: number;
}

const DIFF_KEY: Record<string, string> = {
  beginner: 'workout.difficulty_beginner',
  intermediate: 'workout.difficulty_intermediate',
  advanced: 'workout.difficulty_advanced',
};

export default function TodayWorkoutCard({ userId }: { userId: string | null }) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<TodayState | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const today = localToday();
      const jsDay = new Date().getDay(); // 0=Sun … 6=Sat (matches workout_program_days.weekday)

      const [progRes, sessRes, weekRes] = await Promise.all([
        supabase.from('workout_programs')
          .select('id, name, workout_program_days(weekday, sort, template_id)')
          .eq('client_id', userId).eq('status', 'active').maybeSingle(),
        supabase.from('workout_sessions')
          .select('id, name, workout_sets(weight_kg, reps, is_pr, is_warmup)')
          .eq('user_id', userId).eq('session_date', today)
          .order('created_at', { ascending: false }).limit(1),
        supabase.from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          // session_date is written with local calendar days (localToday), so the
          // 7-day window cutoff must also be local — toISOString() (UTC) mis-counts
          // by a day for non-UTC users near midnight.
          .gte('session_date', localDateStr(new Date(Date.now() - 6 * 86400_000))),
      ]);
      if (cancelled) return;

      // Trained today → celebrate regardless of program state.
      const todaySession = sessRes.data?.[0] as
        | { id: string; name: string | null; workout_sets: Array<{ weight_kg: number | null; reps: number | null; is_pr: boolean | null; is_warmup: boolean | null }> }
        | undefined;
      if (todaySession) {
        const working = (todaySession.workout_sets ?? []).filter((s) => !s.is_warmup);
        const volume = working.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
        setState({
          kind: 'trained',
          templateName: todaySession.name ?? undefined,
          volumeKg: Math.round(volume),
          sets: working.length,
          prs: working.filter((s) => s.is_pr).length,
        });
        return;
      }

      const prog = progRes.data as
        | { id: string; name: string; workout_program_days: Array<{ weekday: number; sort: number; template_id: string }> }
        | null;
      if (prog) {
        const todayDays = (prog.workout_program_days ?? [])
          .filter((d) => d.weekday === jsDay)
          .sort((a, b) => a.sort - b.sort);
        if (todayDays.length > 0) {
          const { data: tpl } = await supabase.from('workout_templates')
            .select('name, exercises, difficulty')
            .eq('id', todayDays[0].template_id).maybeSingle();
          if (cancelled) return;
          setState({
            kind: 'assigned',
            programName: prog.name,
            templateName: (tpl?.name as string) ?? t('workout.program_today'),
            exerciseCount: Array.isArray(tpl?.exercises) ? tpl!.exercises.length : 0,
            difficulty: (tpl?.difficulty as string) ?? null,
          });
          return;
        }
        // Rest day — find the next scheduled weekday.
        const days = [...new Set((prog.workout_program_days ?? []).map((d) => d.weekday))];
        let next: number | null = null;
        for (let i = 1; i <= 7; i++) {
          if (days.includes((jsDay + i) % 7)) { next = (jsDay + i) % 7; break; }
        }
        setState({ kind: 'rest', programName: prog.name, nextWeekday: next, weekSessions: weekRes.count ?? 0 });
        return;
      }

      setState({ kind: 'free', weekSessions: weekRes.count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [userId, t]);

  if (!state) return null; // no skeleton flash — card appears when known

  const WEEKDAY_KEYS = ['workout.day_0', 'workout.day_1', 'workout.day_2', 'workout.day_3', 'workout.day_4', 'workout.day_5', 'workout.day_6'];

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-4"
    >
      <Link href="/dashboard/workout" className="no-underline block">
        <div
          className={state.kind === 'trained' || state.kind === 'assigned' ? 'card-g' : 'card'}
          style={{ padding: '14px 16px', cursor: 'pointer' }}
        >
          <div className="row-b" style={{ marginBottom: state.kind === 'rest' ? 4 : 10 }}>
            <span className="eye" style={{ color: state.kind === 'trained' || state.kind === 'assigned' ? 'var(--accent)' : undefined, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="i-dumbbell" size={11} />
              {t('workout.home_title')}
            </span>
            <ChevronRight size={14} style={{ color: 'var(--t4)' }} />
          </div>

          {state.kind === 'trained' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                }}>
                  <Icon name="i-check" size={11} style={{ color: 'var(--accent)' }} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                  {t('workout.home_done')}{state.templateName ? ` · ${state.templateName}` : ''}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--t1)' }}>
                    <AnimatedValue value={state.volumeKg ?? 0} />
                    <span style={{ fontSize: 9, color: 'var(--t4)', marginLeft: 2 }}>kg</span>
                  </div>
                  <div className="eye-d">{t('workout.home_volume')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--t1)' }}>
                    <AnimatedValue value={state.sets ?? 0} />
                  </div>
                  <div className="eye-d">{t('workout.home_sets')}</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: (state.prs ?? 0) > 0 ? 'var(--accent)' : 'var(--t1)' }}>
                    <AnimatedValue value={state.prs ?? 0} />
                  </div>
                  <div className="eye-d">{t('workout.home_prs')}</div>
                </div>
              </div>
            </div>
          )}

          {state.kind === 'assigned' && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>
                {state.templateName}
              </div>
              <div className="ds-sub" style={{ fontSize: 11, marginBottom: 10 }}>
                {state.programName}
                {state.exerciseCount ? ` · ${state.exerciseCount} ${t('workout.exercises')}` : ''}
                {state.difficulty && DIFF_KEY[state.difficulty] ? ` · ${t(DIFF_KEY[state.difficulty])}` : ''}
              </div>
              <span
                className="btn-gold"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '9px 16px' }}
              >
                {t('workout.start_workout')}
                <ChevronRight size={13} />
              </span>
            </div>
          )}

          {state.kind === 'rest' && (
            <div className="ds-sub" style={{ fontSize: 12 }}>
              {t('workout.home_rest')}
              {state.nextWeekday != null && (
                <span style={{ color: 'var(--t2)' }}>
                  {' '}· {t('workout.next_session')} {t(WEEKDAY_KEYS[state.nextWeekday])}
                </span>
              )}
            </div>
          )}

          {state.kind === 'free' && (
            <div className="row-b">
              <span className="ds-sub" style={{ fontSize: 12 }}>
                {(state.weekSessions ?? 0) > 0
                  ? `${state.weekSessions} ${t('workout.home_week_sessions')}`
                  : t('workout.home_quickstart_hint')}
              </span>
              <span className="btn-ghost" style={{ fontSize: 11, padding: '7px 12px' }}>
                {t('workout.home_train')}
              </span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
