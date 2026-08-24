'use client';

import { useEffect, useState } from 'react';
import { WorkoutBuilder, type WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function WorkoutBuildPage() {
  const { t } = useI18n();
  const [exercises, setExercises] = useState<WorkoutExerciseOption[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.from('exercises').select('id, name').order('name').then(({ data }) => {
      if (active) setExercises((data as WorkoutExerciseOption[] | null) ?? []);
    });
    return () => { active = false; };
  }, []);

  return (
    <>
      <WorkoutBuilder exercises={exercises} onSavePlan={() => setSaved(true)} />
      {saved ? <p role="status" className="mx-auto max-w-2xl px-4 text-sm text-[var(--status-success-fg)]">{t('workout.plan_saved_locally')}</p> : null}
    </>
  );
}
