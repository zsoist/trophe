'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Dumbbell, Plus, Trophy } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise, MuscleGroup } from '@/lib/types';
import { resolveWorkoutAsset } from '@/lib/workout-assets';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';
import { exerciseDisplayName, muscleColor, muscleLabelKey } from './muscle-groups';
import { MovementVisual } from './MovementVisual';

interface HistoryEntry { date: string; topWeightKg: number | null; topReps: number | null; sets: number }
interface GuidanceSections { setup: string[]; execution: string[]; breathing: string[]; mistakes: string[] }

export interface ExerciseDetailProps {
  exercise: Exercise;
  userId: string | null;
  onAdd?: (exercise: Exercise) => void;
  isAdded?: boolean;
  alternateAction?: { label: string; onClick: () => void };
  className?: string;
}

const breathingPattern = /\b(?:breath\w*|inhale\w*|exhale\w*|respir\w*|inhala\w*|exhala\w*)\b|αναπν|εισπν|εκπν/i;
const mistakePattern = /\b(?:avoid|do not|don't|never|evita\w*|no)\b|μην|αποφ/i;
const setupPattern = /\b(?:set|setup|position|stand|sit|lie|plant|grip|feet|stance|coloca\w*|posición|pies|agarre)\b|θέση|πόδια|λαβή/i;

function sentenceBoundaries(value: string): string[] {
  return value.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

export function organizeExerciseGuidance(value: string | null): GuidanceSections {
  const sections: GuidanceSections = { setup: [], execution: [], breathing: [], mistakes: [] };
  for (const sentence of sentenceBoundaries(value ?? '')) {
    if (breathingPattern.test(sentence)) sections.breathing.push(sentence);
    else if (mistakePattern.test(sentence)) sections.mistakes.push(sentence);
    else if (setupPattern.test(sentence)) sections.setup.push(sentence);
    else sections.execution.push(sentence);
  }
  return sections;
}

function GuidanceBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-semibold text-[var(--content-primary)]">{title}</h2>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2 text-sm leading-6 text-[var(--content-secondary)]">
          {items.map((item) => <p key={item}>{item}</p>)}
        </div>
      ) : <p className="mt-2 text-sm leading-6 text-[var(--content-muted)]">{empty}</p>}
    </section>
  );
}

