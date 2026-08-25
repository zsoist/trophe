'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ExercisePicker from '@/components/workout/ExercisePicker';
import { ExerciseRouteGate } from '@/components/workout/ExerciseRouteGate';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { pushWorkoutRoute, WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

export function ExerciseBrowser({ initialExercises = [], initialRecentIds = [] }: { initialExercises?: Exercise[]; initialRecentIds?: string[] }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { lang, t } = useI18n();
  const [exercises, setExercises] = useState(initialExercises);
  const acceptsExercises = (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && workspace.state.draft?.kind === 'strength';
  const parentRoute = workspace.state.stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build;

  if (!acceptsExercises) {
    const canCreate = workspace.state.stage === 'home';
    return (
      <ExerciseRouteGate
        actionLabel={canCreate ? t('workout.create_strength_draft') : t('workout.resume_current_workout')}
        onAction={() => {
          if (canCreate) {
            workspace.createDraft({ name: t('workout.strength'), kind: 'strength' });
            return;
          }
          router.push(workoutRouteForStage(workspace.state.stage));
        }}
      />
    );
  }

  return (
    <ExercisePicker
      presentation="page"
      exercises={exercises}
      recentIds={initialRecentIds}
      lang={lang}
      onSelect={() => undefined}
      onClose={() => pushWorkoutRoute(router, parentRoute)}
      onAddToDraft={workspace.addDraftExercise}
      onReturnToBuild={() => pushWorkoutRoute(router, parentRoute)}
      addedExerciseIds={workspace.state.draft?.kind === 'strength'
        ? workspace.state.draft.exercises.map(({ exerciseId }) => exerciseId)
        : []}
      onCustomCreated={(exercise) => setExercises((current) => [...current, exercise])}
      onInfo={(exercise) => router.push(`${WORKOUT_ROUTES.exercises}/${encodeURIComponent(exercise.id)}`)}
    />
  );
}
