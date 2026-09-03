'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { RoutedExerciseDetail } from '@/components/workout/workspace/RoutedExerciseDetail';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/lib/types';

export default function ExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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

  if (exercise === undefined) return <main role="status" className="exercise-detail-route-state">{t('chat.loading')}</main>;
  if (exercise === null) return <main role="alert" className="exercise-detail-route-state text-[var(--status-danger-fg)]">{t('workout.exercise_not_found')}</main>;
  const replaceExerciseId = searchParams.get('replace')?.trim() || undefined;
  const returnRoute = searchParams.get('return') === 'review' ? 'review' : searchParams.get('return') === 'build' ? 'build' : undefined;
  return <RoutedExerciseDetail exercise={exercise} userId={userId} replaceExerciseId={replaceExerciseId} returnRoute={returnRoute} />;
}
