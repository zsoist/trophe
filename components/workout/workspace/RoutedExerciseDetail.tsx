'use client';

import { useRouter } from 'next/navigation';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

export function RoutedExerciseDetail({ exercise, userId }: { exercise: Exercise; userId: string | null }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { t } = useI18n();
  const startLocked = Boolean(workspace.state.startRequest);
  const retrospectiveLocked = Boolean(workspace.state.retrospectiveRequest);
  const acceptsExercises = (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && workspace.state.draft?.kind === 'strength'
    && !startLocked
    && !retrospectiveLocked;
  const added = acceptsExercises
    && workspace.state.draft?.kind === 'strength'
    && workspace.state.draft.exercises.some((item) => item.exerciseId === exercise.id);
  const canCreate = workspace.state.stage === 'home';
  return (
    <main className="exercise-detail-route">
      <ExerciseDetail
        exercise={exercise}
        userId={userId}
        isAdded={added}
        onAdd={acceptsExercises ? () => {
          workspace.addDraftExercise(exercise.id);
          router.push(workspace.state.stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build);
        } : undefined}
        alternateAction={acceptsExercises ? undefined : {
          label: retrospectiveLocked ? t('workout.retry_same_save') : startLocked ? t('workout.retry_same_start') : canCreate ? t('workout.create_strength_draft') : t('workout.resume_current_workout'),
          message: retrospectiveLocked ? t('workout.retrospective_request_locked') : startLocked ? t('workout.start_request_locked') : undefined,
          onClick: () => {
            if (startLocked || retrospectiveLocked) {
              if (retrospectiveLocked) {
                void workspace.retryRetrospective().then((ok) => router.push(ok ? WORKOUT_ROUTES.live : WORKOUT_ROUTES.review));
              } else {
                router.push(WORKOUT_ROUTES.review);
              }
              return;
            }
            if (canCreate) {
              workspace.createDraft({ name: t('workout.strength'), kind: 'strength' });
              return;
            }
            router.push(workoutRouteForStage(workspace.state.stage));
          },
        }}
      />
    </main>
  );
}
