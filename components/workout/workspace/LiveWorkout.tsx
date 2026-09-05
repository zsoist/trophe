'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Plus, Square } from 'lucide-react';
import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';
import PainFlagModal from '@/components/workout/PainFlagModal';
import PlateCalculator from '@/components/workout/PlateCalculator';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { ExerciseSetLogger, type RestClockSnapshot, type SetLoggerValue } from '@/components/workout/workspace/ExerciseSetLogger';
import { FinishWorkoutDialog, type FinishBlockedReason } from '@/components/workout/workspace/FinishWorkoutDialog';
import { LiveCardio, type CardioLogValues } from '@/components/workout/workspace/LiveCardio';
import { LiveExerciseStage } from '@/components/workout/workspace/LiveExerciseStage';
import { LiveSessionPath } from '@/components/workout/workspace/LiveSessionPath';
import { exerciseDisplayName } from '@/components/workout/muscle-groups';
import { useI18n } from '@/lib/i18n';
import type { Exercise, PainFlag } from '@/lib/types';
import {
  clearPendingLiveSets,
  completeLiveSetDetailed,
  finishLiveSession,
  appendLivePainFlag,
  loadLivePainFlags,
  loadLivePrMap,
  loadLiveSessionSets,
  loadLiveStructure,
  removeAndNormalizeLiveExercises,
  recoverLiveExtraRows,
  persistPendingLiveSet,
  removePendingLiveSet,
  replayPendingLiveSets,
  uncompleteLiveSet,
  updateLiveStructure,
  type CompleteLiveSetInput,
} from '@/lib/workout/live-session';
import { elapsedActiveMs } from '@/lib/workout/workspace-state';
import { resetWorkoutScroll } from '@/lib/workout/workspace-routes';
import { getRestTarget } from '@/lib/workout/rest-targets';

import { supersetGroupFor } from '@/lib/workout/supersets';
import { displayToKg, kgToDisplay, useWeightUnit } from '@/lib/workout/units';
import type { PersistedWorkoutSet } from '@/components/workout/workout-persistence';

interface LiveWorkoutProps {
  exercises: Exercise[];
  userId?: string | null;
}

interface ExtraLoggerRow {
  id: string;
  exerciseId: string;
}

