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
  const { t } = useI18n();
  const [unit] = useWeightUnit();
  const [expanded, setExpanded] = useState(false);
  const [sets, setSets] = useState<ExpandedSetRow[] | null>(null);
  const [loadingSets, setLoadingSets] = useState(false);

  const d = new Date(session.session_date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && sets === null && !loadingSets) {
      setLoadingSets(true);
      const { data } = await supabase
        .from('workout_sets')
        .select('id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, exercise:exercises(name, name_es, name_el, muscle_group)')
        .eq('session_id', session.id)
        .order('set_number');
      setSets((data as unknown as ExpandedSetRow[]) ?? []);
      setLoadingSets(false);
    }
  };

  const grouped = useMemo(() => {
    if (!sets) return [];
    const map = new Map<string, { name: string; muscle: string; rows: ExpandedSetRow[] }>();
    for (const s of sets) {
      // Exercise names stay English for Greek users (see exerciseDisplayName).
      const name = s.exercise ? exerciseDisplayName(s.exercise, lang) : 'Exercise';
      if (!map.has(s.exercise_id)) map.set(s.exercise_id, { name, muscle: s.exercise?.muscle_group ?? '', rows: [] });
      map.get(s.exercise_id)!.rows.push(s);
    }
    return Array.from(map.values());
  }, [sets, lang]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={toggle}
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
            {session.duration_minutes}m
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
            <div style={{ padding: '0 14px 12px', borderTop: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              {loadingSets && (
                <p style={{ fontSize: 12, color: 'var(--content-muted)', padding: '10px 0' }}>{t('chat.loading')}</p>
              )}
              {!loadingSets && sets !== null && sets.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--content-muted)', padding: '10px 0' }}>
                  {session.notes ?? t('workout.no_sets_cardio')}
                </p>
              )}
              {grouped.map((g, gi) => (
                <div key={gi} style={{ paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 3, height: 12, borderRadius: 2, background: muscleColor(g.muscle) }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-secondary)' }}>{g.name}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {g.rows.map((r) => (
                      <span
                        key={r.id}
                        style={{
                          fontSize: 12, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 8,
                          background: r.is_pr ? 'color-mix(in srgb, var(--action-primary) 14%, transparent)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                          border: r.is_pr ? '1px solid color-mix(in srgb, var(--action-primary) 35%, transparent)' : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                          color: r.is_pr ? 'var(--action-primary)' : 'var(--content-secondary)',
                        }}
                      >
                        {r.is_warmup ? 'W ' : ''}{kgToDisplay(r.weight_kg ?? 0, unit)}{unit}×{r.reps ?? 0}
                        {r.is_pr && <Trophy size={8} className="inline ml-1" style={{ verticalAlign: -1 }} />}
                      </span>
                    ))}
                  </div>
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
