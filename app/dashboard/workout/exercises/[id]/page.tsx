'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RoutedExerciseDetail } from '@/components/workout/workspace/RoutedExerciseDetail';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/lib/types';

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
