'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { discardEmptyLiveSession, startLiveSession } from '@/lib/workout/live-session';
import {
  createInitialWorkspaceState,
  workoutWorkspaceReducer,
  type DraftExercise,
  type CardioDraft,
  type LiveStartRequestEnvelope,
  type WorkoutDraft,
  type WorkoutKind,
  type WorkoutWorkspaceState,
} from '@/lib/workout/workspace-state';
import {
  clearWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
  type WorkspaceStorage,
} from '@/lib/workout/workspace-storage';
import { normalizeUuid } from '@/lib/workout/uuid';
import { supersetGroupFor } from '@/lib/workout/supersets';
import { localToday } from '@/lib/utils/dates';

export interface WorkoutWorkspaceContextValue {
  ready: boolean;
  state: WorkoutWorkspaceState;
  createDraft(input: { name: string; kind: WorkoutKind; templateKey?: string; templateId?: string | null }): void;
  replaceDraft(input: { name: string; kind: WorkoutKind; templateKey?: string; templateId?: string | null }): void;
  createDraftFromTemplate(input: WorkoutDraftTemplateInput): void;
  replaceDraftFromTemplate(input: WorkoutDraftTemplateInput): void;
  updateDraftName(name: string): void;
  updateCardioDraft(patch: Partial<Pick<CardioDraft, 'activity' | 'durationMinutes' | 'distanceKm' | 'effort'>>): void;
  updateLiveCardioDraft(patch: Partial<Pick<CardioDraft, 'activity' | 'distanceKm' | 'effort'>>): void;
  commitLiveStrengthStructure(exercises: DraftExercise[]): void;
  ensureClientRequestId(): string | null;
  addDraftExercise(exerciseId: string): void;
  removeDraftExercise(exerciseId: string): void;
  updateDraftExercise(exerciseId: string, patch: Partial<Pick<DraftExercise, 'targetSets' | 'targetReps'>>): void;
  reorderDraftExercise(exerciseId: string, direction: 'up' | 'down'): void;
  goToReview(): void;
  returnToDraft(): void;
  startLive(): Promise<boolean>;
  pause(now?: number): void;
  resume(now?: number): void;
  requestFinish(): void;
  cancelFinish(now?: number): void;
  completeFinish(): void;
  discardLive(): Promise<boolean>;
  acknowledgeCompleted(): void;
  discardDraft(): void;
}

export interface WorkoutDraftTemplateInput {
  templateKey: string;
  templateId?: string | null;
  name: string;
  exercises: DraftExercise[];
}

interface WorkoutWorkspaceProviderProps {
  children: ReactNode;
  /** Supplying an id is useful to callers that already resolved authentication. */
  userId?: string | null;
  /** Test seam; production uses browser local storage. */
  storage?: WorkspaceStorage;
}

const WorkoutWorkspaceContext = createContext<WorkoutWorkspaceContextValue | null>(null);

function templateWorkspaceState(input: WorkoutDraftTemplateInput): WorkoutWorkspaceState {
  const created = workoutWorkspaceReducer(createInitialWorkspaceState(), {
    type: 'draft.created',
    payload: {
      name: input.name,
      kind: 'strength',
      templateKey: input.templateKey,
      templateId: normalizeUuid(input.templateId),
      updatedAt: Date.now(),
    },
  });
  if (!created.draft || created.draft.kind !== 'strength') return created;
  return workoutWorkspaceReducer(created, {
    type: 'draft.updated',
    payload: {
      draft: {
        ...created.draft,
        exercises: input.exercises.map((exercise) => ({ ...exercise })),
      },
    },
  });
}

