'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/lib/types';
import { workoutRouteForStage } from '@/lib/workout/workspace-routes';

export default function LiveWorkoutPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { state } = useWorkoutWorkspace();
  const [userId, setUserId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const active = state.stage === 'live' || state.stage === 'paused' || state.stage === 'finishing';

  useEffect(() => {
    if (!active) router.replace(workoutRouteForStage(state.stage));
  }, [active, router, state.stage]);

  useEffect(() => {
    let mounted = true;
    if (!active) return;
    void Promise.all([
      supabase.auth.getUser(),
      supabase.from('exercises').select('*').order('name'),
    ]).then(([authResult, exerciseResult]) => {
      if (!mounted) return;
      const resolvedUserId = authResult.data.user?.id ?? null;
      if (!resolvedUserId) {
        router.replace('/login');
        return;
      }
      setUserId(resolvedUserId);
      setExercises((exerciseResult.data as Exercise[] | null) ?? []);
    });
    return () => { mounted = false; };
  }, [active, router]);

  if (!active || !userId) {
    return <main className="mx-auto max-w-2xl px-4 py-5"><div role="status" aria-label={t('workout.loading_live_session')} className="min-h-40 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" /></main>;
  }

  return <LiveWorkout exercises={exercises} userId={userId} />;
}
