'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExercisePicker from '@/components/workout/ExercisePicker';
import { ExerciseRouteGate } from '@/components/workout/ExerciseRouteGate';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/lib/types';
import { WORKOUT_ROUTES, workoutRouteForStage } from '@/lib/workout/workspace-routes';

export function ExerciseBrowser({ initialExercises = [], initialRecentIds = [] }: { initialExercises?: Exercise[]; initialRecentIds?: string[] }) {
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const { lang, t } = useI18n();
  const [exercises, setExercises] = useState(initialExercises);
  const acceptsExercises = (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && workspace.state.draft?.kind === 'strength';

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
      onClose={() => router.push(WORKOUT_ROUTES.build)}
      onAddToDraft={workspace.addDraftExercise}
      onReturnToBuild={() => router.push(WORKOUT_ROUTES.build)}
      onCustomCreated={(exercise) => setExercises((current) => [...current, exercise])}
      onInfo={(exercise) => router.push(`${WORKOUT_ROUTES.exercises}/${encodeURIComponent(exercise.id)}`)}
    />
  );
}

export default function ExerciseBrowserPage() {
  const { t } = useI18n();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      const exerciseResult = await supabase.from('exercises').select('*').order('muscle_group').order('name');
      if (!active) return;
      if (exerciseResult.error) {
        setLoadError(true);
        setExercises([]);
        return;
      }
      setExercises((exerciseResult.data as Exercise[] | null) ?? []);
      if (!user) return;

      // RLS remains active; the joined filter limits recents to the signed-in user's sessions.
      const recentResult = await supabase
        .from('workout_sets')
        .select('exercise_id, workout_sessions!inner(user_id)')
        .eq('workout_sessions.user_id', user.id)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })
        .limit(80);
      if (!active || recentResult.error) return;
      const ids = ((recentResult.data as { exercise_id: string }[] | null) ?? []).map((row) => row.exercise_id).filter(Boolean);
      setRecentIds([...new Set(ids)]);
    })();
    return () => { active = false; };
  }, []);

  if (exercises === null) return <main role="status" className="mx-auto max-w-3xl px-4 py-10 text-sm text-[var(--content-muted)]">{t('chat.loading')}</main>;
  if (loadError) return <main role="alert" className="mx-auto max-w-3xl px-4 py-10 text-sm text-[var(--status-danger-fg)]">{t('workout.program_load_failed')}</main>;
  return <ExerciseBrowser initialExercises={exercises} initialRecentIds={recentIds} />;
}
