'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ExercisePicker from '@/components/workout/ExercisePicker';
import { ExerciseRouteGate } from '@/components/workout/ExerciseRouteGate';
import { exerciseDisplayName } from '@/components/workout/muscle-groups';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { workoutAtlasFilter } from '@/lib/anatomy/workout-navigation';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { pushWorkoutRoute, WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

export function ExerciseBrowser({ initialExercises = [], initialRecentIds = [], replaceExerciseId, returnRoute, atlasGroup }: { initialExercises?: Exercise[]; initialRecentIds?: string[]; replaceExerciseId?: string; returnRoute?: 'build' | 'review'; atlasGroup?: string | null }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { lang, t } = useI18n();
  const [exercises, setExercises] = useState(initialExercises);
  const startLocked = Boolean(workspace.state.startRequest);
  const retrospectiveLocked = Boolean(workspace.state.retrospectiveRequest);
  const acceptsExercises = workspace.state.stage === 'draft'
    && workspace.state.draft?.kind === 'strength'
    && !startLocked
    && !retrospectiveLocked;
  const parentRoute = returnRoute === 'review' || (!returnRoute && workspace.state.stage === 'review') ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build;
  const replacedExercise = replaceExerciseId ? exercises.find((exercise) => exercise.id === replaceExerciseId) : undefined;
  // Localized when the catalogue row is loaded; the draft stores the canonical English name.
  const replacementName = replaceExerciseId && workspace.state.draft?.kind === 'strength'
    ? (replacedExercise ? exerciseDisplayName(replacedExercise, lang) : undefined)
      ?? workspace.state.draft.exercises.find((item) => item.exerciseId === replaceExerciseId)?.exerciseName
      ?? replaceExerciseId
    : undefined;

  if (!acceptsExercises) {
    if (startLocked || retrospectiveLocked) {
      return (
        <ExerciseRouteGate
          actionLabel={t(retrospectiveLocked ? 'workout.retry_same_save' : 'workout.retry_same_start')}
          message={t(retrospectiveLocked ? 'workout.retrospective_request_locked' : 'workout.start_request_locked')}
          onAction={() => {
            if (retrospectiveLocked) {
              void workspace.retryRetrospective().then((ok) => router.push(ok ? WORKOUT_ROUTES.live : WORKOUT_ROUTES.review));
              return;
            }
            router.push(WORKOUT_ROUTES.review);
          }}
        />
      );
    }
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
      initialAtlasFilter={workoutAtlasFilter(atlasGroup)}
      presentation="page"
      exercises={exercises}
      recentIds={initialRecentIds}
      lang={lang}
      onSelect={() => undefined}
      onClose={() => pushWorkoutRoute(router, parentRoute)}
      onAddToDraft={(exerciseId) => {
        if (!replaceExerciseId) { workspace.addDraftExercise(exerciseId); return; }
        const replacement = exercises.find((exercise) => exercise.id === exerciseId);
        if (!replacement) return;
        workspace.replaceDraftExercise(replaceExerciseId, { exerciseId, exerciseName: replacement.name, muscleGroup: replacement.muscle_group });
      }}
      onReturnToBuild={() => {
        if (!replaceExerciseId) {
          if (workspace.state.stage === 'review') workspace.returnToDraft();
          pushWorkoutRoute(router, WORKOUT_ROUTES.build);
          return;
        }
        pushWorkoutRoute(router, parentRoute);
      }}
      addedExerciseIds={workspace.state.draft?.kind === 'strength'
        ? workspace.state.draft.exercises.map(({ exerciseId }) => exerciseId)
        : []}
      onCustomCreated={(exercise) => setExercises((current) => [...current, exercise])}
      replacementExerciseName={replacementName}
      onInfo={(exercise) => router.push(`${WORKOUT_ROUTES.exercises}/${encodeURIComponent(exercise.id)}${replaceExerciseId ? `?replace=${encodeURIComponent(replaceExerciseId)}&return=${returnRoute === 'review' ? 'review' : 'build'}` : returnRoute ? `?return=${returnRoute}` : ''}`)}
    />
  );
}
