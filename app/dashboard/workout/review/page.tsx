'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';
import { RetrospectiveWorkoutLogger } from '@/components/workout/workspace/RetrospectiveWorkoutLogger';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

export default function WorkoutReviewPage() {
  const { t } = useI18n();
  const router = useRouter();
  const workspace = useWorkoutWorkspace();
  const [exercises, setExercises] = useState<WorkoutExerciseOption[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [planSaved, setPlanSaved] = useState(false);
  const [retrospectiveDraft, setRetrospectiveDraft] = useState<WorkoutDraft | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.auth.getUser(),
      supabase.from('exercises').select('*').order('name'),
    ]).then(([authResult, exerciseResult]) => {
      if (!active) return;
      setUserId(authResult.data.user?.id ?? null);
      setExercises((exerciseResult.data as WorkoutExerciseOption[] | null) ?? []);
    });
    return () => { active = false; };
  }, []);

  if (retrospectiveDraft) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {userId ? (
          <RetrospectiveWorkoutLogger
            userId={userId}
            draft={retrospectiveDraft}
            exercises={exercises as Parameters<typeof RetrospectiveWorkoutLogger>[0]['exercises']}
            onCancel={() => setRetrospectiveDraft(null)}
            onSaved={() => {
              workspace.discardDraft();
              router.push(WORKOUT_ROUTES.home);
            }}
          />
        ) : <div role="status" aria-label={t('workout.loading')} className="min-h-24 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />}
      </main>
    );
  }

  return (
    <>
      <WorkoutReview exercises={exercises} onSavePlan={() => setPlanSaved(true)} onLogCompleted={setRetrospectiveDraft} />
      {planSaved ? (
        <p role="status" className="mx-auto max-w-2xl px-4 text-sm text-[var(--status-success-fg)]">
          {t('workout.plan_saved_locally')}
        </p>
      ) : null}
    </>
  );
}