export function LiveWorkout({ exercises, userId = null }: LiveWorkoutProps) {
  const { t, lang } = useI18n();
  const workspace = useWorkoutWorkspace();
  const { state } = workspace;
  const [unit] = useWeightUnit();
  const [now, setNow] = useState(0);
  const [persistedSets, setPersistedSets] = useState<PersistedWorkoutSet[]>([]);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [extraRows, setExtraRows] = useState<ExtraLoggerRow[]>([]);
  const extraSequence = useRef(0);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [prMap, setPrMap] = useState<Record<string, number>>({});
  const [painExerciseId, setPainExerciseId] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [plateContext, setPlateContext] = useState<{ exerciseId: string; weightKg: number } | null>(null);
  const warmupNumbersRef = useRef(new Map<string, { fingerprint: string; numbers: number[] }>());
  const [warmupCounts, setWarmupCounts] = useState<Record<string, number>>({});
  const [finishRequested, setFinishRequested] = useState(false);
  const [savingFinish, setSavingFinish] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const [cardioValues, setCardioValues] = useState<CardioLogValues | null>(null);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [failedMutations, setFailedMutations] = useState<Set<string>>(() => new Set());
  const [unsavedSetKeys, setUnsavedSetKeys] = useState<Set<string>>(() => new Set());
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [structureVersion, setStructureVersion] = useState<number | null>(null);
  const [pendingSetInputs, setPendingSetInputs] = useState<Record<string, CompleteLiveSetInput>>({});
  const [removeCandidate, setRemoveCandidate] = useState<{
    exerciseId: string;
    name: string;
    savedSetCount: number;
  } | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const draft = state.draft;
  const sessionId = state.sessionId;
  const completedRetrospective = state.completedRetrospective;
  // Rest is ephemeral view state, scoped to the authoritative session and
  // deliberately discarded on session change/finish rather than retained in a
  // process-global cache.
  const [restClock, setRestClock] = useState<{ sessionId: string | null; entries: Record<string, RestClockSnapshot> }>({ sessionId, entries: {} });
  const previousRestStage = useRef(state.stage);
  useLayoutEffect(() => {
    const previousStage = previousRestStage.current;
    previousRestStage.current = state.stage;
    setRestClock((current) => {
      if (current.sessionId !== sessionId) return { sessionId, entries: {} };
      if (previousStage === state.stage) return current;
      const now = Date.now();
      const entries = Object.fromEntries(Object.entries(current.entries).map(([setId, snapshot]) => [setId,
        state.stage === 'paused'
          ? { elapsedMs: snapshot.elapsedMs + (snapshot.running ? Math.max(0, now - snapshot.capturedAt) : 0), capturedAt: now, running: false }
          : previousStage === 'paused'
            ? { ...snapshot, capturedAt: now, running: true }
            : snapshot,
      ]));
      return { sessionId, entries };
    });
  }, [sessionId, state.stage]);
  const handleRestSnapshotChange = useCallback((setId: string, snapshot: RestClockSnapshot | null) => {
    setRestClock((current) => {
      if (current.sessionId !== sessionId) return current;
      if (snapshot === null) {
        if (!(setId in current.entries)) return current;
        const entries = { ...current.entries }; delete entries[setId];
        return { ...current, entries };
      }
      return { ...current, entries: { ...current.entries, [setId]: snapshot } };
    });
  }, [sessionId]);

  useEffect(() => {
    if (!state.clock?.runningSince) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [state.clock?.runningSince]);

  const strengthDraftExercises = draft?.kind === 'strength' ? draft.exercises : null;
  const commitLiveStrengthStructure = workspace.commitLiveStrengthStructure;
  const reconcileLive = workspace.reconcileLive;
  const liveReconciliation = workspace.liveReconciliation;

  useEffect(() => {
    let active = true;
    if (!sessionId) return;
    if (state.stage === 'completed' && completedRetrospective) {
      return;
    }
    const recoveredStructure = strengthDraftExercises?.map((exercise, index) => ({
      exerciseId: exercise.exerciseId,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      supersetGroup: supersetGroupFor(strengthDraftExercises, index),
    })) ?? [];
    void Promise.all([
      loadLiveSessionSets(sessionId),
      loadLivePainFlags(sessionId),
      loadLiveStructure(sessionId, draft?.kind, recoveredStructure, userId),
      userId && strengthDraftExercises ? loadLivePrMap(userId, strengthDraftExercises.map((exercise) => exercise.exerciseId)) : Promise.resolve({}),
    ]).then(async ([initialSetResult, painResult, structureResult, records]) => {
      if (!active) return;
      // Server truth first: a frozen or vanished row can never accept live
      // writes, so the local stage follows it instead of failing every mutation.
      if (structureResult.ok && structureResult.terminal) {
        if (state.stage !== 'completed') {
          clearPendingLiveSets(sessionId);
          reconcileLive({ outcome: 'completed', durationMinutes: structureResult.durationMinutes });
          return;
        }
        if (!initialSetResult.ok || !painResult.ok) {
          setRecoveryError(true);
          setRecoveryLoaded(false);
          return;
        }
        setPersistedSets(initialSetResult.sets);
        setPainFlags(painResult.flags);
        setPrMap(records);
        setRecoveryError(false);
        setRecoveryLoaded(true);
        return;
      }
      if (!structureResult.ok && structureResult.reason === 'missing' && state.stage !== 'completed') {
        clearPendingLiveSets(sessionId);
        reconcileLive({ outcome: 'missing' });
        return;
      }
      if (!initialSetResult.ok || !painResult.ok || !structureResult.ok) {
        setRecoveryError(true);
        setRecoveryLoaded(false);
        return;
      }
      const replay = await replayPendingLiveSets(sessionId);
      const setResult = replay.saved.length > 0
        ? await loadLiveSessionSets(sessionId)
        : initialSetResult;
      if (!active) return;
      if (!setResult.ok) {
        setRecoveryError(true);
        setRecoveryLoaded(false);
        return;
      }
      setPendingSetInputs(Object.fromEntries(replay.failed.map((input) => [
        `${input.exerciseId}:${input.setNumber}`,
        input,
      ])));
      setFailedMutations(new Set(replay.failed.map((input) => `set:${input.exerciseId}:${input.setNumber}`)));
      setUnsavedSetKeys(new Set((replay.rejected ?? []).map((input) => `set:${input.exerciseId}:${input.setNumber}`)));
      setPersistedSets(setResult.sets);
      if (strengthDraftExercises) {
        const currentById = new Map(strengthDraftExercises.map((exercise) => [exercise.exerciseId, exercise]));
        const canonicalExercises = structureResult.structure.map((exercise, index, structure) => ({
          exerciseId: exercise.exercise_id,
          exerciseName: currentById.get(exercise.exercise_id)?.exerciseName,
          targetSets: exercise.target_sets,
          targetReps: exercise.target_reps,
          linkedBelow: exercise.superset_group !== null && structure[index + 1]?.superset_group === exercise.superset_group,
        }));
        setExtraRows(recoverLiveExtraRows(canonicalExercises, setResult.sets).map((row) => ({ id: `recovered-extra:${row.exerciseId}:${row.setNumber}`, exerciseId: row.exerciseId })));
        setStructureVersion(structureResult.version);
        const currentShape = strengthDraftExercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          linkedBelow: Boolean(exercise.linkedBelow),
        }));
        const canonicalShape = canonicalExercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          linkedBelow: Boolean(exercise.linkedBelow),
        }));
        if (JSON.stringify(currentShape) !== JSON.stringify(canonicalShape)) {
          commitLiveStrengthStructure(canonicalExercises);
        }
      }
      setPainFlags(painResult.flags);
      setPrMap(records);
      setRecoveryError(false);
      setRecoveryLoaded(true);
    }).catch(() => {
      if (!active) return;
      setRecoveryError(true);
      setRecoveryLoaded(false);
    });
    return () => { active = false; };
  }, [commitLiveStrengthStructure, completedRetrospective, draft?.kind, reconcileLive, recoveryAttempt, sessionId, state.stage, strengthDraftExercises, userId]);

  const retryRecovery = () => {
    setRecoveryLoaded(false);
    setFailedMutations(new Set());
    setUnsavedSetKeys(new Set());
    setRecoveryError(false);
    setRecoveryAttempt((current) => current + 1);
  };

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

  type DetailedSetResult = Awaited<ReturnType<typeof completeLiveSetDetailed>>;
  const saveLiveSet = async (key: string, input: CompleteLiveSetInput, queued: boolean): Promise<{ ok: true; setId: string } | null> => {
    setFailedMutations((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setUnsavedSetKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setPendingMutations((current) => current + 1);
    let result: DetailedSetResult = { ok: false, kind: 'transient' };
    try {
      result = queued ? await completeLiveSetDetailed(input) : { ok: false, kind: 'transient' };
    } catch {
      result = { ok: false, kind: 'transient' };
    } finally {
      setPendingMutations((current) => Math.max(0, current - 1));
    }
    if (result.ok) return result;
    if (result.kind === 'rejected') {
      // A 22xxx/23xxx response is definitive (for example the exercise was
      // removed from the live structure). Release only this queue entry and
      // leave the row visible/editable instead of poisoning Finish forever.
      removePendingLiveSet(input);
      setPendingSetInputs((current) => {
        const next = { ...current };
        delete next[`${input.exerciseId}:${input.setNumber}`];
        return next;
      });
      setUnsavedSetKeys((current) => new Set(current).add(key));
      return null;
    }
    setFailedMutations((current) => new Set(current).add(key));
    return null;
  };

  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  // Every user-visible exercise name goes through the shared resolver (house rule:
  // English for Greek, name_es for Spanish). Draft storage keeps the canonical name.
  const displayNameFor = (exerciseId: string, fallback?: string): string => {
    const row = exerciseById.get(exerciseId);
    return row ? exerciseDisplayName(row, lang) : fallback ?? exerciseId;
  };
  const rows = useMemo(() => {
    if (!draft || draft.kind !== 'strength') return [];
    return draft.exercises.flatMap((exercise) => {
      const persistedWarmups = persistedSets.filter((set) => set.exercise_id === exercise.exerciseId && set.is_warmup).sort((a, b) => a.set_number - b.set_number);
      const recoveredWarmups = persistedWarmups.length;
      const warmupCount = Math.max(warmupCounts[exercise.exerciseId] ?? 0, recoveredWarmups);
      const warmups = Array.from({ length: warmupCount }, (_, index) => {
        const persisted = persistedWarmups[index];
        return { id: persisted ? `persisted:${persisted.id}` : `warmup:${exercise.exerciseId}:${index + 1}`, exerciseId: exercise.exerciseId, setNumber: index + 1 };
      });
      const planned = Array.from({ length: exercise.targetSets }, (_, index) => ({ id: `planned:${exercise.exerciseId}:${index + 1}`, exerciseId: exercise.exerciseId, setNumber: warmupCount + index + 1 }));
      const extras = extraRows.filter((row) => row.exerciseId === exercise.exerciseId).map((row, index) => ({ ...row, setNumber: warmupCount + exercise.targetSets + index + 1 }));
      return [...warmups, ...planned, ...extras];
    });
  }, [draft, extraRows, persistedSets, warmupCounts]);
  const completedSets = completedRetrospective?.sets.length ?? persistedSets.length;
  const prCount = completedRetrospective?.sets.filter((set) => set.is_pr).length ?? persistedSets.filter((set) => set.is_pr).length;
  const completedPainCount = completedRetrospective?.painFlags.length ?? painFlags.length;
  const elapsedMs = elapsedActiveMs(state.clock, now);
  const durationMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  // The live surface already explains `loading` (skeleton), `failed` and
  // `recovery` (alerts with retry) next to Finish; only `pending` needs its own
  // line there. The finish dialog explains every reason.
  const blockedReason: FinishBlockedReason | null = recoveryError
    ? 'recovery'
    : !recoveryLoaded
      ? 'loading'
      : pendingMutations > 0
        ? 'pending'
        : failedMutations.size > 0
          ? 'failed'
          : null;
  const mutationBlocked = blockedReason !== null;
  const finishOpen = finishRequested || state.stage === 'finishing';

  const firstIncompleteIndex = useMemo(() => {
    if (!draft || draft.kind !== 'strength') return 0;
    const firstIncomplete = draft.exercises.findIndex((exercise) => (
      persistedSets.filter((set) => set.exercise_id === exercise.exerciseId && !set.is_warmup).length < exercise.targetSets
    ));
    return firstIncomplete;
  }, [draft, persistedSets]);

  const selectedExerciseIndex = draft?.kind === 'strength' && selectedExerciseId
    ? draft.exercises.findIndex((exercise) => exercise.exerciseId === selectedExerciseId)
    : -1;
  const activeExerciseIndex = selectedExerciseIndex >= 0 ? selectedExerciseIndex : firstIncompleteIndex;

  if (!draft || !sessionId || (state.stage !== 'live' && state.stage !== 'paused' && state.stage !== 'finishing' && state.stage !== 'completed')) {
    return <main className="mx-auto max-w-2xl px-4 py-8"><p className="text-[var(--content-secondary)]">{t('workout.no_live_session')}</p></main>;
  }

  if (state.stage === 'completed' && !completedRetrospective && !recoveryLoaded) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        {recoveryError ? (
          <div role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
            <p>{t('workout.recovery_failed')}</p>
            <button type="button" onClick={() => { setRecoveryError(false); setRecoveryAttempt((current) => current + 1); }} className="mt-2 min-h-11 underline">{t('workout.retry_recovery')}</button>
          </div>
        ) : <div role="status" className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" aria-label={t('workout.loading_live_session')} />}
      </main>
    );
  }

  if (state.stage === 'completed') {
    return (
      <main aria-labelledby="workout-completed-title" className="mx-auto max-w-2xl px-4 py-8">
        <section className="rounded-2xl border border-[var(--status-success-border)] bg-[var(--surface-raised)] p-5 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto text-[var(--status-success-fg)]" size={36} strokeWidth={1.8} />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--status-success-fg)]">{t('workout.completed_saved')}</p>
          <h2 id="workout-completed-title" className="mt-1 text-2xl font-bold text-[var(--content-primary)]">{t('workout.completed_title')}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--content-secondary)]">{t('workout.completed_message')}</p>
          {liveReconciliation?.outcome === 'completed' ? <p role="status" className="mt-3 rounded-xl border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-2 text-sm leading-6 text-[var(--content-primary)]">{t('workout.completed_elsewhere')}</p> : null}
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--workout-rail)] bg-[var(--workout-rail)] text-left text-sm">
            <div className="bg-[var(--surface-subtle)] p-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_duration')}</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-[var(--content-primary)]">{durationMinutes} {t('workout.min')}</dd></div>
            <div className="bg-[var(--surface-subtle)] p-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_sets')}</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-[var(--content-primary)]">{completedSets}</dd></div>
            <div className="bg-[var(--surface-subtle)] p-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_pain')}</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-[var(--content-primary)]">{completedPainCount}</dd></div>
            <div className="bg-[var(--surface-subtle)] p-3"><dt className="text-[var(--content-muted)]">{t('workout.completed_prs')}</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-[var(--content-primary)]">{prCount}</dd></div>
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href="/dashboard/workout/history" onClick={resetWorkoutScroll} className="btn-ghost inline-flex min-h-11 items-center justify-center rounded-xl px-4">{t('workout.history')}</Link>
            <button type="button" onClick={workspace.acknowledgeCompleted} className="btn-gold min-h-11 rounded-xl px-4">{t('workout.completed_done')}</button>
          </div>
        </section>
      </main>
    );
  }

  const requestFinish = (values?: CardioLogValues) => {
    if (mutationBlocked) return;
    if (values) setCardioValues(values);
    setFinishRequested(true);
    setFinishError(false);
    workspace.requestFinish();
  };

  const cancelFinish = () => {
    if (savingFinish) return;
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
      ...(draft.kind === 'cardio' && currentCardio ? {
        cardio: { activity: draft.activity, distanceKm: currentCardio.distanceKm, effort: currentCardio.effort },
      } : {}),
    }, () => {
      setRestClock((current) => ({ ...current, entries: {} }));
      workspace.completeFinish();
      resetWorkoutScroll();
    });
    setSavingFinish(false);
    if (!result.ok) setFinishError(true);
  };

  const discardEmpty = async () => {
    if (savingFinish || mutationBlocked) return;
    setSavingFinish(true);
    setFinishError(false);
    const deleted = await workspace.discardLive();
    if (deleted) setRestClock((current) => ({ ...current, entries: {} }));
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
        {blockedReason === 'pending' && !finishOpen ? <p role="status" className="text-center text-xs leading-5 text-[var(--content-secondary)]">{t('workout.finish_blocked_pending')}</p> : null}
        {(finishRequested || state.stage === 'finishing') ? (
          <FinishWorkoutDialog
            summary={{ durationMinutes: liveCardioValues.durationMinutes, completedSets: 0, pendingSets: 0, painNotes: painFlags.length, prs: 0 }}
            isEmpty={cardioIsEmpty}
            saving={savingFinish}
            blocked={mutationBlocked}
            blockedReason={blockedReason}
            onRetry={retryRecovery}
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
    setExtraRows((current) => [...current, { id: `extra:${exerciseId}:${extraSequence.current++}`, exerciseId }]);
  };

  const supersetGroup = (exerciseId: string): number | null => {
    const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
    return supersetGroupFor(draft.exercises, index);
  };

  const structureFor = (draftExercises: typeof draft.exercises) => draftExercises.map((exercise, index) => ({
    exerciseId: exercise.exerciseId,
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    supersetGroup: supersetGroupFor(draftExercises, index),
  }));

  const toggleSuperset = async (exerciseId: string) => {
    if (structureVersion === null) return;
    const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
    if (index < 0 || index >= draft.exercises.length - 1) return;
    const nextExercises = draft.exercises.map((exercise, exerciseIndex) => exerciseIndex === index
      ? { ...exercise, linkedBelow: !exercise.linkedBelow }
      : { ...exercise, linkedBelow: Boolean(exercise.linkedBelow) });
    const structure = structureFor(nextExercises);
    const saved = await runMutation(
      `superset:${exerciseId}`,
      () => updateLiveStructure(sessionId, structure, structureVersion),
      (candidate) => candidate.ok,
    );
    if (!saved?.ok) return;
    setStructureVersion(saved.version);
    const groupByExercise = new Map(structure.map((exercise) => [exercise.exerciseId, exercise.supersetGroup]));
    setPersistedSets((current) => current.map((set) => ({ ...set, superset_group: groupByExercise.get(set.exercise_id) ?? null })));
    workspace.commitLiveStrengthStructure(nextExercises);
  };

  const removeExercise = async (exerciseId: string) => {
    if (structureVersion === null) return;
    const nextExercises = removeAndNormalizeLiveExercises(draft.exercises, exerciseId);
    const saved = await runMutation(
      `remove:${exerciseId}`,
      () => updateLiveStructure(sessionId, structureFor(nextExercises), structureVersion, exerciseId),
      (candidate) => candidate.ok,
    );
    if (!saved?.ok) return;
    setRestClock((current) => ({
      ...current,
      entries: Object.fromEntries(Object.entries(current.entries).filter(([setId]) => !persistedSets.some((set) => set.id === setId && set.exercise_id === exerciseId))),
    }));
    setStructureVersion(saved.version);
    setPersistedSets((current) => current.filter((set) => set.exercise_id !== exerciseId));
    setExtraRows((current) => current.filter((row) => row.exerciseId !== exerciseId));
    workspace.commitLiveStrengthStructure(nextExercises);
  };

  const allExercisesComplete = firstIncompleteIndex === -1;
  const activeDraftExercise = allExercisesComplete && selectedExerciseIndex < 0 ? null : draft.exercises[activeExerciseIndex] ?? null;
  const activeExercise = activeDraftExercise ? exerciseById.get(activeDraftExercise.exerciseId) : undefined;
  const activeResolved = activeExercise ?? (activeDraftExercise ? {
    id: activeDraftExercise.exerciseId,
    name: activeDraftExercise.exerciseName ?? activeDraftExercise.exerciseId,
    is_compound: false,
    equipment: null,
    muscle_group: 'full_body',
  } : null);
  const activeRows = activeDraftExercise ? rows.filter((row) => row.exerciseId === activeDraftExercise.exerciseId) : [];
  const latestActiveSet = activeDraftExercise
    ? persistedSets.filter((set) => set.exercise_id === activeDraftExercise.exerciseId && !set.is_warmup)
      .sort((left, right) => Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? ''))[0]
    : undefined;
  const previousEvidence = latestActiveSet
    ? `${latestActiveSet.weight_kg === null ? '—' : `${kgToDisplay(latestActiveSet.weight_kg, unit)} ${unit}`} × ${latestActiveSet.reps}`
    : t('workout.previous_values');
  const elapsedText = `${Math.floor(elapsedMs / 60_000)}:${String(Math.floor(elapsedMs / 1_000) % 60).padStart(2, '0')}`;
  return (
    <main className="live-workout mx-auto max-w-2xl space-y-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5">
      {!activeDraftExercise ? <section className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <h2 className="font-bold text-[var(--content-primary)]">{draft.name}</h2>
          <p className="font-mono text-sm tabular-nums text-[var(--content-secondary)]" aria-label={t('workout.active_duration')}>{elapsedText}</p>
        </div>
      </section> : null}
      {!activeDraftExercise ? <LiveSessionPath
        exercises={draft.exercises.map((exercise) => ({ id: exercise.exerciseId, name: displayNameFor(exercise.exerciseId, exercise.exerciseName) }))}
        selectedId={null}
        completedIds={new Set(draft.exercises.filter((exercise) => persistedSets.filter((set) => set.exercise_id === exercise.exerciseId && !set.is_warmup).length >= exercise.targetSets).map((exercise) => exercise.exerciseId))}
        onSelect={setSelectedExerciseId}
      /> : null}

      {!recoveryLoaded ? <div role="status" className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" aria-label={t('workout.loading_live_session')} /> : allExercisesComplete && !activeDraftExercise ? (
        <section aria-labelledby="finish-ready-title" className="border-y border-[var(--border-subtle)] py-5">
          <h1 id="finish-ready-title" className="text-2xl font-bold tracking-[-0.02em] text-[var(--content-primary)]">{t('workout.finish_ready_title')}</h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">{t('workout.finish_ready_message')}</p>
        </section>
      ) : !activeDraftExercise || !activeResolved ? <div role="status" className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" aria-label={t('workout.loading_live_session')} /> : (
        <LiveExerciseStage
          exercise={activeResolved}
          displayName={displayNameFor(activeResolved.id, activeResolved.name)}
          position={activeExerciseIndex + 1}
          total={draft.exercises.length}
          targetSets={activeDraftExercise.targetSets}
          targetReps={activeDraftExercise.targetReps}
          previous={previousEvidence}
          nextExerciseName={draft.exercises[activeExerciseIndex + 1] ? displayNameFor(draft.exercises[activeExerciseIndex + 1].exerciseId, draft.exercises[activeExerciseIndex + 1].exerciseName) : undefined}
          sessionName={draft.name}
          elapsedText={elapsedText}
          sessionPath={<LiveSessionPath
            exercises={draft.exercises.map((exercise) => ({ id: exercise.exerciseId, name: displayNameFor(exercise.exerciseId, exercise.exerciseName) }))}
            selectedId={activeDraftExercise.exerciseId}
            completedIds={new Set(draft.exercises.filter((exercise) => persistedSets.filter((set) => set.exercise_id === exercise.exerciseId && !set.is_warmup).length >= exercise.targetSets).map((exercise) => exercise.exerciseId))}
            onSelect={setSelectedExerciseId}
          />}
          paused={state.stage === 'paused'}
          onPause={workspace.pause}
          onResume={workspace.resume}
        >
        <div className="space-y-3">
        {activeRows.map((row, rowIndex) => {
          const exercise = exerciseById.get(row.exerciseId);
          const draftExercise = draft.exercises.find((candidate) => candidate.exerciseId === row.exerciseId);
          const resolved = exercise ?? {
            id: row.exerciseId,
            name: draftExercise?.exerciseName ?? row.exerciseId,
            is_compound: false,
            equipment: null,
          };
          const persisted = persistedSets.find((set) => set.exercise_id === row.exerciseId && set.set_number === row.setNumber);
          const pendingInput = pendingSetInputs[`${row.exerciseId}:${row.setNumber}`];
          const setKey = `set:${row.exerciseId}:${row.setNumber}`;
          const isUnsaved = unsavedSetKeys.has(setKey);
          const showExerciseHeader = rowIndex === 0;
          const isLastSet = rowIndex === activeRows.length - 1;
          return (
            <div key={row.id}>
            <ExerciseSetLogger
              exercise={{ id: resolved.id, name: displayNameFor(resolved.id, resolved.name), isCompound: resolved.is_compound, equipment: resolved.equipment }}
              setNumber={row.setNumber}
              unit={unit}
              grouped
              focusMode
              paused={state.stage === 'paused'}
              showExerciseHeader={showExerciseHeader}
              isLastSet={isLastSet}
              initialSetId={persisted?.id}
              initialCompletedAt={persisted?.created_at ?? null}
              restSnapshot={persisted && restClock.sessionId === sessionId ? restClock.entries[persisted.id] : undefined}
              onRestSnapshotChange={handleRestSnapshotChange}
              disabled={mutationBlocked}
              initialValue={persisted
                ? { weight: persisted.weight_kg === null ? null : kgToDisplay(persisted.weight_kg, unit), reps: persisted.reps, rpe: persisted.rpe, isWarmup: persisted.is_warmup }
                : pendingInput
                  ? { weight: pendingInput.weightKg === null ? null : kgToDisplay(pendingInput.weightKg, unit), reps: pendingInput.reps, rpe: pendingInput.rpe, isWarmup: pendingInput.isWarmup }
                  : undefined}
              restTargetSeconds={getRestTarget(resolved.id, resolved.is_compound)}
              onComplete={async (value: SetLoggerValue) => {
                const weightKg = value.weight === null ? null : displayToKg(value.weight, unit);
                const isPr = Boolean(resolved.is_compound) && !value.isWarmup && weightKg !== null && weightKg > (prMap[row.exerciseId] ?? 0);
                const input: CompleteLiveSetInput = {
                  sessionId, exerciseId: row.exerciseId, setNumber: row.setNumber, weightKg,
                  reps: value.reps, rpe: value.rpe, isWarmup: value.isWarmup, isPr,
                  supersetGroup: supersetGroup(row.exerciseId),
                };
                const queued = persistPendingLiveSet(input);
                if (queued) setPendingSetInputs((current) => ({ ...current, [`${row.exerciseId}:${row.setNumber}`]: input }));
                const result = await saveLiveSet(setKey, input, queued);
                if (!result?.ok) return null;
                const finishesEveryExercise = draft.exercises.every((exercise) => {
                  const completed = persistedSets.filter((set) => set.exercise_id === exercise.exerciseId && !set.is_warmup).length;
                  return completed + (exercise.exerciseId === row.exerciseId && !value.isWarmup ? 1 : 0) >= exercise.targetSets;
                });
                removePendingLiveSet(input);
                setUnsavedSetKeys((current) => {
                  const next = new Set(current);
                  next.delete(setKey);
                  return next;
                });
                setPendingSetInputs((current) => {
                  const next = { ...current };
                  delete next[`${row.exerciseId}:${row.setNumber}`];
                  return next;
                });
                setPersistedSets((current) => [...current.filter((set) => !(set.exercise_id === row.exerciseId && set.set_number === row.setNumber)), {
                  id: result.setId, session_id: sessionId, exercise_id: row.exerciseId, set_number: row.setNumber,
                  weight_kg: weightKg, reps: value.reps, rpe: value.rpe, is_warmup: value.isWarmup,
                  is_pr: isPr, superset_group: supersetGroup(row.exerciseId), notes: null, created_at: new Date().toISOString(),
                }]);
                // Keep the just-completed stage available for its rest timer and
                // corrections; only the actual terminal completion returns to
                // the truthful finish-ready screen.
                setSelectedExerciseId(finishesEveryExercise ? null : row.exerciseId);
                if (isPr && weightKg !== null) setPrMap((current) => ({ ...current, [row.exerciseId]: weightKg }));
                return result.setId;
              }}
              onUndo={async (setId) => {
                const removed = await runMutation(`set:${row.exerciseId}:${row.setNumber}`, () => uncompleteLiveSet(sessionId, setId), Boolean);
                if (removed) setPersistedSets((current) => current.filter((set) => set.id !== setId));
                return Boolean(removed);
              }}
              onTechnique={() => exercise && setInfoExercise(exercise)}
              onPain={() => setPainExerciseId(row.exerciseId)}
              onPlateCalculator={(displayWeight) => displayWeight !== null && setPlateContext({ exerciseId: row.exerciseId, weightKg: displayToKg(displayWeight, unit) })}
              onSuperset={() => void toggleSuperset(row.exerciseId)}
              onRemove={() => setRemoveCandidate({
                exerciseId: row.exerciseId,
                name: displayNameFor(resolved.id, resolved.name),
                savedSetCount: persistedSets.filter((set) => set.exercise_id === row.exerciseId).length,
              })}
            />
            {isUnsaved ? <p role="status" className="mt-1 text-xs text-[var(--status-warning-fg)]">{t('workout.set_not_saved')}</p> : null}
            {isLastSet ? (
              <button type="button" disabled={mutationBlocked} onClick={() => addSet(row.exerciseId)} className="btn-ghost -mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-50"><Plus size={17} aria-hidden="true" />{t('workout.add_set')}</button>
            ) : null}
            </div>
          );
        })}
        </div>
        </LiveExerciseStage>
      )}

      {recoveryError ? (
        <div role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
          <p>{t('workout.recovery_failed')}</p>
          <button type="button" onClick={() => { setRecoveryLoaded(false); setRecoveryError(false); setRecoveryAttempt((current) => current + 1); }} className="mt-2 min-h-11 underline">{t('workout.retry_recovery')}</button>
        </div>
      ) : null}
      {failedMutations.size > 0 ? (
        <div role="alert" className="rounded-xl bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
          <p>{t('workout.mutation_failed')}</p>
          <button type="button" onClick={retryRecovery} className="mt-2 min-h-11 underline">{t('workout.retry_recovery')}</button>
        </div>
      ) : null}

      <button type="button" onClick={() => requestFinish()} disabled={savingFinish || mutationBlocked} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] font-semibold text-[var(--status-danger-fg)] disabled:opacity-50"><Square size={17} aria-hidden="true" />{t('workout.finish')}</button>
      {blockedReason === 'pending' && !finishOpen ? <p role="status" className="text-center text-xs leading-5 text-[var(--content-secondary)]">{t('workout.finish_blocked_pending')}</p> : null}

      {finishOpen ? (
        <FinishWorkoutDialog
          summary={{ durationMinutes, completedSets, pendingSets: Math.max(0, rows.length - completedSets), painNotes: painFlags.length, prs: prCount }}
          isEmpty={completedSets === 0}
          saving={savingFinish}
          blocked={mutationBlocked}
          blockedReason={blockedReason}
          onRetry={retryRecovery}
          error={finishError}
          onKeepTraining={cancelFinish}
          onSaveAndFinish={() => void saveAndFinish()}
          onDiscardEmpty={() => void discardEmpty()}
        />
      ) : null}

      <ConfirmSheet
        open={Boolean(removeCandidate)}
        danger
        title={removeCandidate ? t('workout.remove_named', { name: removeCandidate.name }) : ''}
        message={removeCandidate ? t('workout.finish_completed_sets', { n: removeCandidate.savedSetCount }) : undefined}
        cancelLabel={t('workout.cancel')}
        confirmLabel={t('workout.remove_exercise')}
        onCancel={() => setRemoveCandidate(null)}
        onConfirm={async () => {
          if (!removeCandidate) return;
          const exerciseId = removeCandidate.exerciseId;
          await removeExercise(exerciseId);
          setRemoveCandidate(null);
        }}
      />

      {painExerciseId ? <PainFlagModal exerciseId={painExerciseId} exerciseName={displayNameFor(painExerciseId, draft.exercises.find((exercise) => exercise.exerciseId === painExerciseId)?.exerciseName ?? t('painflag.current_exercise'))} suggestedBodyPart={exerciseById.get(painExerciseId)?.muscle_group ?? ''} onSave={async (flag, mutationId) => {
        const saved = await runMutation('pain', () => appendLivePainFlag(sessionId, mutationId, flag), (candidate) => candidate.ok);
        if (!saved?.ok) return false;
        setPainFlags(saved.flags);
        return true;
      }} onHighSeveritySaved={() => {
        if (state.stage === 'live') workspace.pause();
      }} onClose={() => setPainExerciseId(null)} /> : null}
      {infoExercise ? <ExerciseInfoSheet exercise={infoExercise} userId={userId} playbackDisabled={state.stage === 'paused'} onClose={() => setInfoExercise(null)} /> : null}
      {plateContext ? <PlateCalculator weightKg={plateContext.weightKg} unit={unit} exerciseContext={{ exerciseId: plateContext.exerciseId, mode: 'live' }} onAddWarmupSets={async (sets) => {
        if (persistedSets.some((set) => set.exercise_id === plateContext.exerciseId && !set.is_warmup)) return false;
        const fingerprint = sets.map((set) => `${set.weight}:${set.reps}`).join(',');
        const pending = warmupNumbersRef.current.get(plateContext.exerciseId);
        if (pending && pending.fingerprint !== fingerprint) return false;
        const existing = warmupCounts[plateContext.exerciseId] ?? persistedSets.filter((set) => set.exercise_id === plateContext.exerciseId && set.is_warmup).length;
        const numbers = pending?.numbers ?? sets.map((_, index) => existing + index + 1);
        if (!pending) setWarmupCounts((current) => ({ ...current, [plateContext.exerciseId]: existing + sets.length }));
        warmupNumbersRef.current.set(plateContext.exerciseId, { fingerprint, numbers });
        const saved: PersistedWorkoutSet[] = [];
        for (let index = 0; index < sets.length; index += 1) {
          const set = sets[index]; const setNumber = numbers[index];
          const input: CompleteLiveSetInput = { sessionId, exerciseId: plateContext.exerciseId, setNumber, weightKg: displayToKg(set.weight, unit), reps: set.reps, rpe: null, isWarmup: true, isPr: false, supersetGroup: supersetGroup(plateContext.exerciseId) };
          const queued = persistPendingLiveSet(input);
          const result = await saveLiveSet(`set:${plateContext.exerciseId}:${setNumber}`, input, queued);
          if (!result?.ok) return false;
          removePendingLiveSet(input);
          saved.push({ id: result.setId, session_id: sessionId, exercise_id: plateContext.exerciseId, set_number: setNumber, weight_kg: displayToKg(set.weight, unit), reps: set.reps, rpe: null, is_warmup: true, is_pr: false, superset_group: supersetGroup(plateContext.exerciseId), notes: null, created_at: new Date().toISOString() });
        }
        setPersistedSets((current) => [...current.filter((item) => !saved.some((set) => set.exercise_id === item.exercise_id && set.set_number === item.set_number)), ...saved]);
        warmupNumbersRef.current.delete(plateContext.exerciseId);
        return true;
      }} onClose={() => setPlateContext(null)} /> : null}
    </main>
  );
}
