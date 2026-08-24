'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Plus, Square } from 'lucide-react';
import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';
import PainFlagModal from '@/components/workout/PainFlagModal';
import PlateCalculator from '@/components/workout/PlateCalculator';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { ExerciseSetLogger, type SetLoggerValue } from '@/components/workout/workspace/ExerciseSetLogger';
import { FinishWorkoutDialog } from '@/components/workout/workspace/FinishWorkoutDialog';
import { LiveCardio, type CardioLogValues } from '@/components/workout/workspace/LiveCardio';
import { useI18n } from '@/lib/i18n';
import type { Exercise, PainFlag } from '@/lib/types';
import {
  completeLiveSet,
  finishLiveSession,
  loadLivePainFlags,
  loadLivePrMap,
  loadLiveSessionSets,
  removeAndNormalizeLiveExercises,
  recoverLiveExtraRows,
  recoverLiveSupersetLinks,
  saveLivePainFlags,
  uncompleteLiveSet,
  updateLiveStructure,
} from '@/lib/workout/live-session';
import { elapsedActiveMs } from '@/lib/workout/workspace-state';
import { getRestTarget } from '@/lib/workout/rest-targets';
import { supersetGroupFor } from '@/lib/workout/supersets';
import { displayToKg, kgToDisplay, useWeightUnit } from '@/lib/workout/units';
import type { PersistedWorkoutSet } from '@/components/workout/workout-persistence';

interface LiveWorkoutProps {
  exercises: Exercise[];
  userId?: string | null;
}

interface LoggerRow {
  exerciseId: string;
  setNumber: number;
}

function cardioNotes(activity: string, values: CardioLogValues): string {
  return [
    `Activity: ${activity}`,
    ...(values.distanceKm === null ? [] : [`Distance: ${values.distanceKm} km`]),
    ...(values.effort === null ? [] : [`Effort: ${values.effort}/10`]),
  ].join(' · ');
}