export function ExerciseDetail({ exercise, userId, onAdd, isAdded = false, alternateAction, className = '' }: ExerciseDetailProps) {
  const { t, lang } = useI18n();
  const [unit] = useWeightUnit();
  const [pr, setPr] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(userId ? null : []);
  const name = exerciseDisplayName(exercise, lang);
  const instructions = lang === 'es' && exercise.instructions_es ? exercise.instructions_es
    : lang === 'el' && exercise.instructions_el ? exercise.instructions_el
    : exercise.instructions ?? null;
  const guidance = useMemo(() => organizeExerciseGuidance(instructions), [instructions]);
  const asset = resolveWorkoutAsset({ exerciseName: exercise.name, muscleGroup: exercise.muscle_group });
  const visualLabel = asset.kind === 'technique' ? t('workout.info_technique') : t('workout.info_muscles_worked');
  const visualAlt = asset.kind === 'technique' ? `${name} technique` : `${name} muscles worked anatomy`;
  const secondaries = (exercise.secondary_muscles ?? []).filter(Boolean) as MuscleGroup[];

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      // The authenticated browser client and joined user filter preserve workout_sets RLS.
      const { data } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_warmup, workout_sessions!inner(user_id, session_date)')
        .eq('exercise_id', exercise.id)
        .eq('workout_sessions.user_id', userId)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })
        .limit(120);
      if (!active) return;

      type Row = { weight_kg: number | null; reps: number | null; workout_sessions: { session_date: string } };
      const rows = ((data as unknown as Row[]) ?? []);
      const byDate = new Map<string, Row[]>();
      let best = 0;
      for (const row of rows) {
        if (row.weight_kg !== null) best = Math.max(best, row.weight_kg);
        const date = row.workout_sessions.session_date;
        byDate.set(date, [...(byDate.get(date) ?? []), row]);
      }
      setPr(best > 0 ? best : null);
      setHistory([...byDate.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 3)
        .map(([date, dateRows]) => {
          const top = dateRows.reduce<Row | null>((current, row) => (
            row.weight_kg !== null && (current === null || row.weight_kg > (current.weight_kg ?? 0)) ? row : current
          ), null);
          return { date, topWeightKg: top?.weight_kg ?? null, topReps: top?.reps ?? null, sets: dateRows.length };
        }));
    })();
    return () => { active = false; };
  }, [exercise.id, userId]);

  return (
    <article className={`mx-auto w-full max-w-3xl pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${className}`}>
      <figure className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
        <div className="h-64 w-full sm:h-80">
          <MovementVisual asset={asset} alt={visualAlt} priority sizes="(max-width: 768px) 100vw, 768px" />
        </div>
        <figcaption className="border-t border-[var(--border-subtle)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">{visualLabel}</h2>
        </figcaption>
      </figure>

      <header className="mt-5 flex items-start gap-3">
        <span className="mt-2 h-3 w-3 shrink-0 rounded-full" style={{ background: muscleColor(exercise.muscle_group) }} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--content-primary)]">{name}</h1>
          <p className="mt-1 text-sm text-[var(--content-muted)]">
            {exercise.equipment ? exercise.equipment.charAt(0).toUpperCase() + exercise.equipment.slice(1) : '—'}
            {exercise.is_compound ? ` · ${t('workout.compound')}` : ''}
          </p>
        </div>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.info_primary')}</h2>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">{t(muscleLabelKey(exercise.muscle_group))}</p>
        </section>
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.info_secondary')}</h2>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            {secondaries.length > 0 ? secondaries.map((muscle) => t(muscleLabelKey(muscle))).join(', ') : '—'}
          </p>
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GuidanceBlock title={t('workout.info_setup')} items={guidance.setup} empty={t('workout.info_not_provided')} />
        <GuidanceBlock title={t('workout.info_execution')} items={guidance.execution} empty={t('workout.info_not_provided')} />
        <GuidanceBlock title={t('workout.info_breathing')} items={guidance.breathing} empty={t('workout.info_not_provided')} />
        <GuidanceBlock title={t('workout.info_common_mistakes')} items={guidance.mistakes} empty={t('workout.info_not_provided')} />
      </div>

      <section className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <h2 className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.info_safety')}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--content-muted)]">{t('workout.info_safety_unavailable')}</p>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]"><Trophy size={16} aria-hidden="true" />{t('workout.info_pr')}</h2>
          <p className="mt-3 font-mono text-lg font-semibold tabular-nums text-[var(--action-primary)]">{pr !== null ? `${kgToDisplay(pr, unit)} ${unit}` : '—'}</p>
        </section>
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">{t('workout.info_last')}</h2>
          {history === null ? <p className="mt-3 text-sm text-[var(--content-muted)]">{t('chat.loading')}</p> : null}
          {history !== null && history.length === 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-[var(--content-muted)]"><Dumbbell size={14} aria-hidden="true" />{t('workout.info_no_history')}</p> : null}
          {history?.map((entry) => (
            <div key={entry.date} className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--content-secondary)]">
              <span>{new Date(`${entry.date}T00:00:00`).toLocaleDateString(lang === 'es' ? 'es' : lang === 'el' ? 'el' : 'en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{entry.sets} × sets</span>
              <span className="font-mono tabular-nums">{entry.topWeightKg !== null ? `${kgToDisplay(entry.topWeightKg, unit)}${unit} × ${entry.topReps ?? 0}` : '—'}</span>
            </div>
          ))}
        </section>
      </div>

      {onAdd || alternateAction ? (
        <div className="sticky bottom-0 z-10 mt-5 border-t border-[var(--border-subtle)] bg-[var(--canvas)]/95 px-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          {onAdd ? (
            <button type="button" disabled={isAdded} aria-label={isAdded ? t('workout.exercise_added_named', { name }) : t('workout.picker_add_named', { name })} onClick={() => onAdd(exercise)} className="btn-gold inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold disabled:cursor-default disabled:opacity-70">
              {isAdded ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
              {isAdded ? t('workout.exercise_added') : t('workout.picker_add')}
            </button>
          ) : (
            <div>
              <p className="mb-2 text-center text-xs leading-5 text-[var(--content-muted)]">{t('workout.exercise_requires_strength_draft')}</p>
              <button type="button" onClick={alternateAction?.onClick} className="btn-gold inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 font-semibold">
                {alternateAction?.label}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default ExerciseDetail;
