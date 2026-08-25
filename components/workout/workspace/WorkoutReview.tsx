'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Play, Save } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { PlanSaveState, WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { isWorkoutDraftReady, type WorkoutDraft } from '@/lib/workout/workspace-state';
import { pushWorkoutRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import { resolveWorkoutAsset } from '@/lib/workout-assets';
import { MovementVisual } from '@/components/workout/MovementVisual';
import { muscleLabelKey } from '@/components/workout/muscle-groups';

interface WorkoutReviewProps {
  exercises: WorkoutExerciseOption[];
  onSavePlan: (draft: WorkoutDraft) => void | Promise<void>;
  onLogCompleted: (draft: WorkoutDraft) => void;
  saveState?: PlanSaveState;
  saveDisabled?: boolean;
}

export function WorkoutReview({ exercises, onSavePlan, onLogCompleted, saveState = 'idle', saveDisabled = false }: WorkoutReviewProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const draft = workspace.state.draft;
  const startLocked = Boolean(workspace.state.startRequest);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); }, []);

  if (!draft) {
    return (
      <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_review_title')} className="mx-auto max-w-2xl px-4 py-8 text-center focus:outline-none">
        <p className="text-[var(--content-secondary)]">{t('workout.no_draft')}</p>
        <button type="button" className="btn-gold mt-4 min-h-11 rounded-xl px-4" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.home)}>{t('workout.back_home')}</button>
      </main>
    );
  }

  const hasName = draft.name.trim().length > 0;
  const hasContent = draft.kind === 'strength' ? draft.exercises.length > 0 : draft.durationMinutes > 0;
  const validPrescription = draft.kind !== 'strength' || draft.exercises.every((exercise) => Number.isInteger(exercise.targetSets) && exercise.targetSets > 0 && exercise.targetReps.trim().length > 0);
  const valid = isWorkoutDraftReady(draft);
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
    if (started) pushWorkoutRoute(router, WORKOUT_ROUTES.live);
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
          <p className="mb-3 text-sm text-[var(--content-secondary)]">{t('workout.exercise_count', { n: draft.exercises.length })} · {t('workout.review_target_sets', { n: draft.exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0) })}</p>
          <div className="space-y-2">
            {draft.exercises.map((draftExercise) => {
              const exercise = exerciseById.get(draftExercise.exerciseId);
              const name = draftExercise.exerciseName ?? exercise?.name ?? draftExercise.exerciseId;
              const muscleGroup = draftExercise.muscleGroup ?? exercise?.muscle_group ?? null;
              const asset = resolveWorkoutAsset({ exerciseName: exercise?.name ?? name, muscleGroup });
              return (
                <details key={draftExercise.exerciseId} className="group rounded-xl border border-[var(--workout-rail)] bg-[var(--surface-subtle)]">
                  <summary aria-label={t('workout.review_edit_exercise', { name })} className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-3 py-2 focus-visible:outline-none">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--workout-visual-surface)] p-1">
                      <MovementVisual asset={asset} alt={t(`workout.movement_${asset.kind}_alt`, { name })} sizes="56px" className="h-full w-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--content-primary)]">{name}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--content-secondary)]">{t('workout.sets_reps_summary', { sets: draftExercise.targetSets, reps: draftExercise.targetReps })}</span>
                      {muscleGroup ? <span className="mt-1 block truncate text-xs text-[var(--content-muted)]">{t('workout.primary_muscle_label', { muscle: t(muscleLabelKey(muscleGroup)) })}</span> : null}
                      {exercise?.equipment ? <span className="mt-1 block truncate text-xs text-[var(--content-muted)]">{t('workout.equipment_label', { equipment: exercise.equipment })}</span> : null}
                    </span>
                  </summary>
                  <div className="grid grid-cols-2 gap-3 border-t border-[var(--workout-rail)] p-3">
                    <label className="text-xs text-[var(--content-secondary)]">
                      {t('workout.target_sets')}
                      <input type="number" min={1} disabled={startLocked} aria-label={t('workout.target_sets_named', { name })} value={draftExercise.targetSets} onChange={(event) => workspace.updateDraftExercise(draftExercise.exerciseId, { targetSets: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)] disabled:opacity-50" />
                    </label>
                    <label className="text-xs text-[var(--content-secondary)]">
                      {t('workout.target_reps')}
                      <input disabled={startLocked} aria-label={t('workout.target_reps_named', { name })} value={draftExercise.targetReps} onChange={(event) => workspace.updateDraftExercise(draftExercise.exerciseId, { targetReps: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)] disabled:opacity-50" />
                    </label>
                  </div>
                </details>
              );
            })}
          </div>
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
      {!validPrescription ? <p role="alert" className="text-sm text-[var(--status-danger-fg)]">{t('workout.invalid_prescription')}</p> : null}
      {startError ? <p role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.start_live_failed')}</p> : null}
      {startLocked ? <p role="status" className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--content-primary)]">{t('workout.start_request_locked')}</p> : null}
      {draft.kind === 'cardio' ? <p className="text-sm text-[var(--content-muted)]">{t('workout.save_plan_strength_only')}</p> : null}
      {saveState === 'error' ? <p role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.save_plan_failed')}</p> : null}
      {saveState === 'success' ? <p role="status" className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-fg)]">{t('workout.save_plan_success')}</p> : null}

      <section className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4">
        <p className="text-sm leading-6 text-[var(--content-secondary)]">{t('workout.start_live_explanation')}</p>
        <button type="button" disabled={!valid || starting} onClick={() => void startLive()} className="btn-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><Play size={17} aria-hidden="true" />{t(startLocked ? 'workout.retry_same_start' : 'workout.start_live')}</button>
        <button type="button" disabled={!valid || startLocked} onClick={() => onLogCompleted(draft)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><ClipboardCheck size={17} aria-hidden="true" />{t('workout.log_completed')}</button>
        <button type="button" disabled={!valid || startLocked || draft.kind !== 'strength' || saveDisabled || saveState === 'pending'} onClick={() => void onSavePlan(draft)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40"><Save size={17} aria-hidden="true" />{t(saveState === 'pending' ? 'workout.save_plan_pending' : 'workout.save_plan')}</button>
      </section>
    </main>
  );
}
