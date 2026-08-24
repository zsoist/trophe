'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createWorkoutSession } from '@/components/workout/workout-persistence';
import { supabase } from '@/lib/supabase';
import {
  createInitialWorkspaceState,
  workoutWorkspaceReducer,
  type DraftExercise,
  type WorkoutKind,
  type WorkoutWorkspaceState,
} from '@/lib/workout/workspace-state';
import {
  clearWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
  type WorkspaceStorage,
} from '@/lib/workout/workspace-storage';

export interface WorkoutWorkspaceContextValue {
  state: WorkoutWorkspaceState;
  createDraft(input: { name: string; kind: WorkoutKind; templateKey?: string }): void;
  addDraftExercise(exerciseId: string): void;
  removeDraftExercise(exerciseId: string): void;
  updateDraftExercise(exerciseId: string, patch: Partial<Pick<DraftExercise, 'targetSets' | 'targetReps'>>): void;
  goToReview(): void;
  startLive(): Promise<boolean>;
  pause(now?: number): void;
  resume(now?: number): void;
  requestFinish(): void;
  acknowledgeCompleted(): void;
  discardDraft(): void;
}

interface WorkoutWorkspaceProviderProps {
  children: ReactNode;
  /** Supplying an id is useful to callers that already resolved authentication. */
  userId?: string | null;
  /** Test seam; production uses browser local storage. */
  storage?: WorkspaceStorage;
}

const WorkoutWorkspaceContext = createContext<WorkoutWorkspaceContextValue | null>(null);

function browserStorage(): WorkspaceStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function WorkoutWorkspaceProvider({ children, userId, storage }: WorkoutWorkspaceProviderProps) {
  const [state, setState] = useState<WorkoutWorkspaceState>(createInitialWorkspaceState);
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
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
      setState(resolvedUserId && resolvedStorage
        ? loadWorkspaceState(resolvedStorage, resolvedUserId) ?? createInitialWorkspaceState()
        : createInitialWorkspaceState());
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
      if ((current.stage !== 'draft' && current.stage !== 'review') || !current.draft) return current;
      return workoutWorkspaceReducer(current, { type: 'draft.updated', payload: { draft: updater(current.draft) } });
    });
  }, []);

  const createDraft = useCallback((input: { name: string; kind: WorkoutKind; templateKey?: string }) => {
    setState((current) => current.stage === 'home'
      ? workoutWorkspaceReducer(current, { type: 'draft.created', payload: { ...input, updatedAt: Date.now() } })
      : current);
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
    updateDraft((draft) => draft.kind !== 'strength'
      ? draft
      : {
        ...draft,
        updatedAt: Date.now(),
        exercises: draft.exercises.map((exercise) => exercise.exerciseId === exerciseId ? { ...exercise, ...patch } : exercise),
      });
  }, [updateDraft]);

  const goToReview = useCallback(() => {
    setState((current) => current.stage === 'draft'
      ? workoutWorkspaceReducer(current, { type: 'draft.reviewed' })
      : current);
  }, []);

  const startLive = useCallback(async (): Promise<boolean> => {
    if (state.stage === 'live' || state.stage === 'paused' || state.stage === 'finishing' || state.stage === 'completed') {
      return Boolean(state.sessionId);
    }
    if (!ownerId || !state.draft || (state.stage !== 'draft' && state.stage !== 'review')) return false;
    if (startPromiseRef.current) return startPromiseRef.current;

    const pending = createWorkoutSession(ownerId, state.draft.name, state.draft.templateKey ?? null)
      .then((sessionId) => {
        const normalizedSessionId = sessionId?.trim();
        if (!normalizedSessionId) return false;
        setState((latest) => (latest.stage === 'draft' || latest.stage === 'review') && latest.draft && !latest.sessionId
          ? workoutWorkspaceReducer(latest, { type: 'live.started', payload: { sessionId: normalizedSessionId, now: Date.now() } })
          : latest);
        return true;
      })
      .finally(() => { startPromiseRef.current = null; });
    startPromiseRef.current = pending;
    return pending;
  }, [ownerId, state]);

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

  const resetWorkspace = useCallback(() => {
    skipNextPersistRef.current = true;
    setState(createInitialWorkspaceState());
  }, []);

  const acknowledgeCompleted = useCallback(() => {
    if (state.stage === 'completed') resetWorkspace();
  }, [resetWorkspace, state.stage]);

  const discardDraft = useCallback(() => {
    if (state.stage === 'draft' || state.stage === 'review') resetWorkspace();
  }, [resetWorkspace, state.stage]);

  const value = useMemo<WorkoutWorkspaceContextValue>(() => ({
    state,
    createDraft,
    addDraftExercise,
    removeDraftExercise,
    updateDraftExercise,
    goToReview,
    startLive,
    pause,
    resume,
    requestFinish,
    acknowledgeCompleted,
    discardDraft,
  }), [acknowledgeCompleted, addDraftExercise, createDraft, discardDraft, goToReview, pause, removeDraftExercise, requestFinish, resume, startLive, state, updateDraftExercise]);

  if (loading || ownerId === undefined) {
    return <div role="status" aria-label="Loading workout workspace" className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />;
  }

  return <WorkoutWorkspaceContext.Provider value={value}>{children}</WorkoutWorkspaceContext.Provider>;
}

export function useWorkoutWorkspace(): WorkoutWorkspaceContextValue {
  const context = useContext(WorkoutWorkspaceContext);
  if (!context) throw new Error('useWorkoutWorkspace must be used within a WorkoutWorkspaceProvider');
  return context;
}
