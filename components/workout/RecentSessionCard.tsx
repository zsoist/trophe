'use client';

/**
 * Recent-session card (workout landing) — tap to expand into per-exercise set
 * chips, lazily loaded. Extracted from app/dashboard/workout/page.tsx in the
 * 10/10 wave. Weights render in the user's preferred unit (kg storage).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Clock, Dumbbell, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import type { WorkoutSession } from '@/lib/types';
import { muscleColor, exerciseDisplayName } from './muscle-groups';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';

interface ExpandedSetRow {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
  is_pr: boolean;
  exercise: { name: string; name_es: string | null; name_el: string | null; muscle_group: string } | null;
}

export default function RecentSessionCard({
  session,
  lang,
}: {
  session: WorkoutSession;
  lang: string;
}) {
  const { t, lang: activeLanguage } = useI18n();
  const [unit] = useWeightUnit();
  const [expanded, setExpanded] = useState(false);
  const [sets, setSets] = useState<ExpandedSetRow[] | null>(null);
  const [loadingSets, setLoadingSets] = useState(false);
  const [setsError, setSetsError] = useState(false);

  const locale = localeForLanguage(activeLanguage);
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const d = new Date(session.session_date + 'T00:00:00');
  const label = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);

  const loadSets = async () => {
    setLoadingSets(true); setSetsError(false);
    try {
      const { data, error } = await supabase
        .from('workout_sets')
        .select('id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, exercise:exercises(name, name_es, name_el, muscle_group)')
        .eq('session_id', session.id)
        .order('set_number');
      if (error) throw error;
      setSets((data as unknown as ExpandedSetRow[]) ?? []);
    } catch { setSetsError(true); } finally { setLoadingSets(false); }
  };
  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && sets === null && !loadingSets) {
      await loadSets();
    }
  };

  const grouped = useMemo(() => {
    if (!sets) return [];
    const map = new Map<string, { name: string; muscle: string; rows: ExpandedSetRow[] }>();
    for (const s of sets) {
      // House rule (enforced by exerciseDisplayName): English for Greek users, name_es for Spanish.
      const name = s.exercise ? exerciseDisplayName(s.exercise, lang) : t('workout.analytics_exercise_fallback');
      if (!map.has(s.exercise_id)) map.set(s.exercise_id, { name, muscle: s.exercise?.muscle_group ?? '', rows: [] });
      map.get(s.exercise_id)!.rows.push(s);
    }
    return Array.from(map.values());
  }, [sets, lang, t]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`recent-session-detail-${session.id}`}
        aria-label={`${session.name ?? t('workout.title')}, ${label}${session.duration_minutes ? `, ${t('workout.history_minutes', { n: session.duration_minutes })}` : ''}. ${t(expanded ? 'workout.history_hide_set_details' : 'workout.history_show_set_details')}`}
        className="w-full text-left min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: 'transparent', border: 'none' }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: 'color-mix(in srgb, var(--action-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--action-primary) 20%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Dumbbell size={14} className="gold-text" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.name ?? t('workout.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--content-muted)', marginTop: 1 }}>{label}</div>
        </div>
        {session.duration_minutes && (
          <span style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            <Clock size={9} className="inline mr-1" />
            {t('workout.history_minutes', { n: number.format(session.duration_minutes) })}
          </span>
        )}
        {expanded
          ? <ChevronUp size={13} style={{ color: 'var(--content-muted)', flexShrink: 0 }} />
          : <ChevronDown size={13} style={{ color: 'var(--content-muted)', flexShrink: 0 }} />}
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div id={`recent-session-detail-${session.id}`} style={{ padding: '0 14px 12px', borderTop: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              {loadingSets && (
                <p style={{ fontSize: 12, color: 'var(--content-muted)', padding: '10px 0' }}>{t('chat.loading')}</p>
              )}
              {!loadingSets && setsError && <div role="alert" style={{ fontSize: 12, padding: '10px 0', color: 'var(--status-danger-fg)' }}><p>{t('workout.history_sets_failed')}</p><button type="button" onClick={() => void loadSets()} className="mt-2 min-h-11 text-[var(--action-primary)]">{t('workout.retry')}</button></div>}
              {!loadingSets && !setsError && sets !== null && sets.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--content-muted)', padding: '10px 0' }}>
                  {session.notes ?? t('workout.no_sets_cardio')}
                </p>
              )}
              {grouped.map((g, gi) => (
                <div key={gi} style={{ paddingTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: muscleColor(g.muscle) }}>{g.name}</span>
                  <table aria-label={t('workout.analytics_history_set_table', { exercise: g.name })} style={{ width: '100%', marginTop: 4, fontSize: 12, color: 'var(--content-secondary)', borderCollapse: 'collapse' }}>
                    <thead className="sr-only"><tr><th>{t('workout.set')}</th><th>{t('workout.analytics_history_type')}</th><th>{t('workout.weight')}</th><th>{t('workout.analytics_history_repetitions')}</th><th>{t('workout.analytics_summary_personal_records')}</th></tr></thead>
                    <tbody>{g.rows.map((r) => <tr key={r.id} style={{ borderTop: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
                      <td style={{ padding: '5px 0', fontFamily: 'var(--font-mono)' }}>{number.format(r.set_number)}</td><td>{r.is_warmup ? t('workout.history_warmup') : t('workout.history_working')}</td><td style={{ fontFamily: 'var(--font-mono)' }}>{r.weight_kg === null ? t('workout.analytics_history_not_recorded') : `${number.format(kgToDisplay(r.weight_kg, unit))} ${unit}`}</td><td style={{ fontFamily: 'var(--font-mono)' }}>{r.reps === null ? t('workout.analytics_history_not_recorded') : number.format(r.reps)}</td><td>{r.is_pr ? <><Trophy size={11} className="inline mr-1 text-[var(--action-primary)]" />{t('workout.history_pr')}</> : <span className="sr-only">{t('workout.analytics_history_not_pr')}</span>}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              ))}
              {!loadingSets && sets !== null && (
                <Link href="/dashboard/workout/history">
                  <span style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--action-primary)', cursor: 'pointer' }}>
                    {t('workout.view_full_history')}
                  </span>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
