'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

export function RoutedExerciseDetail({ exercise, userId }: { exercise: Exercise; userId: string | null }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { t } = useI18n();
  const acceptsExercises = (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && workspace.state.draft?.kind === 'strength';
  const added = acceptsExercises
    && workspace.state.draft?.kind === 'strength'
    && workspace.state.draft.exercises.some((item) => item.exerciseId === exercise.id);
  const canCreate = workspace.state.stage === 'home';
  return (
    <main className="px-4 py-5">
      <Link href={WORKOUT_ROUTES.exercises} className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--content-secondary)]"><ChevronLeft size={18} aria-hidden="true" />{t('workout.back_exercises')}</Link>
      <ExerciseDetail
        exercise={exercise}
        userId={userId}
        isAdded={added}
        onAdd={acceptsExercises ? () => {
          workspace.addDraftExercise(exercise.id);
          router.push(workspace.state.stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build);
        } : undefined}
        alternateAction={acceptsExercises ? undefined : {
          label: canCreate ? t('workout.create_strength_draft') : t('workout.resume_current_workout'),
          onClick: () => {
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
