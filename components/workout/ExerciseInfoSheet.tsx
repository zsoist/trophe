'use client';

/**
 * Exercise detail bottom-sheet (Hevy/Strong-style) — form cue, muscle map
 * chips, equipment, your PR and recent top sets. Opened from the picker's
 * info affordance and from session exercise headers.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Dumbbell, Trophy, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { muscleColor, muscleLabelKey } from './muscle-groups';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';

interface HistoryEntry {
  date: string;
  topWeightKg: number | null;
  topReps: number | null;
  sets: number;
}

export default function ExerciseInfoSheet({
  exercise,
  userId,
  onClose,
}: {
  exercise: Exercise;
  userId: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [unit] = useWeightUnit();
  const [pr, setPr] = useState<number | null>(null);
  // No user → nothing to fetch; start resolved so the effect never sets state
  // synchronously (react-hooks/set-state-in-effect).
  const [history, setHistory] = useState<HistoryEntry[] | null>(userId ? null : []);

  const name = lang === 'es' && exercise.name_es ? exercise.name_es
    : lang === 'el' && exercise.name_el ? exercise.name_el : exercise.name;
  const cue = lang === 'es' && exercise.instructions_es ? exercise.instructions_es
    : lang === 'el' && exercise.instructions_el ? exercise.instructions_el
    : exercise.instructions ?? null;

  useEffect(() => {
    if (!userId) return; // history already resolved to []
    let cancelled = false;
    (async () => {
      // RLS scopes workout_sets to the caller's own sessions.
      const { data } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_warmup, workout_sessions!inner(user_id, session_date)')
        .eq('exercise_id', exercise.id)
        .eq('workout_sessions.user_id', userId)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })
        .limit(120);
      if (cancelled) return;
      type Row = { weight_kg: number | null; reps: number | null; workout_sessions: { session_date: string } };
      const rows = ((data as unknown as Row[]) ?? []);

      let max = 0;
      const byDate = new Map<string, Row[]>();
      for (const r of rows) {
        if (r.weight_kg !== null && r.weight_kg > max) max = r.weight_kg;
        const d = r.workout_sessions.session_date;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(r);
      }
      setPr(max > 0 ? max : null);
      setHistory(
        Array.from(byDate.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .slice(0, 3)
          .map(([date, dayRows]) => {
            const top = dayRows.reduce<Row | null>(
              (best, r) => (r.weight_kg !== null && (best === null || (best.weight_kg ?? 0) < r.weight_kg) ? r : best),
              null,
            );
            return { date, topWeightKg: top?.weight_kg ?? null, topReps: top?.reps ?? null, sets: dayRows.length };
          }),
      );
    })();
    return () => { cancelled = true; };
  }, [exercise.id, userId]);

  const secondaries = (exercise.secondary_muscles ?? []).filter(Boolean);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        initial={reducedMotion ? false : { y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducedMotion ? undefined : { y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="glass-elevated safe-bottom w-full max-w-md rounded-t-3xl px-5 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle + close */}
        <div className="flex items-center justify-between mb-3">
          <span className="w-10 h-1 rounded-full mx-auto" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', transform: 'translateX(14px)' }} />
          <button onClick={onClose} aria-label={t('workout.custom_cancel')} className="p-1.5 rounded-lg min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
            <X size={16} style={{ color: 'var(--content-secondary)' }} />
          </button>
        </div>

        {/* Name + equipment */}
        <div className="flex items-start gap-3 mb-3">
          <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: muscleColor(exercise.muscle_group) }} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight" style={{ color: 'var(--content-primary)' }}>{name}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--content-muted)' }}>
              {exercise.equipment ? exercise.equipment.charAt(0).toUpperCase() + exercise.equipment.slice(1) : '—'}
              {exercise.is_compound && ` · ${t('workout.compound')}`}
            </p>
          </div>
        </div>

        {/* Muscle chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${muscleColor(exercise.muscle_group)}22`, color: muscleColor(exercise.muscle_group), border: `1px solid ${muscleColor(exercise.muscle_group)}44` }}>
            {t(muscleLabelKey(exercise.muscle_group))}
          </span>
          {secondaries.map((m) => (
            <span key={m} className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-secondary)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              {t(muscleLabelKey(m))}
            </span>
          ))}
        </div>

        {/* Form cue */}
        {cue && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--action-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--action-primary) 18%, transparent)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--action-primary)' }}>
              {t('workout.info_cue')}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--content-secondary)' }}>{cue}</p>
          </div>
        )}

        {/* PR */}
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={15} style={{ color: 'var(--action-primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--content-secondary)' }}>{t('workout.info_pr')}</span>
          <span className="text-sm font-bold tabular-nums ml-auto" style={{ color: pr !== null ? 'var(--action-primary)' : 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
            {pr !== null ? `${kgToDisplay(pr, unit)} ${unit}` : '—'}
          </span>
        </div>

        {/* Recent sessions */}
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--content-muted)' }}>
          {t('workout.info_last')}
        </p>
        {history === null && (
          <p className="text-xs py-2" style={{ color: 'var(--content-muted)' }}>{t('chat.loading')}</p>
        )}
        {history !== null && history.length === 0 && (
          <p className="text-xs py-2 flex items-center gap-2" style={{ color: 'var(--content-muted)' }}>
            <Dumbbell size={13} /> {t('workout.info_no_history')}
          </p>
        )}
        {history !== null && history.map((h) => (
          <div key={h.date} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
            <span className="text-xs" style={{ color: 'var(--content-secondary)' }}>
              {new Date(h.date + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es' : lang === 'el' ? 'el' : 'en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-xs" style={{ color: 'var(--content-muted)' }}>{h.sets} × sets</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--content-secondary)', fontFamily: 'var(--font-mono)' }}>
              {h.topWeightKg !== null ? `${kgToDisplay(h.topWeightKg, unit)}${unit} × ${h.topReps ?? 0}` : '—'}
            </span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