function browserStorage(): WorkspaceStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function draftFingerprint(draft: WorkoutDraft): string {
  return JSON.stringify(draft.kind === 'strength'
    ? {
      version: draft.version,
      kind: draft.kind,
      updatedAt: draft.updatedAt,
      name: draft.name.trim(),
      templateKey: draft.templateKey ?? null,
      templateId: normalizeUuid(draft.templateId),
      exercises: draft.exercises.map((exercise, index) => ({
        exerciseId: exercise.exerciseId,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        supersetGroup: supersetGroupFor(draft.exercises, index),
      })),
    }
    : {
      version: draft.version,
      kind: draft.kind,
      updatedAt: draft.updatedAt,
      name: draft.name.trim(),
      templateKey: draft.templateKey ?? null,
      templateId: normalizeUuid(draft.templateId),
      activity: draft.activity,
      durationMinutes: draft.durationMinutes,
      distanceKm: draft.distanceKm,
      effort: draft.effort,
    });
}

function createLiveStartRequest(draft: WorkoutDraft, idempotencyKey: string): LiveStartRequestEnvelope {
  return {
    idempotencyKey,
    draftFingerprint: draftFingerprint(draft),
    sessionDate: localToday(),
    name: draft.name.trim(),
    templateId: normalizeUuid(draft.templateId),
    kind: draft.kind,
    liveStructure: draft.kind === 'strength'
      ? draft.exercises.map((exercise, index) => ({
        exerciseId: exercise.exerciseId,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        supersetGroup: supersetGroupFor(draft.exercises, index),
      }))
      : [],
  };
}

