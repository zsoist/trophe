'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';
import { RetrospectiveWorkoutLogger } from '@/components/workout/workspace/RetrospectiveWorkoutLogger';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { PlanSaveState, WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { saveWorkoutRoutine } from '@/lib/workout/routine-repository';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

export default function WorkoutReviewPage() {
  const { t } = useI18n();
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const [exercises, setExercises] = useState<WorkoutExerciseOption[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PlanSaveState>('idle');
  const savedRevisionRef = useRef<number | null>(null);
  const [retrospective, setRetrospective] = useState<{ draft: WorkoutDraft; idempotencyKey: string } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.auth.getUser(),
      supabase.from('exercises').select('*').order('name'),
    ]).then(([authResult, exerciseResult]) => {
      if (!active) return;
      setUserId(authResult.data.user?.id ?? null);
      setExercises((exerciseResult.data as WorkoutExerciseOption[] | null) ?? []);
      setLibraryLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!workspace.ready || workspace.state.stage === 'review'
      || (workspace.state.stage === 'draft' && Boolean(workspace.state.startRequest))) return;
    router.replace(workoutRouteForStage(workspace.state.stage));
  }, [router, workspace.ready, workspace.state.stage, workspace.state.startRequest]);

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

  const reviewableStage = workspace.state.stage === 'review'
    || (workspace.state.stage === 'draft' && Boolean(workspace.state.startRequest));
  if (!workspace.ready || !reviewableStage) {
    return <main role="status" aria-label={t('workout.loading_review')} className="mx-auto min-h-24 max-w-2xl animate-pulse rounded-xl bg-[var(--surface-subtle)]" />;
  }

  if (retrospective) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {userId ? (
          <RetrospectiveWorkoutLogger
            userId={userId}
            idempotencyKey={retrospective.idempotencyKey}
            draft={retrospective.draft}
            exercises={exercises as Parameters<typeof RetrospectiveWorkoutLogger>[0]['exercises']}
            onCancel={() => setRetrospective(null)}
            onSaved={() => {
              workspace.discardDraft();
              router.push(WORKOUT_ROUTES.home);
            }}
          />
        ) : <div role="status" aria-label={t('workout.loading')} className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />}
      </main>
    );
  }

  return (
    <>
      <WorkoutReview exercises={exercises} onSavePlan={savePlan} saveState={saveState} saveDisabled={libraryLoading} onLogCompleted={(draft) => {
        const idempotencyKey = workspace.ensureClientRequestId();
        if (idempotencyKey) setRetrospective({ draft, idempotencyKey });
      }} />
    </>
  );
}
