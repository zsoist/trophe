'use client';

import { useEffect, useMemo, useState } from 'react';
import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';
import PainFlagModal from '@/components/workout/PainFlagModal';
import PlateCalculator from '@/components/workout/PlateCalculator';
import type { CompletedSetInput } from '@/components/workout/workout-persistence';
import { ExerciseSetLogger, type SetLoggerValue } from '@/components/workout/workspace/ExerciseSetLogger';
import { LiveCardio, type CardioLogValues } from '@/components/workout/workspace/LiveCardio';
import { useI18n } from '@/lib/i18n';
import type { Exercise, PainFlag } from '@/lib/types';
import { loadLivePrMap, saveRetrospectiveWorkout } from '@/lib/workout/live-session';
import { supersetGroupFor } from '@/lib/workout/supersets';
import { displayToKg, useWeightUnit } from '@/lib/workout/units';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

interface RetrospectiveWorkoutLoggerProps {
  userId: string;
  draft: WorkoutDraft;
  exercises: Exercise[];
  onSaved(): void;
  onCancel(): void;
}

export function RetrospectiveWorkoutLogger({ userId, draft, exercises, onSaved, onCancel }: RetrospectiveWorkoutLoggerProps) {
  const { t } = useI18n();
  const [unit] = useWeightUnit();
  const [completed, setCompleted] = useState<Record<string, SetLoggerValue>>({});
  const [linkedBelow, setLinkedBelow] = useState<string[]>([]);
  const [prMap, setPrMap] = useState<Record<string, number>>({});
  const [historyLoaded, setHistoryLoaded] = useState(draft.kind === 'cardio');
  const [durationMinutes, setDurationMinutes] = useState(1);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [painExerciseId, setPainExerciseId] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [plateWeightKg, setPlateWeightKg] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);

  useEffect(() => {
    let active = true;
    if (draft.kind !== 'strength') return;
    void loadLivePrMap(userId, draft.exercises.map((exercise) => exercise.exerciseId)).then((records) => {
      if (!active) return;
      setPrMap(records);
      setHistoryLoaded(true);
    });
    return () => { active = false; };
  }, [draft, userId]);

  const saveCardio = async (values: CardioLogValues) => {
    if (draft.kind !== 'cardio' || saving) return;
    setSaving(true);
    setSaveError(false);
    const result = await saveRetrospectiveWorkout({
      userId,
      draft: { ...draft, durationMinutes: values.durationMinutes, distanceKm: values.distanceKm, effort: values.effort },
      sets: [],
    });
    setSaving(false);
    if (result.ok) onSaved();
    else setSaveError(true);
  };

  if (draft.kind === 'cardio') {
    return (
      <div className="space-y-3">
        <LiveCardio draft={draft} mode="retrospective" saving={saving} onSaveRetrospective={saveCardio} />
        {saveError ? <p role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.save_failed')}</p> : null}
        <button type="button" disabled={saving} onClick={onCancel} className="btn-ghost min-h-11 w-full rounded-xl">{t('workout.cancel')}</button>
      </div>
    );
  }

  const rows = draft.exercises.flatMap((exercise) => Array.from({ length: exercise.targetSets }, (_, index) => ({ exerciseId: exercise.exerciseId, setNumber: index + 1 })));
  const keyFor = (exerciseId: string, setNumber: number) => `${exerciseId}:${setNumber}`;
  const resolvedSets: CompletedSetInput[] = Object.entries(completed).map(([key, value]) => {
    const [exerciseId, rawSetNumber] = key.split(':');
    const exercise = exerciseById.get(exerciseId);
    const exerciseIndex = draft.exercises.findIndex((candidate) => candidate.exerciseId === exerciseId);
    const weightKg = value.weight === null ? null : displayToKg(value.weight, unit);
    return {
      exercise_id: exerciseId,
      set_number: Number(rawSetNumber),
      weight_kg: weightKg,
      reps: value.reps,
      rpe: value.rpe,
      is_warmup: value.isWarmup,
      is_pr: Boolean(exercise?.is_compound) && !value.isWarmup && weightKg !== null && weightKg > (prMap[exerciseId] ?? 0),
      superset_group: supersetGroupFor(
        draft.exercises.map((candidate) => ({ linkedBelow: linkedBelow.includes(candidate.exerciseId) })),
        exerciseIndex,
      ),
    };
  }).sort((a, b) => a.exercise_id.localeCompare(b.exercise_id) || a.set_number - b.set_number);

  const saveStrength = async () => {
    if (saving || resolvedSets.length === 0) return;
    setSaving(true);
    setSaveError(false);
    const result = await saveRetrospectiveWorkout({ userId, draft, sets: resolvedSets, durationMinutes, painFlags });
    setSaving(false);
    if (result.ok) onSaved();
    else setSaveError(true);
  };

  return (
    <section className="space-y-4">
      <label className="block text-sm font-medium text-[var(--content-secondary)]">
        {t('workout.strength_duration')}
        <input type="number" min="1" inputMode="numeric" aria-label={t('workout.strength_duration')} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value) || 1))} className="input-dark mt-1 min-h-12 w-full text-base" />
      </label>
      {!historyLoaded ? <div role="status" aria-label={t('workout.loading_live_session')} className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" /> : rows.map((row) => {
        const draftExercise = draft.exercises.find((exercise) => exercise.exerciseId === row.exerciseId);
        const exercise = exerciseById.get(row.exerciseId);
        const resolved = exercise ?? { id: row.exerciseId, name: draftExercise?.exerciseName ?? row.exerciseId, is_compound: false, equipment: null };
        const key = keyFor(row.exerciseId, row.setNumber);
        return (
          <ExerciseSetLogger
            key={key}
            exercise={{ id: resolved.id, name: resolved.name, isCompound: resolved.is_compound, equipment: resolved.equipment }}
            setNumber={row.setNumber}
            unit={unit}
            onComplete={async (value) => { setCompleted((current) => ({ ...current, [key]: value })); return `retrospective:${key}`; }}
            onUndo={async () => { setCompleted((current) => { const next = { ...current }; delete next[key]; return next; }); return true; }}
            onTechnique={() => exercise && setInfoExercise(exercise)}
            onPain={() => setPainExerciseId(row.exerciseId)}
            onPlateCalculator={(weight) => setPlateWeightKg(weight === null ? null : displayToKg(weight, unit))}
            onSuperset={() => {
              const index = draft.exercises.findIndex((candidate) => candidate.exerciseId === row.exerciseId);
              if (index < 0 || index >= draft.exercises.length - 1) return;
              setLinkedBelow((current) => current.includes(row.exerciseId)
                ? current.filter((id) => id !== row.exerciseId)
                : [...current, row.exerciseId]);
            }}
          />
        );
      })}
      {saveError ? <p role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.save_failed')}</p> : null}
      <button type="button" disabled={saving || resolvedSets.length === 0} onClick={() => setConfirming(true)} className="btn-gold min-h-12 w-full rounded-xl disabled:opacity-50">{t('workout.save_completed')}</button>
      <button type="button" disabled={saving} onClick={onCancel} className="btn-ghost min-h-11 w-full rounded-xl">{t('workout.cancel')}</button>

      {confirming ? (
        <div role="dialog" aria-modal="true" aria-label={t('workout.save_completed_question')} className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center bg-[var(--surface-overlay)] px-4 sm:items-center" onClick={() => setConfirming(false)}>
          <div className="glass-elevated safe-bottom w-full max-w-sm rounded-t-3xl p-5 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--content-primary)]">{t('workout.save_completed_question')}</h3>
            <div className="mt-5 space-y-3">
              <button type="button" disabled={saving} onClick={() => void saveStrength()} className="btn-gold min-h-12 w-full rounded-xl disabled:opacity-50">{saving ? t('workout.saving') : t('workout.save_workout')}</button>
              <button type="button" disabled={saving} onClick={() => setConfirming(false)} className="btn-ghost min-h-12 w-full rounded-xl">{t('workout.keep_editing')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {painExerciseId ? <PainFlagModal exerciseId={painExerciseId} onSave={(flag) => setPainFlags((current) => [...current, flag])} onClose={() => setPainExerciseId(null)} /> : null}
      {infoExercise ? <ExerciseInfoSheet exercise={infoExercise} userId={userId} onClose={() => setInfoExercise(null)} /> : null}
      {plateWeightKg !== null ? <PlateCalculator weightKg={plateWeightKg} unit={unit} onClose={() => setPlateWeightKg(null)} /> : null}
    </section>
  );
}
