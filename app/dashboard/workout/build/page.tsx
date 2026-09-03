'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutBuilder, type PlanSaveState, type WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { saveWorkoutRoutine } from '@/lib/workout/routine-repository';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

export default function WorkoutBuildPage() {
  const { t } = useI18n();
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const [exercises, setExercises] = useState<WorkoutExerciseOption[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState(false);
  const [saveState, setSaveState] = useState<PlanSaveState>('idle');
  const savedRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!workspace.ready) return;
    if ((workspace.state.startRequest || workspace.state.retrospectiveRequest) && (workspace.state.stage === 'draft' || workspace.state.stage === 'review')) {
      router.replace(WORKOUT_ROUTES.review);
      return;
    }
    if (workspace.state.stage === 'draft' || workspace.state.stage === 'review') return;
    router.replace(workoutRouteForStage(workspace.state.stage));
  }, [router, workspace.ready, workspace.state.retrospectiveRequest, workspace.state.stage, workspace.state.startRequest]);

  useEffect(() => {
    let active = true;
    supabase.from('exercises').select('id, name, name_es, name_el, muscle_group, equipment').order('name').then(({ data, error }) => {
      if (active) {
        setExercises((data as WorkoutExerciseOption[] | null) ?? []);
        setLibraryError(Boolean(error));
        setLibraryLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (saveState !== 'success' || savedRevisionRef.current === null) return;
    if (workspace.state.draft?.updatedAt === savedRevisionRef.current) return;
    savedRevisionRef.current = null;
    setSaveState('idle');
  }, [saveState, workspace.state.draft?.updatedAt]);

  const savePlan = async (draft: WorkoutDraft) => {
    if (saveState === 'pending' || libraryLoading) return;
    savedRevisionRef.current = null;
    setSaveState('pending');
    try {
      const authResult = await supabase.auth.getUser();
      const ownerId = authResult.data.user?.id;
      if (!ownerId) throw new Error('Workout owner is unavailable');
      await saveWorkoutRoutine(supabase, ownerId, draft, exercises);
      savedRevisionRef.current = draft.updatedAt;
      setSaveState('success');
      router.refresh();
    } catch {
      savedRevisionRef.current = null;
      setSaveState('error');
    }
  };

  if (!workspace.ready || workspace.state.startRequest || workspace.state.retrospectiveRequest || (workspace.state.stage !== 'draft' && workspace.state.stage !== 'review')) {
    return <main role="status" aria-label={t('workout.loading_build')} className="mx-auto min-h-24 max-w-2xl animate-pulse rounded-xl bg-[var(--surface-subtle)]" />;
  }

  return <WorkoutBuilder exercises={exercises} onSavePlan={savePlan} saveState={saveState} saveDisabled={libraryLoading} libraryError={libraryError} />;
}
