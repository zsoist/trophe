'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Play, Save } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';

interface WorkoutReviewProps {
  exercises: WorkoutExerciseOption[];
  onSavePlan: (draft: WorkoutDraft) => void;
  onLogCompleted: (draft: WorkoutDraft) => void;
}

export function WorkoutReview({ exercises, onSavePlan, onLogCompleted }: WorkoutReviewProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const draft = workspace.state.draft;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  useEffect(() => { mainRef.current?.focus(); }, []);

  if (!draft) {
    return (
      <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_review_title')} className="mx-auto max-w-2xl px-4 py-8 text-center focus:outline-none">
        <p className="text-[var(--content-secondary)]">{t('workout.no_draft')}</p>
        <button type="button" className="btn-gold mt-4 min-h-11 rounded-xl px-4" onClick={() => router.push(WORKOUT_ROUTES.home)}>{t('workout.back_home')}</button>
      </main>
    );
  }

  const hasName = draft.name.trim().length > 0;
  const hasContent = draft.kind === 'strength' ? draft.exercises.length > 0 : draft.durationMinutes > 0;
  const valid = hasName && hasContent;
  const startLive = async () => {
    if (!valid || starting) return;
    setStarting(true);
    setStartError(false);
    let started = false;
    try {
      started = await workspace.startLive();
      if (!started) setStartError(true);
    } catch {
      setStartError(true);
    } finally {
      setStarting(false);
    }
    if (started) router.push(WORKOUT_ROUTES.live);
  };

  return (
    <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_review_title')} className="mx-auto max-w-2xl space-y-5 px-4 py-5 focus:outline-none">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--action-primary)]">{t('workout.draft_not_started')}</p>
        <h2 className="mt-1 text-2xl font-bold text-[var(--content-primary)]">{t('workout.review_title')}</h2>
        <p className="mt-1 text-lg font-semibold text-[var(--content-primary)]">{draft.name}</p>
      </div>

      {draft.kind === 'strength' ? (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <p className="mb-3 text-sm text-[var(--content-secondary)]">{t('workout.exercise_count', { n: draft.exercises.length })}</p>
          <ul className="space-y-3">
            {draft.exercises.map((exercise) => (
              <li key={exercise.exerciseId} className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 first:border-0 first:pt-0">
                <span className="font-medium text-[var(--content-primary)]">{exercise.exerciseName ?? names.get(exercise.exerciseId) ?? exercise.exerciseId}</span>
                <span className="text-sm text-[var(--content-secondary)]">{t('workout.sets_reps_summary', { sets: exercise.targetSets, reps: exercise.targetReps })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm">
          <p className="font-medium text-[var(--content-primary)]">{t(`workout.cardio_${draft.activity}`)}</p>
          <p className="text-[var(--content-secondary)]">{t('workout.duration_summary', { minutes: draft.durationMinutes })}</p>
          {draft.distanceKm !== null ? <p className="text-[var(--content-secondary)]">{t('workout.distance_summary', { distance: draft.distanceKm })}</p> : null}
          {draft.effort !== null ? <p className="text-[var(--content-secondary)]">{t('workout.effort_summary', { effort: draft.effort })}</p> : null}
        </section>
      )}

      {!hasName ? <p role="alert" className="text-sm text-[var(--status-danger-fg)]">{t('workout.name_required')}</p> : null}
      {!hasContent ? <p className="text-sm text-[var(--content-secondary)]">{t(draft.kind === 'strength' ? 'workout.empty_strength_hint' : 'workout.empty_cardio_hint')}</p> : null}
      {startError ? <p role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.start_live_failed')}</p> : null}

      <section className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
        <p className="text-sm leading-6 text-[var(--content-secondary)]">{t('workout.start_live_explanation')}</p>
        <button type="button" disabled={!valid || starting} onClick={() => void startLive()} className="btn-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><Play size={17} aria-hidden="true" />{t('workout.start_live')}</button>
        <button type="button" disabled={!valid} onClick={() => onLogCompleted(draft)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><ClipboardCheck size={17} aria-hidden="true" />{t('workout.log_completed')}</button>
        <button type="button" disabled={!hasName} onClick={() => onSavePlan(draft)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><Save size={17} aria-hidden="true" />{t('workout.save_plan')}</button>
      </section>
    </main>
  );
}