export function WorkoutWorkspaceProvider({ children, userId, storage }: WorkoutWorkspaceProviderProps) {
  const { t } = useI18n();
  const [state, setState] = useState<WorkoutWorkspaceState>(createInitialWorkspaceState);
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);
  const skipNextPersistRef = useRef(false);
  const resolvedStorage = storage ?? browserStorage();

  useEffect(() => {
    let active = true;

    async function recoverWorkspace() {
      setLoading(true);
      const resolvedUserId = userId !== undefined
        ? userId
        : (await supabase.auth.getUser()).data.user?.id ?? null;
      if (!active) return;

      setOwnerId(resolvedUserId);
      const recovered = resolvedUserId && resolvedStorage
        ? loadWorkspaceState(resolvedStorage, resolvedUserId) ?? createInitialWorkspaceState()
        : createInitialWorkspaceState();
      clientRequestIdRef.current = recovered.clientRequestId;
      setState(recovered);
      setLoading(false);
    }

    void recoverWorkspace();
    return () => { active = false; };
  }, [resolvedStorage, userId]);

  useEffect(() => {
    if (loading || !ownerId || !resolvedStorage) return;
    if (skipNextPersistRef.current) {
      clearWorkspaceState(resolvedStorage, ownerId);
      skipNextPersistRef.current = false;
      return;
    }
    saveWorkspaceState(resolvedStorage, ownerId, state);
  }, [loading, ownerId, resolvedStorage, state]);

  const updateDraft = useCallback((updater: (draft: NonNullable<WorkoutWorkspaceState['draft']>) => NonNullable<WorkoutWorkspaceState['draft']>) => {
    setState((current) => {
      if ((current.stage !== 'draft' && current.stage !== 'review') || !current.draft || current.startRequest) return current;
      return workoutWorkspaceReducer(current, { type: 'draft.updated', payload: { draft: updater(current.draft) } });
    });
  }, []);

  const createDraft = useCallback((input: { name: string; kind: WorkoutKind; templateKey?: string; templateId?: string | null }) => {
    clientRequestIdRef.current = null;
    setState((current) => current.stage === 'home'
      ? workoutWorkspaceReducer(current, { type: 'draft.created', payload: { ...input, templateId: normalizeUuid(input.templateId), updatedAt: Date.now() } })
      : current);
  }, []);

  const createDraftFromTemplate = useCallback((input: WorkoutDraftTemplateInput) => {
    clientRequestIdRef.current = null;
    setState((current) => current.stage === 'home' ? templateWorkspaceState(input) : current);
  }, []);

  const replaceDraft = useCallback((input: { name: string; kind: WorkoutKind; templateKey?: string; templateId?: string | null }) => {
    setState((current) => {
      if ((current.stage !== 'draft' && current.stage !== 'review') || !current.draft || current.startRequest) return current;
      clientRequestIdRef.current = null;
      return workoutWorkspaceReducer(createInitialWorkspaceState(), {
        type: 'draft.created',
        payload: { ...input, templateId: normalizeUuid(input.templateId), updatedAt: Date.now() },
      });
    });
  }, []);

  const replaceDraftFromTemplate = useCallback((input: WorkoutDraftTemplateInput) => {
    setState((current) => {
      if ((current.stage !== 'draft' && current.stage !== 'review') || !current.draft || current.startRequest) return current;
      clientRequestIdRef.current = null;
      return templateWorkspaceState(input);
    });
  }, []);

  const updateDraftName = useCallback((name: string) => {
    updateDraft((draft) => ({ ...draft, name, updatedAt: Date.now() }));
  }, [updateDraft]);

  const updateCardioDraft = useCallback((patch: Partial<Pick<CardioDraft, 'activity' | 'durationMinutes' | 'distanceKm' | 'effort'>>) => {
    updateDraft((draft) => draft.kind !== 'cardio'
      ? draft
      : { ...draft, ...patch, updatedAt: Date.now() });
  }, [updateDraft]);

  const updateLiveCardioDraft = useCallback((patch: Partial<Pick<CardioDraft, 'activity' | 'distanceKm' | 'effort'>>) => {
    setState((current) => {
      if ((current.stage !== 'live' && current.stage !== 'paused') || current.draft?.kind !== 'cardio') return current;
      return workoutWorkspaceReducer(current, {
        type: 'live.draftUpdated',
        payload: { draft: { ...current.draft, ...patch, updatedAt: Date.now() } },
      });
    });
  }, []);

  const commitLiveStrengthStructure = useCallback((exercises: DraftExercise[]) => {
    setState((current) => {
      if ((current.stage !== 'live' && current.stage !== 'paused') || current.draft?.kind !== 'strength') return current;
      return workoutWorkspaceReducer(current, {
        type: 'live.draftUpdated',
        payload: { draft: { ...current.draft, exercises: exercises.map((exercise) => ({ ...exercise })), updatedAt: Date.now() } },
      });
    });
  }, []);

  const addDraftExercise = useCallback((exerciseId: string) => {
    updateDraft((draft) => {
      if (draft.kind !== 'strength' || draft.exercises.some((exercise) => exercise.exerciseId === exerciseId)) return draft;
      return {
        ...draft,
        updatedAt: Date.now(),
        exercises: [...draft.exercises, { exerciseId, targetSets: 3, targetReps: '8-12' }],
      };
    });
  }, [updateDraft]);

  const removeDraftExercise = useCallback((exerciseId: string) => {
    updateDraft((draft) => draft.kind !== 'strength'
      ? draft
      : { ...draft, updatedAt: Date.now(), exercises: draft.exercises.filter((exercise) => exercise.exerciseId !== exerciseId) });
  }, [updateDraft]);

  const updateDraftExercise = useCallback((exerciseId: string, patch: Partial<Pick<DraftExercise, 'targetSets' | 'targetReps'>>) => {
    if (patch.targetReps !== undefined && !patch.targetReps.trim()) return;
    if (patch.targetSets !== undefined && (!Number.isInteger(patch.targetSets) || patch.targetSets <= 0)) return;
    updateDraft((draft) => draft.kind !== 'strength'
      ? draft
      : {
        ...draft,
        updatedAt: Date.now(),
        exercises: draft.exercises.map((exercise) => exercise.exerciseId === exerciseId ? { ...exercise, ...patch } : exercise),
      });
  }, [updateDraft]);

  const reorderDraftExercise = useCallback((exerciseId: string, direction: 'up' | 'down') => {
    updateDraft((draft) => {
      if (draft.kind !== 'strength') return draft;
      const index = draft.exercises.findIndex((exercise) => exercise.exerciseId === exerciseId);
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.exercises.length) return draft;
      const exercises = [...draft.exercises];
      [exercises[index], exercises[nextIndex]] = [exercises[nextIndex], exercises[index]];
      return { ...draft, exercises, updatedAt: Date.now() };
    });
  }, [updateDraft]);

  const goToReview = useCallback(() => {
    setState((current) => current.stage === 'draft' && !current.startRequest
      ? workoutWorkspaceReducer(current, { type: 'draft.reviewed' })
      : current);
  }, []);

  const returnToDraft = useCallback(() => {
    setState((current) => current.stage === 'review' && !current.startRequest
      ? workoutWorkspaceReducer(current, { type: 'draft.reopened' })
      : current);
  }, []);

  const ensureClientRequestId = useCallback((): string | null => {
    if (!ownerId || !state.draft || (state.stage !== 'draft' && state.stage !== 'review')) return state.clientRequestId;
    const existing = clientRequestIdRef.current ?? state.clientRequestId;
    if (existing) return existing;
    const clientRequestId = globalThis.crypto.randomUUID();
    const keyedState = workoutWorkspaceReducer(state, { type: 'request.keyed', payload: { clientRequestId } });
    clientRequestIdRef.current = clientRequestId;
    // This write intentionally precedes the network request. It is the retry key after an ambiguous response.
    if (resolvedStorage) saveWorkspaceState(resolvedStorage, ownerId, keyedState);
    setState((current) => (current.stage === 'draft' || current.stage === 'review') && current.draft
      ? workoutWorkspaceReducer(current, { type: 'request.keyed', payload: { clientRequestId } })
      : current);
    return clientRequestId;
  }, [ownerId, resolvedStorage, state]);

  const ensureLiveStartRequest = useCallback((): LiveStartRequestEnvelope | null => {
    if (!ownerId || !state.draft || (state.stage !== 'draft' && state.stage !== 'review')) return null;
    if (state.startRequest) return state.startRequest;

    const fingerprint = draftFingerprint(state.draft);
    const recovered = resolvedStorage ? loadWorkspaceState(resolvedStorage, ownerId) : null;
    const recoveredRequest = recovered?.startRequest;
    const request = recoveredRequest?.draftFingerprint === fingerprint
      ? recoveredRequest
      : createLiveStartRequest(
        state.draft,
        clientRequestIdRef.current ?? state.clientRequestId ?? globalThis.crypto.randomUUID(),
      );
    const preparedState = workoutWorkspaceReducer(state, { type: 'request.prepared', payload: { startRequest: request } });
    clientRequestIdRef.current = request.idempotencyKey;
    // Persist the immutable envelope before transport so ambiguous responses and stale tabs replay it exactly.
    if (resolvedStorage) saveWorkspaceState(resolvedStorage, ownerId, preparedState);
    setState((current) => (current.stage === 'draft' || current.stage === 'review') && current.draft
      ? workoutWorkspaceReducer(current, { type: 'request.prepared', payload: { startRequest: request } })
      : current);
    return request;
  }, [ownerId, resolvedStorage, state]);

  const startLive = useCallback(async (): Promise<boolean> => {
    if (state.stage === 'live' || state.stage === 'paused' || state.stage === 'finishing' || state.stage === 'completed') {
      return Boolean(state.sessionId);
    }
    if (!ownerId || !state.draft || !state.draft.name.trim() || (state.stage !== 'draft' && state.stage !== 'review')) return false;
    if (state.draft.kind === 'strength' && state.draft.exercises.length === 0) return false;
    if (startPromiseRef.current) return startPromiseRef.current;
    const request = ensureLiveStartRequest();
    if (!request) return false;

    const pending = startLiveSession(request)
      .then((result) => {
        const normalizedSessionId = result.ok ? result.sessionId.trim() : '';
        if (!normalizedSessionId) return false;
        setState((latest) => (latest.stage === 'draft' || latest.stage === 'review') && latest.draft && !latest.sessionId
          ? workoutWorkspaceReducer(latest, { type: 'live.started', payload: { sessionId: normalizedSessionId, now: Date.now() } })
          : latest);
        return true;
      })
      .finally(() => { startPromiseRef.current = null; });
    startPromiseRef.current = pending;
    return pending;
  }, [ensureLiveStartRequest, ownerId, state]);

  const pause = useCallback((now = Date.now()) => {
    setState((current) => current.stage === 'live'
      ? workoutWorkspaceReducer(current, { type: 'live.paused', payload: { now } })
      : current);
  }, []);

  const resume = useCallback((now = Date.now()) => {
    setState((current) => current.stage === 'paused'
      ? workoutWorkspaceReducer(current, { type: 'live.resumed', payload: { now } })
      : current);
  }, []);

  const requestFinish = useCallback(() => {
    setState((current) => current.stage === 'live' || current.stage === 'paused'
      ? workoutWorkspaceReducer(current, { type: 'live.finishing', payload: { now: Date.now() } })
      : current);
  }, []);

  const cancelFinish = useCallback((now = Date.now()) => {
    setState((current) => current.stage === 'finishing'
      ? workoutWorkspaceReducer(current, { type: 'live.finishCancelled', payload: { now } })
      : current);
  }, []);

  const resetWorkspace = useCallback(() => {
    clientRequestIdRef.current = null;
    skipNextPersistRef.current = true;
    setState(createInitialWorkspaceState());
  }, []);

  const completeFinish = useCallback(() => {
    setState((current) => current.stage === 'finishing'
      ? workoutWorkspaceReducer(current, { type: 'live.completed' })
      : current);
  }, []);

  const discardLive = useCallback(async (): Promise<boolean> => {
    const sessionId = state.stage === 'finishing' ? state.sessionId : null;
    if (!sessionId) return false;
    const deleted = await discardEmptyLiveSession(sessionId);
    if (!deleted) return false;
    skipNextPersistRef.current = true;
    setState((current) => current.stage === 'finishing' && current.sessionId === sessionId
      ? workoutWorkspaceReducer(current, { type: 'live.discarded' })
      : current);
    return true;
  }, [state.sessionId, state.stage]);

  const acknowledgeCompleted = useCallback(() => {
    if (state.stage === 'completed') resetWorkspace();
  }, [resetWorkspace, state.stage]);

  const discardDraft = useCallback(() => {
    if ((state.stage === 'draft' || state.stage === 'review') && !state.startRequest) resetWorkspace();
  }, [resetWorkspace, state.stage, state.startRequest]);

  const value = useMemo<WorkoutWorkspaceContextValue>(() => ({
    ready: !loading && ownerId !== undefined,
    state,
    createDraft,
    replaceDraft,
    createDraftFromTemplate,
    replaceDraftFromTemplate,
    updateDraftName,
    updateCardioDraft,
    updateLiveCardioDraft,
    commitLiveStrengthStructure,
    ensureClientRequestId,
    addDraftExercise,
    removeDraftExercise,
    updateDraftExercise,
    reorderDraftExercise,
    goToReview,
    returnToDraft,
    startLive,
    pause,
    resume,
    requestFinish,
    cancelFinish,
    completeFinish,
    discardLive,
    acknowledgeCompleted,
    discardDraft,
  }), [acknowledgeCompleted, addDraftExercise, cancelFinish, commitLiveStrengthStructure, completeFinish, createDraft, createDraftFromTemplate, discardDraft, discardLive, ensureClientRequestId, goToReview, loading, ownerId, pause, removeDraftExercise, reorderDraftExercise, replaceDraft, replaceDraftFromTemplate, requestFinish, resume, returnToDraft, startLive, state, updateCardioDraft, updateDraftExercise, updateDraftName, updateLiveCardioDraft]);

  if (loading || ownerId === undefined) {
    return <div role="status" aria-label={t('workout.loading_workspace')} className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />;
  }

  return <WorkoutWorkspaceContext.Provider value={value}>{children}</WorkoutWorkspaceContext.Provider>;
}

export function useWorkoutWorkspace(): WorkoutWorkspaceContextValue {
  const context = useContext(WorkoutWorkspaceContext);
  if (!context) throw new Error('useWorkoutWorkspace must be used within a WorkoutWorkspaceProvider');
  return context;
}
