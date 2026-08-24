'use client';

import { useEffect, useState } from 'react';
import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';
import type { WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function WorkoutReviewPage() {
  const { t } = useI18n();
  const [exercises, setExercises] = useState<WorkoutExerciseOption[]>([]);
  const [decision, setDecision] = useState<'saved' | 'retrospective' | null>(null);

  useEffect(() => {
    let active = true;
    supabase.from('exercises').select('id, name').order('name').then(({ data }) => {
      if (active) setExercises((data as WorkoutExerciseOption[] | null) ?? []);
    });
    return () => { active = false; };
  }, []);

  return (
    <>
      <WorkoutReview exercises={exercises} onSavePlan={() => setDecision('saved')} onLogCompleted={() => setDecision('retrospective')} />
      {decision ? (
        <p role="status" className="mx-auto max-w-2xl px-4 text-sm text-[var(--status-success-fg)]">
          {t(decision === 'saved' ? 'workout.plan_saved_locally' : 'workout.retrospective_ready')}
        </p>
      ) : null}
    </>
  );
}
