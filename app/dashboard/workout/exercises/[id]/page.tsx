'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, usePathname } from 'next/navigation';
import { RoutedExerciseDetail } from '@/components/workout/workspace/RoutedExerciseDetail';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useCoachScreenSelection } from '@/components/assistant/useCoachScreenSelection';
import type { CoachScreenSelection } from '@/components/assistant/screen-selection';
import type { Exercise } from '@/lib/types';

export default function ExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  return <LoadedExerciseDetail key={routeId} routeId={routeId} />;
}

function LoadedExerciseDetail({ routeId }: { routeId: string }) {
  const searchParams = useSearchParams();
  const path = usePathname();
  const { t } = useI18n();
  const [exercise, setExercise] = useState<Exercise | null | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const id = routeId;
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
  }, [routeId]);

  const selection = useMemo<CoachScreenSelection | null>(() =>
    exercise && exercise.id === routeId && userId ? { path, actorId: userId, label: exercise.name, entity: { kind: 'exercise', id: exercise.id } } : null,
  [exercise, routeId, userId, path]);
  useCoachScreenSelection(selection);

  if (exercise === undefined || exercise && exercise.id !== routeId) return <main role="status" className="exercise-detail-route-state">{t('chat.loading')}</main>;
  if (exercise === null) return <main role="alert" className="exercise-detail-route-state text-[var(--status-danger-fg)]">{t('workout.exercise_not_found')}</main>;
  const replaceExerciseId = searchParams.get('replace')?.trim() || undefined;
  const returnRoute = searchParams.get('return') === 'review' ? 'review' : searchParams.get('return') === 'build' ? 'build' : undefined;
  return <RoutedExerciseDetail exercise={exercise} userId={userId} replaceExerciseId={replaceExerciseId} returnRoute={returnRoute} />;
}