export function LiveWorkout({ exercises, userId = null }: LiveWorkoutProps) {
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const { state } = workspace;
  const [unit] = useWeightUnit();
  const [now, setNow] = useState(0);
  const [persistedSets, setPersistedSets] = useState<PersistedWorkoutSet[]>([]);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [extraRows, setExtraRows] = useState<LoggerRow[]>([]);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [prMap, setPrMap] = useState<Record<string, number>>({});
  const [painExerciseId, setPainExerciseId] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [plateWeightKg, setPlateWeightKg] = useState<number | null>(null);
  const [finishRequested, setFinishRequested] = useState(false);
  const [savingFinish, setSavingFinish] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const [cardioValues, setCardioValues] = useState<CardioLogValues | null>(null);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [failedMutations, setFailedMutations] = useState<Set<string>>(() => new Set());
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);

  const draft = state.draft;
  const sessionId = state.sessionId;

  useEffect(() => {
    if (!state.clock?.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [state.clock?.runningSince]);

  const strengthDraftExercises = draft?.kind === 'strength' ? draft.exercises : null;
  const commitLiveStrengthStructure = workspace.commitLiveStrengthStructure;

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void Promise.all([
      loadLiveSessionSets(sessionId),
      loadLivePainFlags(sessionId),
      userId && strengthDraftExercises ? loadLivePrMap(userId, strengthDraftExercises.map((exercise) => exercise.exerciseId)) : Promise.resolve({}),
    ]).then(([sets, painResult, records]) => {
      if (!active) return;
      setPersistedSets(sets);
      if (strengthDraftExercises) {
        setExtraRows(recoverLiveExtraRows(strengthDraftExercises, sets));
        if (strengthDraftExercises.every((exercise) => exercise.linkedBelow === undefined)) {
          const recoveredLinks = new Set(recoverLiveSupersetLinks(
            strengthDraftExercises.map((exercise) => exercise.exerciseId),
            sets,
          ));
          commitLiveStrengthStructure(strengthDraftExercises.map((exercise) => ({
            ...exercise,
            linkedBelow: recoveredLinks.has(exercise.exerciseId),
          })));
        }
      }
      if (painResult.ok) setPainFlags(painResult.flags);
      else setRecoveryError(true);
      setPrMap(records);
      setRecoveryLoaded(true);
    });
    return () => { active = false; };
  }, [commitLiveStrengthStructure, recoveryAttempt, sessionId, strengthDraftExercises, userId]);

  const runMutation = async <T,>(
    key: string,
    operation: () => Promise<T>,
    verified: (value: T) => boolean,
  ): Promise<T | null> => {
    setFailedMutations((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setPendingMutations((current) => current + 1);
    try {
      const result = await operation();
      if (verified(result)) return result;
    } catch {
      // The shared recovery state below retains the failed mutation for retry.
    } finally {
      setPendingMutations((current) => Math.max(0, current - 1));
    }
    setFailedMutations((current) => new Set(current).add(key));
    return null;
  };

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const rows = useMemo(() => {
    if (!draft || draft.kind !== 'strength') return [];
    const planned = draft.exercises.flatMap((exercise) => Array.from({ length: exercise.targetSets }, (_, index) => ({ exerciseId: exercise.exerciseId, setNumber: index + 1 })));
    return [...planned, ...extraRows];
  }, [draft, extraRows]);
  const completedSets = persistedSets.length;
  const prCount = persistedSets.filter((set) => set.is_pr).length;
  const elapsedMs = elapsedActiveMs(state.clock, now);
  const durationMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  const mutationBlocked = pendingMutations > 0 || failedMutations.size > 0 || recoveryError || !recoveryLoaded;

  if (!draft || !sessionId || (state.stage !== 'live' && state.stage !== 'paused' && state.stage !== 'finishing')) {
    return <main className="mx-auto max-w-2xl px-4 py-8"><p className="text-[var(--content-secondary)]">{t('workout.no_live_session')}</p></main>;
  }

  const requestFinish = (values?: CardioLogValues) => {
    if (mutationBlocked) return;
    if (values) setCardioValues(values);
    setFinishRequested(true);
    setFinishError(false);
    workspace.requestFinish();
  };

  const cancelFinish = () => {
    setFinishRequested(false);
    setFinishError(false);
    workspace.cancelFinish();
  };

  const saveAndFinish = async () => {
    if (savingFinish || mutationBlocked) return;
    setSavingFinish(true);
    setFinishError(false);
    const currentCardio = draft.kind === 'cardio'
      ? cardioValues ?? { durationMinutes, distanceKm: draft.distanceKm, effort: draft.effort }
      : null;
    const result = await finishLiveSession({
      sessionId,
      name: draft.name,
      durationMinutes: currentCardio?.durationMinutes ?? durationMinutes,
      painFlags,
      templateId: draft.templateId ?? null,
      ...(draft.kind === 'cardio' && currentCardio ? { notes: cardioNotes(draft.activity, currentCardio) } : {}),
    }, workspace.completeFinish);
    setSavingFinish(false);
    if (!result.ok) setFinishError(true);
  };

  const discardEmpty = async () => {
    if (savingFinish || mutationBlocked) return;
    setSavingFinish(true);
    setFinishError(false);
    const deleted = await workspace.discardLive();
    setSavingFinish(false);
    if (!deleted) setFinishError(true);
  };

  if (draft.kind === 'cardio') {
    const liveCardioValues = cardioValues ?? { durationMinutes, distanceKm: draft.distanceKm, effort: draft.effort };
    const cardioIsEmpty = liveCardioValues.durationMinutes <= 0
      && (liveCardioValues.distanceKm === null || liveCardioValues.distanceKm === 0)
      && liveCardioValues.effort === null;
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {recoveryError ? (
          <div role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
            <p>{t('workout.recovery_failed')}</p>
            <button type="button" onClick={() => { setRecoveryLoaded(false); setRecoveryError(false); setRecoveryAttempt((current) => current + 1); }} className="mt-2 min-h-11 underline">{t('workout.retry_recovery')}</button>
          </div>
        ) : null}
        {failedMutations.size > 0 ? <p role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.mutation_failed')}</p> : null}
        <LiveCardio
          draft={draft}
          mode="live"
          paused={state.stage === 'paused'}
          elapsedMs={elapsedMs}
          onPause={workspace.pause}
          onResume={workspace.resume}
          disabled={mutationBlocked}
          onChange={(values) => {
            setCardioValues(values);
            workspace.updateLiveCardioDraft({ distanceKm: values.distanceKm, effort: values.effort });
          }}
          onFinish={requestFinish}
        />
        {(finishRequested || state.stage === 'finishing') ? (
          <FinishWorkoutDialog
            summary={{ durationMinutes: liveCardioValues.durationMinutes, completedSets: 0, pendingSets: 0, painNotes: painFlags.length, prs: 0 }}
            isEmpty={cardioIsEmpty}
            saving={savingFinish}
            blocked={mutationBlocked}
            error={finishError}
            onKeepTraining={cancelFinish}
            onSaveAndFinish={() => void saveAndFinish()}
            onDiscardEmpty={() => void discardEmpty()}
          />
        ) : null}
      </main>
    );
  }

  const addSet = (exerciseId: string) => {
    const max = rows.filter((row) => row.exerciseId === exerciseId).reduce((highest, row) => Math.max(highest, row.setNumber), 0);
    setExtraRows((current) => [...current, { exerciseId, setNumber: max + 1 }]);
  };

  const supersetGroup = (exerciseId: string): number | null => {
    const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
    return supersetGroupFor(draft.exercises, index);
  };

  const structureFor = (draftExercises: typeof draft.exercises) => draftExercises.map((exercise, index) => ({
    exerciseId: exercise.exerciseId,
    supersetGroup: supersetGroupFor(draftExercises, index),
  }));

  const toggleSuperset = async (exerciseId: string) => {
    const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || index >= draft.exercises.length - 1) return;
    const nextExercises = draft.exercises.map((exercise, exerciseIndex) => exerciseIndex === index
      ? { ...exercise, linkedBelow: !exercise.linkedBelow }
      : { ...exercise, linkedBelow: Boolean(exercise.linkedBelow) });
    const structure = structureFor(nextExercises);
    const saved = await runMutation(
      `superset:${exerciseId}`,
      () => updateLiveStructure(sessionId, structure),
      Boolean,
    );
    if (!saved) return;
    const groupByExercise = new Map(structure.map((exercise) => [exercise.exerciseId, exercise.supersetGroup]));
    setPersistedSets((current) => current.map((set) => ({ ...set, superset_group: groupByExercise.get(set.exercise_id) ?? null })));
    workspace.commitLiveStrengthStructure(nextExercises);
  };

  const removeExercise = async (exerciseId: string) => {
    const nextExercises = removeAndNormalizeLiveExercises(draft.exercises, exerciseId);
    const saved = await runMutation(
      `remove:${exerciseId}`,
      () => updateLiveStructure(sessionId, structureFor(nextExercises), exerciseId),
      Boolean,
    );
    if (!saved) return;
    setPersistedSets((current) => current.filter((set) => set.exercise_id !== exerciseId));
    setExtraRows((current) => current.filter((row) => row.exerciseId !== exerciseId));
    workspace.commitLiveStrengthStructure(nextExercises);
  };

  const finishOpen = finishRequested || state.stage === 'finishing';
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
        <div>
          <h2 className="font-bold text-[var(--content-primary)]">{draft.name}</h2>
          <p className="text-sm tabular-nums text-[var(--content-secondary)]">{Math.floor(elapsedMs / 60_000)}:{String(Math.floor(elapsedMs / 1_000) % 60).padStart(2, '0')}</p>
        </div>
        <button type="button" onClick={() => { if (state.stage === 'paused') workspace.resume(); else workspace.pause(); }} className="btn-ghost inline-flex min-h-11 items-center gap-2 rounded-xl px-4">
          {state.stage === 'paused' ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{t(state.stage === 'paused' ? 'workout.resume' : 'workout.pause')}
        </button>
      </section>

      <div className="space-y-3">
        {!recoveryLoaded ? <div role="status" className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" aria-label={t('workout.loading_live_session')} /> : rows.map((row) => {
          const exercise = exerciseById.get(row.exerciseId);
          const draftExercise = draft.exercises.find((candidate) => candidate.exerciseId === row.exerciseId);
          const resolved = exercise ?? {
            id: row.exerciseId,
            name: draftExercise?.exerciseName ?? row.exerciseId,
            is_compound: false,
            equipment: null,
          };
          const persisted = persistedSets.find((set) => set.exercise_id === row.exerciseId && set.set_number === row.setNumber);
          return (
            <ExerciseSetLogger
              key={`${row.exerciseId}:${row.setNumber}:${persisted?.id ?? 'draft'}`}
              exercise={{ id: resolved.id, name: resolved.name, isCompound: resolved.is_compound, equipment: resolved.equipment }}
              setNumber={row.setNumber}
              unit={unit}
              initialSetId={persisted?.id}
              initialValue={persisted ? { weight: persisted.weight_kg === null ? null : kgToDisplay(persisted.weight_kg, unit), reps: persisted.reps, rpe: persisted.rpe, isWarmup: persisted.is_warmup } : undefined}
              restTargetSeconds={getRestTarget(resolved.id, resolved.is_compound)}
              onComplete={async (value: SetLoggerValue) => {
                const weightKg = value.weight === null ? null : displayToKg(value.weight, unit);
                const isPr = Boolean(resolved.is_compound) && !value.isWarmup && weightKg !== null && weightKg > (prMap[row.exerciseId] ?? 0);
                const result = await runMutation(
                  `set:${row.exerciseId}:${row.setNumber}`,
                  () => completeLiveSet({ sessionId, exerciseId: row.exerciseId, setNumber: row.setNumber, weightKg, reps: value.reps, rpe: value.rpe, isWarmup: value.isWarmup, isPr, supersetGroup: supersetGroup(row.exerciseId) }),
                  (candidate) => candidate.ok,
                );
                if (!result?.ok) return null;
                setPersistedSets((current) => [...current.filter((set) => !(set.exercise_id === row.exerciseId && set.set_number === row.setNumber)), {
                  id: result.setId, session_id: sessionId, exercise_id: row.exerciseId, set_number: row.setNumber,
                  weight_kg: weightKg, reps: value.reps, rpe: value.rpe, is_warmup: value.isWarmup,
                  is_pr: isPr, superset_group: supersetGroup(row.exerciseId), notes: null,
                }]);
                if (isPr && weightKg !== null) setPrMap((current) => ({ ...current, [row.exerciseId]: weightKg }));
                return result.setId;
              }}
              onUndo={async (setId) => {
                const removed = await runMutation(`set:${row.exerciseId}:${row.setNumber}`, () => uncompleteLiveSet(setId), Boolean);
                if (removed) setPersistedSets((current) => current.filter((set) => set.id !== setId));
                return Boolean(removed);
              }}
              onTechnique={() => exercise && setInfoExercise(exercise)}
              onPain={() => setPainExerciseId(row.exerciseId)}
              onPlateCalculator={(displayWeight) => setPlateWeightKg(displayWeight === null ? null : displayToKg(displayWeight, unit))}
              onSuperset={() => void toggleSuperset(row.exerciseId)}
              onRemove={() => void removeExercise(row.exerciseId)}
            />
          );
        })}
      </div>

      {draft.exercises.map((exercise) => (
        <button key={exercise.exerciseId} type="button" onClick={() => addSet(exercise.exerciseId)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl"><Plus size={17} aria-hidden="true" />{t('workout.add_set')}</button>
      ))}

      {recoveryError ? (
        <div role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
          <p>{t('workout.recovery_failed')}</p>
          <button type="button" onClick={() => { setRecoveryLoaded(false); setRecoveryError(false); setRecoveryAttempt((current) => current + 1); }} className="mt-2 min-h-11 underline">{t('workout.retry_recovery')}</button>
        </div>
      ) : null}
      {failedMutations.size > 0 ? <p role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.mutation_failed')}</p> : null}

      <button type="button" onClick={() => requestFinish()} disabled={savingFinish || mutationBlocked} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] font-semibold text-[var(--status-danger-fg)] disabled:opacity-50"><Square size={17} aria-hidden="true" />{t('workout.finish')}</button>

      {finishOpen ? (
        <FinishWorkoutDialog
          summary={{ durationMinutes, completedSets, pendingSets: Math.max(0, rows.length - completedSets), painNotes: painFlags.length, prs: prCount }}
          isEmpty={completedSets === 0}
          saving={savingFinish}
          blocked={mutationBlocked}
          error={finishError}
          onKeepTraining={cancelFinish}
          onSaveAndFinish={() => void saveAndFinish()}
          onDiscardEmpty={() => void discardEmpty()}
        />
      ) : null}

      {painExerciseId ? <PainFlagModal exerciseId={painExerciseId} onSave={async (flag) => {
        const next = [...painFlags, flag];
        const saved = await runMutation('pain', () => saveLivePainFlags(sessionId, next), Boolean);
        if (!saved) return false;
        setPainFlags(next);
        return true;
      }} onClose={() => setPainExerciseId(null)} /> : null}
      {infoExercise ? <ExerciseInfoSheet exercise={infoExercise} userId={userId} onClose={() => setInfoExercise(null)} /> : null}
      {plateWeightKg !== null ? <PlateCalculator weightKg={plateWeightKg} unit={unit} onClose={() => setPlateWeightKg(null)} /> : null}
    </main>
  );
}
