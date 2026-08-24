'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Calculator, Check, ChevronDown, Info, Link2, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { WeightUnit } from '@/lib/workout/units';

export interface SetLoggerExercise {
  id: string;
  name: string;
  isCompound?: boolean | null;
  equipment?: string | null;
}

export interface SetLoggerValue {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
}

interface ExerciseSetLoggerProps {
  exercise: SetLoggerExercise;
  setNumber: number;
  unit: WeightUnit;
  initialValue?: Partial<SetLoggerValue>;
  initialSetId?: string | null;
  restTargetSeconds?: number;
  onComplete(value: SetLoggerValue): Promise<string | null>;
  onUndo?: (setId: string) => Promise<boolean>;
  onTechnique?: () => void;
  onPain?: () => void;
  onPlateCalculator?: (weight: number | null) => void;
  onSuperset?: () => void;
  onRemove?: () => void;
}

function parsedNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ExerciseSetLogger({
  exercise,
  setNumber,
  unit,
  initialValue,
  initialSetId = null,
  restTargetSeconds = 90,
  onComplete,
  onUndo,
  onTechnique,
  onPain,
  onPlateCalculator,
  onSuperset,
  onRemove,
}: ExerciseSetLoggerProps) {
  const { t } = useI18n();
  const [weight, setWeight] = useState(initialValue?.weight == null ? '' : String(initialValue.weight));
  const [reps, setReps] = useState(initialValue?.reps == null ? '' : String(initialValue.reps));
  const [rpe, setRpe] = useState(initialValue?.rpe == null ? '' : String(initialValue.rpe));
  const [isWarmup, setIsWarmup] = useState(initialValue?.isWarmup ?? false);
  const [setId, setSetId] = useState<string | null>(initialSetId);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [restElapsed, setRestElapsed] = useState(0);

  useEffect(() => {
    if (!setId) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setRestElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, [setId]);

  const toggleComplete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (setId) {
        const removed = onUndo ? await onUndo(setId) : false;
        if (removed) {
          setSetId(null);
          setRestElapsed(0);
        }
        return;
      }
      const savedId = await onComplete({
        weight: parsedNumber(weight),
        reps: parsedNumber(reps),
        rpe: parsedNumber(rpe),
        isWarmup,
      });
      if (savedId) setSetId(savedId);
    } catch {
      // The row remains editable and retryable.
    } finally {
      setSaving(false);
    }
  };

  const completed = Boolean(setId);
  return (
    <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--content-primary)]">{exercise.name}</h3>
          <p className="text-xs text-[var(--content-muted)]">{t('workout.set_number', { n: setNumber })}</p>
        </div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-label={t('workout.more_exercise_options')}
          onClick={() => setMoreOpen((open) => !open)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm text-[var(--content-secondary)]"
        >
          {t('workout.more')}<ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.weight_in_unit', { unit })}
          <input type="number" min="0" step="any" inputMode="decimal" disabled={completed} aria-label={t('workout.weight_in_unit', { unit })} value={weight} onChange={(event) => setWeight(event.target.value)} className="input-dark mt-1 min-h-12 w-full text-base" />
        </label>
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.reps')}
          <input type="number" min="1" step="1" inputMode="numeric" disabled={completed} aria-label={t('workout.reps')} value={reps} onChange={(event) => setReps(event.target.value)} className="input-dark mt-1 min-h-12 w-full text-base" />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(9rem,1.4fr)] gap-3">
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.rpe_optional')}
          <input type="number" min="1" max="10" step="0.5" inputMode="decimal" disabled={completed} aria-label={t('workout.rpe_optional')} value={rpe} onChange={(event) => setRpe(event.target.value)} className="input-dark mt-1 min-h-12 w-full text-base" />
        </label>
        <button type="button" disabled={saving} onClick={() => void toggleComplete()} className="btn-gold mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl disabled:opacity-50">
          <Check size={17} aria-hidden="true" />{saving ? t('workout.saving') : completed ? t('workout.undo_set') : t('workout.complete_set')}
        </button>
      </div>
      <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--content-secondary)]">
        <input type="checkbox" disabled={completed} checked={isWarmup} onChange={(event) => setIsWarmup(event.target.checked)} />
        {t('workout.warmup')}
      </label>

      {completed ? (
        <p role="status" className="mt-2 rounded-xl bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-fg)]">
          {t('workout.resting')} · {restElapsed}s / {restTargetSeconds}s
        </p>
      ) : null}

      {moreOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button type="button" onClick={onTechnique} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Info size={16} aria-hidden="true" />{t('workout.info_technique')}</button>
          <button type="button" onClick={onPain} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><AlertTriangle size={16} aria-hidden="true" />{t('workout.report_pain')}</button>
          {exercise.equipment === 'barbell' ? <button type="button" onClick={() => onPlateCalculator?.(parsedNumber(weight))} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Calculator size={16} aria-hidden="true" />{t('workout.plate_title')}</button> : null}
          <button type="button" onClick={onSuperset} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Link2 size={16} aria-hidden="true" />{t('workout.superset_link')}</button>
          <div className="col-span-2 mt-1 border-t border-[var(--status-danger-border)] pt-2">
            <button type="button" onClick={onRemove} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] px-3 text-[var(--status-danger-fg)]"><Trash2 size={16} aria-hidden="true" />{t('workout.remove_exercise')}</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
