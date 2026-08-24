'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
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
      <Link href={WORKOUT_ROUTES.exercises} className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--content-secondary)]">← {t('workout.back_exercises')}</Link>
      <ExerciseDetail
        exercise={exercise}
        userId={userId}
        isAdded={added}
        onAdd={acceptsExercises ? () => {
            workspace.addDraftExercise(exercise.id);
            router.push(WORKOUT_ROUTES.build);
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

export default function ExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const [exercise, setExercise] = useState<Exercise | null | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    void (async () => {
      const [{ data: { user } }, result] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('exercises').select('*').eq('id', id).maybeSingle(),
      ]);
      if (!active) return;
      setUserId(user?.id ?? null);
      setExercise(result.error ? null : (result.data as Exercise | null));
    })();
    return () => { active = false; };
  }, [params.id]);

  if (exercise === undefined) return <main role="status" className="mx-auto max-w-3xl px-4 py-10 text-sm text-[var(--content-muted)]">{t('chat.loading')}</main>;
  if (exercise === null) return <main role="alert" className="mx-auto max-w-3xl px-4 py-10 text-sm text-[var(--status-danger-fg)]">{t('workout.exercise_not_found')}</main>;
  return <RoutedExerciseDetail exercise={exercise} userId={userId} />;
}
