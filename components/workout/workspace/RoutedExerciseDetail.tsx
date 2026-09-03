'use client';

import { useRouter } from 'next/navigation';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';
import { exerciseDisplayName } from '@/components/workout/muscle-groups';

export function RoutedExerciseDetail({ exercise, userId, replaceExerciseId, returnRoute }: { exercise: Exercise; userId: string | null; replaceExerciseId?: string; returnRoute?: 'build' | 'review' }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { t, lang } = useI18n();
  const displayName = exerciseDisplayName(exercise, lang);
  const startLocked = Boolean(workspace.state.startRequest);
  const retrospectiveLocked = Boolean(workspace.state.retrospectiveRequest);
  const acceptsExercises = workspace.state.stage === 'draft'
    && workspace.state.draft?.kind === 'strength'
    && !startLocked
    && !retrospectiveLocked;
  const added = workspace.state.draft?.kind === 'strength'
    && workspace.state.draft.exercises.some((item) => item.exerciseId === exercise.id);
  const canCreate = workspace.state.stage === 'home';
  return (
    <main className="exercise-detail-route">
      <ExerciseDetail
        exercise={exercise}
        userId={userId}
        isAdded={added}
        actionLabel={replaceExerciseId ? t('workout.replace_exercise') : undefined}
        actionAriaLabel={replaceExerciseId ? t('workout.replace_with_named', { name: displayName }) : undefined}
        onAdd={acceptsExercises ? () => {
          if (replaceExerciseId) workspace.replaceDraftExercise(replaceExerciseId, { exerciseId: exercise.id, exerciseName: exercise.name, muscleGroup: exercise.muscle_group });
          else workspace.addDraftExercise(exercise.id);
          router.push(returnRoute === 'review' || (!returnRoute && workspace.state.stage === 'review') ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build);
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
