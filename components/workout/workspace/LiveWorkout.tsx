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
  recoverLiveExtraRows,
  recoverLiveSupersetLinks,
  removeLiveExerciseSets,
  saveLivePainFlags,
  uncompleteLiveSet,
  updateLiveSupersets,
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
  const [hiddenExercises, setHiddenExercises] = useState<string[]>([]);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [prMap, setPrMap] = useState<Record<string, number>>({});
  const [linkedBelow, setLinkedBelow] = useState<string[]>([]);
  const [painExerciseId, setPainExerciseId] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [plateWeightKg, setPlateWeightKg] = useState<number | null>(null);
  const [finishRequested, setFinishRequested] = useState(false);
  const [savingFinish, setSavingFinish] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const [cardioValues, setCardioValues] = useState<CardioLogValues | null>(null);

  const draft = state.draft;
  const sessionId = state.sessionId;

  useEffect(() => {
    if (!state.clock?.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [state.clock?.runningSince]);

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    void Promise.all([
      loadLiveSessionSets(sessionId),
      loadLivePainFlags(sessionId),
      userId && draft?.kind === 'strength' ? loadLivePrMap(userId, draft.exercises.map((exercise) => exercise.exerciseId)) : Promise.resolve({}),
    ]).then(([sets, flags, records]) => {
      if (!active) return;
      setPersistedSets(sets);
      if (draft?.kind === 'strength') {
        setExtraRows(recoverLiveExtraRows(draft.exercises, sets));
        setLinkedBelow(recoverLiveSupersetLinks(
          draft.exercises.map((exercise) => exercise.exerciseId),
          sets,
        ));
      }
      setPainFlags(flags);
      setPrMap(records);
      setRecoveryLoaded(true);
    });
    return () => { active = false; };
  }, [draft, sessionId, userId]);

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const rows = useMemo(() => {
    if (!draft || draft.kind !== 'strength') return [];
    const planned = draft.exercises.flatMap((exercise) => Array.from({ length: exercise.targetSets }, (_, index) => ({ exerciseId: exercise.exerciseId, setNumber: index + 1 })));
    return [...planned, ...extraRows].filter((row) => !hiddenExercises.includes(row.exerciseId));
  }, [draft, extraRows, hiddenExercises]);
  const completedSets = persistedSets.length;
  const prCount = persistedSets.filter((set) => set.is_pr).length;
  const elapsedMs = elapsedActiveMs(state.clock, now);
  const durationMinutes = elapsedMs <= 0 ? 0 : Math.max(1, Math.round(elapsedMs / 60_000));

  if (!draft || !sessionId || (state.stage !== 'live' && state.stage !== 'paused' && state.stage !== 'finishing')) {
    return <main className="mx-auto max-w-2xl px-4 py-8"><p className="text-[var(--content-secondary)]">{t('workout.no_live_session')}</p></main>;
  }

  const requestFinish = (values?: CardioLogValues) => {
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
    if (savingFinish) return;
    setSavingFinish(true);
    setFinishError(false);
    const currentCardio = draft.kind === 'cardio'
      ? cardioValues ?? { durationMinutes, distanceKm: draft.distanceKm, effort: draft.effort }
      : null;
    const result = await finishLiveSession({
      sessionId,
      name: draft.name,
      durationMinutes: currentCardio?.durationMinutes ?? Math.max(1, durationMinutes),
      painFlags,
      templateId: draft.templateId ?? null,
      ...(draft.kind === 'cardio' && currentCardio ? { notes: cardioNotes(draft.activity, currentCardio) } : {}),
    }, workspace.completeFinish);
    setSavingFinish(false);
    if (!result.ok) setFinishError(true);
  };

  const discardEmpty = async () => {
    if (savingFinish) return;
    setSavingFinish(true);
    setFinishError(false);
    const deleted = await workspace.discardLive();
    setSavingFinish(false);
    if (!deleted) setFinishError(true);
  };

  if (draft.kind === 'cardio') {
    const liveCardioValues = cardioValues ?? { durationMinutes, distanceKm: draft.distanceKm, effort: draft.effort };
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <LiveCardio
          draft={draft}
          mode="live"
          paused={state.stage === 'paused'}
          elapsedMs={elapsedMs}
          onPause={workspace.pause}
          onResume={workspace.resume}
          onChange={setCardioValues}
          onFinish={requestFinish}
        />
        {(finishRequested || state.stage === 'finishing') ? (
          <FinishWorkoutDialog
            summary={{ durationMinutes: liveCardioValues.durationMinutes, completedSets: 0, pendingSets: 0, painNotes: painFlags.length, prs: 0 }}
            isEmpty={false}
            saving={savingFinish}
            error={finishError}
            onKeepTraining={cancelFinish}
            onSaveAndFinish={() => void saveAndFinish()}
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
    return supersetGroupFor(draft.exercises.map((exercise) => ({ linkedBelow: linkedBelow.includes(exercise.exerciseId) })), index);
  };

  const toggleSuperset = async (exerciseId: string) => {
    const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || index >= draft.exercises.length - 1) return;
    const nextLinks = linkedBelow.includes(exerciseId)
      ? linkedBelow.filter((id) => id !== exerciseId)
      : [...linkedBelow, exerciseId];
    const linkModel = draft.exercises.map((exercise) => ({ linkedBelow: nextLinks.includes(exercise.exerciseId) }));
    const updates = persistedSets.map((set) => ({
      id: set.id,
      superset_group: supersetGroupFor(linkModel, draft.exercises.findIndex((exercise) => exercise.exerciseId === set.exercise_id)),
    }));
    if (await updateLiveSupersets(updates)) setLinkedBelow(nextLinks);
  };

  const removeExercise = async (exerciseId: string) => {
    const ids = persistedSets.filter((set) => set.exercise_id === exerciseId).map((set) => set.id);
    if (!await removeLiveExerciseSets(ids)) return;
    setPersistedSets((current) => current.filter((set) => set.exercise_id !== exerciseId));
    setHiddenExercises((current) => [...current, exerciseId]);
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
                const result = await completeLiveSet({ sessionId, exerciseId: row.exerciseId, setNumber: row.setNumber, weightKg, reps: value.reps, rpe: value.rpe, isWarmup: value.isWarmup, isPr, supersetGroup: supersetGroup(row.exerciseId) });
                if (!result.ok) return null;
                setPersistedSets((current) => [...current.filter((set) => !(set.exercise_id === row.exerciseId && set.set_number === row.setNumber)), {
                  id: result.setId, session_id: sessionId, exercise_id: row.exerciseId, set_number: row.setNumber,
                  weight_kg: weightKg, reps: value.reps, rpe: value.rpe, is_warmup: value.isWarmup,
                  is_pr: isPr, superset_group: supersetGroup(row.exerciseId), notes: null,
                }]);
                if (isPr && weightKg !== null) setPrMap((current) => ({ ...current, [row.exerciseId]: weightKg }));
                return result.setId;
              }}
              onUndo={async (setId) => {
                const removed = await uncompleteLiveSet(setId);
                if (removed) setPersistedSets((current) => current.filter((set) => set.id !== setId));
                return removed;
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

      {draft.exercises.filter((exercise) => !hiddenExercises.includes(exercise.exerciseId)).map((exercise) => (
        <button key={exercise.exerciseId} type="button" onClick={() => addSet(exercise.exerciseId)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl"><Plus size={17} aria-hidden="true" />{t('workout.add_set')}</button>
      ))}

      <button type="button" onClick={() => requestFinish()} disabled={savingFinish} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] font-semibold text-[var(--status-danger-fg)] disabled:opacity-50"><Square size={17} aria-hidden="true" />{t('workout.finish')}</button>

      {finishOpen ? (
        <FinishWorkoutDialog
          summary={{ durationMinutes, completedSets, pendingSets: Math.max(0, rows.length - completedSets), painNotes: painFlags.length, prs: prCount }}
          isEmpty={completedSets === 0}
          saving={savingFinish}
          error={finishError}
          onKeepTraining={cancelFinish}
          onSaveAndFinish={() => void saveAndFinish()}
          onDiscardEmpty={() => void discardEmpty()}
        />
      ) : null}

      {painExerciseId ? <PainFlagModal exerciseId={painExerciseId} onSave={(flag) => {
        const next = [...painFlags, flag];
        void saveLivePainFlags(sessionId, next).then((saved) => { if (saved) setPainFlags(next); });
      }} onClose={() => setPainExerciseId(null)} /> : null}
      {infoExercise ? <ExerciseInfoSheet exercise={infoExercise} userId={userId} onClose={() => setInfoExercise(null)} /> : null}
      {plateWeightKg !== null ? <PlateCalculator weightKg={plateWeightKg} unit={unit} onClose={() => setPlateWeightKg(null)} /> : null}
    </main>
  );
}
