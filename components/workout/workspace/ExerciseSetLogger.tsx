'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

export interface RestClockSnapshot {
  elapsedMs: number;
  capturedAt: number;
  running: boolean;
}

interface ExerciseSetLoggerProps {
  exercise: SetLoggerExercise;
  setNumber: number;
  unit: WeightUnit;
  initialValue?: Partial<SetLoggerValue>;
  initialSetId?: string | null;
  initialCompletedAt?: string | null;
  restTargetSeconds?: number;
  disabled?: boolean;
  grouped?: boolean;
  showExerciseHeader?: boolean;
  isLastSet?: boolean;
  onComplete(value: SetLoggerValue): Promise<string | null>;
  onUndo?: (setId: string) => Promise<boolean>;
  onTechnique?: () => void;
  onPain?: () => void;
  onPlateCalculator?: (weight: number | null) => void;
  onSuperset?: () => void;
  onRemove?: () => void;
  /** Gives the active live exercise larger, keyboard-friendly set controls. */
  focusMode?: boolean;
  paused?: boolean;
  /** Parent-owned, session-scoped clock state survives a one-stage remount. */
  restSnapshot?: RestClockSnapshot;
  onRestSnapshotChange?: (setId: string, snapshot: RestClockSnapshot | null) => void;
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
  initialCompletedAt = null,
  restTargetSeconds = 90,
  disabled = false,
  grouped = false,
  showExerciseHeader = true,
  isLastSet = false,
  onComplete,
  onUndo,
  onTechnique,
  onPain,
  onPlateCalculator,
  onSuperset,
  onRemove,
  focusMode = false,
  paused = false,
  restSnapshot: suppliedRestSnapshot,
  onRestSnapshotChange,
}: ExerciseSetLoggerProps) {
  const { t } = useI18n();
  const [weight, setWeight] = useState(initialValue?.weight == null ? '' : String(initialValue.weight));
  const [reps, setReps] = useState(initialValue?.reps == null ? '' : String(initialValue.reps));
  const [rpe, setRpe] = useState(initialValue?.rpe == null ? '' : String(initialValue.rpe));
  const [isWarmup, setIsWarmup] = useState(initialValue?.isWarmup ?? false);
  const [setId, setSetId] = useState<string | null>(initialSetId);
  const [completedSetNumber, setCompletedSetNumber] = useState<number | null>(initialSetId ? setNumber : null);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const recoverySnapshot = useCallback((): RestClockSnapshot | null => {
    const completedAt = initialSetId && initialCompletedAt ? Date.parse(initialCompletedAt) : Number.NaN;
    if (!Number.isFinite(completedAt)) return null;
    const now = Date.now();
    return { elapsedMs: Math.max(0, now - completedAt), capturedAt: now, running: !paused };
  }, [initialCompletedAt, initialSetId, paused]);
  const [restSnapshot, setRestSnapshot] = useState<RestClockSnapshot | null>(() => suppliedRestSnapshot ?? recoverySnapshot());
  const snapshotRef = useRef(restSnapshot);
  const lastParentSnapshot = useRef(suppliedRestSnapshot);
  const reportedInitialSnapshot = useRef(false);
  const elapsedAt = (snapshot: RestClockSnapshot, now: number) => snapshot.elapsedMs + (snapshot.running ? Math.max(0, now - snapshot.capturedAt) : 0);
  const commitRestSnapshot = useCallback((next: RestClockSnapshot | null, id = setId) => {
    snapshotRef.current = next;
    setRestSnapshot(next);
    if (id) onRestSnapshotChange?.(id, next);
  }, [onRestSnapshotChange, setId]);
  useLayoutEffect(() => {
    if (!suppliedRestSnapshot || suppliedRestSnapshot === lastParentSnapshot.current) return;
    lastParentSnapshot.current = suppliedRestSnapshot;
    snapshotRef.current = suppliedRestSnapshot;
    setRestSnapshot(suppliedRestSnapshot);
  }, [suppliedRestSnapshot]);
  const activeRestSnapshot = restSnapshot;

  useEffect(() => {
    if (reportedInitialSnapshot.current || !initialSetId || suppliedRestSnapshot || !restSnapshot) return;
    reportedInitialSnapshot.current = true;
    onRestSnapshotChange?.(initialSetId, restSnapshot);
  }, [initialSetId, onRestSnapshotChange, restSnapshot, suppliedRestSnapshot]);

  useEffect(() => {
    if (initialSetId) {
      // Prop-driven row recovery is an external workspace synchronization;
      // keep the persisted database row authoritative after remount/reorder.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWeight(initialValue?.weight == null ? '' : String(initialValue.weight));
      setReps(initialValue?.reps == null ? '' : String(initialValue.reps));
      setRpe(initialValue?.rpe == null ? '' : String(initialValue.rpe));
      setIsWarmup(initialValue?.isWarmup ?? false);
      setSetId(initialSetId);
      setCompletedSetNumber(setNumber);
      // A supplied snapshot is authoritative after a paused-stage remount.
      // Only a newly observed persisted set falls back to its server timestamp.
      if (initialSetId !== setId) commitRestSnapshot(suppliedRestSnapshot ?? recoverySnapshot(), initialSetId);
      return;
    }

    // A manually saved warm-up is inserted before planned work. React keeps
    // the planned row key so unsaved typed work survives ordinary prefix
    // insertion, but a completion accepted for the old number must never move
    // with that row and lend its database id to the new work set.
    if (setId && completedSetNumber !== null && completedSetNumber !== setNumber) {
      setWeight(initialValue?.weight == null ? '' : String(initialValue.weight));
      setReps(initialValue?.reps == null ? '' : String(initialValue.reps));
      setRpe(initialValue?.rpe == null ? '' : String(initialValue.rpe));
      setIsWarmup(initialValue?.isWarmup ?? false);
      setSetId(null);
      setCompletedSetNumber(null);
      commitRestSnapshot(null, setId);
    }
  }, [commitRestSnapshot, completedSetNumber, initialSetId, initialValue?.isWarmup, initialValue?.reps, initialValue?.rpe, initialValue?.weight, recoverySnapshot, setId, setNumber, suppliedRestSnapshot]);

  useEffect(() => {
    const currentSnapshot = snapshotRef.current;
    if (!setId || !currentSnapshot) return;
    const now = Date.now();
    if (paused && currentSnapshot.running) {
      commitRestSnapshot({ elapsedMs: elapsedAt(currentSnapshot, now), capturedAt: now, running: false });
      return;
    }
    const runningSnapshot = !paused && !currentSnapshot.running
      ? { ...currentSnapshot, capturedAt: now, running: true }
      : currentSnapshot;
    if (runningSnapshot !== currentSnapshot) commitRestSnapshot(runningSnapshot);
    if (!runningSnapshot.running) return;
    const timer = window.setInterval(() => {
      const current = snapshotRef.current;
      if (!current || !current.running) return;
      const ticked = { elapsedMs: elapsedAt(current, Date.now()), capturedAt: Date.now(), running: true };
      commitRestSnapshot(ticked);
      if (ticked.elapsedMs >= restTargetSeconds * 1_000) commitRestSnapshot(null);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [commitRestSnapshot, paused, restTargetSeconds, setId]);

  const toggleComplete = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      if (setId) {
        const removed = onUndo ? await onUndo(setId) : false;
        if (removed) {
          setSetId(null);
          setCompletedSetNumber(null);
          commitRestSnapshot(null, setId);
        }
        return;
      }
      const savedId = await onComplete({
        weight: parsedNumber(weight),
        reps: parsedNumber(reps),
        rpe: parsedNumber(rpe),
        isWarmup,
      });
      if (savedId) {
        setSetId(savedId);
        setCompletedSetNumber(setNumber);
        commitRestSnapshot({ elapsedMs: 0, capturedAt: Date.now(), running: !paused }, savedId);
      }
    } catch {
      // The row remains editable and retryable.
    } finally {
      setSaving(false);
    }
  };

  const completed = Boolean(setId);
  return (
    <article
      data-set-row
      data-exercise-id={exercise.id}
      className={grouped
        ? `${showExerciseHeader ? 'rounded-t-2xl border-t' : ''} ${isLastSet ? 'rounded-b-2xl' : ''} border-x border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3`
        : 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3'}
    >
      {showExerciseHeader ? <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          {!focusMode ? <h3 className="font-semibold text-[var(--content-primary)]">{exercise.name}</h3> : null}
          <p className="text-xs text-[var(--content-muted)]">{t('workout.set_number', { n: setNumber })}</p>
        </div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-label={t('workout.more_exercise_options')}
          disabled={disabled}
          onClick={() => setMoreOpen((open) => !open)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm text-[var(--content-secondary)]"
        >
          {t('workout.more')}<ChevronDown size={16} aria-hidden="true" />
        </button>
      </div> : <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--content-muted)]">{t('workout.set_number', { n: setNumber })}</p>}

      <div className={grouped ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.weight_in_unit', { unit })}
          <input type="number" min="0" step="any" inputMode="decimal" disabled={completed || disabled} aria-label={t('workout.weight_in_unit', { unit })} value={weight} onChange={(event) => setWeight(event.target.value)} className={`input-dark mt-1 w-full font-mono tabular-nums ${focusMode ? 'min-h-14 text-lg' : 'min-h-12 text-base'}`} />
        </label>
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.reps')}
          <input type="number" min="1" step="1" inputMode="numeric" disabled={completed || disabled} aria-label={t('workout.reps')} value={reps} onChange={(event) => setReps(event.target.value)} className={`input-dark mt-1 w-full font-mono tabular-nums ${focusMode ? 'min-h-14 text-lg' : 'min-h-12 text-base'}`} />
        </label>
        {grouped ? <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.rpe_optional')}
          <input type="number" min="1" max="10" step="0.5" inputMode="decimal" disabled={completed || disabled} aria-label={t('workout.rpe_optional')} value={rpe} onChange={(event) => setRpe(event.target.value)} className="input-dark mt-1 min-h-12 w-full font-mono text-base tabular-nums" />
        </label> : null}
      </div>
      <div className={grouped ? 'mt-2' : 'mt-3 grid grid-cols-[minmax(0,1fr)_minmax(9rem,1.4fr)] gap-3'}>
        {!grouped ? (
        <label className="text-sm font-medium text-[var(--content-secondary)]">
          {t('workout.rpe_optional')}
          <input type="number" min="1" max="10" step="0.5" inputMode="decimal" disabled={completed || disabled} aria-label={t('workout.rpe_optional')} value={rpe} onChange={(event) => setRpe(event.target.value)} className="input-dark mt-1 min-h-12 w-full font-mono text-base tabular-nums" />
        </label>) : null}
        <button type="button" disabled={saving || disabled} onClick={() => void toggleComplete()} className={`${grouped ? '' : 'mt-6'} btn-gold inline-flex w-full items-center justify-center gap-2 rounded-xl disabled:opacity-50 ${focusMode ? 'min-h-14 text-lg' : 'min-h-12'}`}>
          <Check size={17} aria-hidden="true" />{saving ? t('workout.saving') : completed ? t('workout.undo_set') : t('workout.complete_set')}
        </button>
      </div>
      <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--content-secondary)]">
        <input type="checkbox" disabled={completed || disabled} checked={isWarmup} onChange={(event) => setIsWarmup(event.target.checked)} />
        {t('workout.warmup')}
      </label>

      {completed && activeRestSnapshot !== null ? (
        <p role="status" className="mt-2 rounded-xl bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-fg)]">
          {t('workout.resting')} · <span className="font-mono tabular-nums">{Math.floor(activeRestSnapshot.elapsedMs / 1_000)}s / {restTargetSeconds}s</span>
        </p>
      ) : null}

      {showExerciseHeader && moreOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button type="button" disabled={disabled} onClick={onTechnique} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Info size={16} aria-hidden="true" />{t('workout.info_technique')}</button>
          <button type="button" disabled={disabled} onClick={onPain} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><AlertTriangle size={16} aria-hidden="true" />{t('workout.report_pain')}</button>
          {exercise.equipment === 'barbell' ? <button type="button" disabled={disabled} onClick={() => onPlateCalculator?.(parsedNumber(weight))} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Calculator size={16} aria-hidden="true" />{t('workout.plate_title')}</button> : null}
          <button type="button" disabled={disabled} onClick={onSuperset} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-3"><Link2 size={16} aria-hidden="true" />{t('workout.superset_link')}</button>
          <div className="col-span-2 mt-1 border-t border-[var(--status-danger-border)] pt-2">
            <button type="button" disabled={disabled} onClick={onRemove} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] px-3 text-[var(--status-danger-fg)]"><Trash2 size={16} aria-hidden="true" />{t('workout.remove_exercise')}</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
