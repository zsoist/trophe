'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { MuscleGroup } from '@/lib/types';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import { pushWorkoutRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import { resolveWorkoutAsset } from '@/lib/workout-assets';
import { MovementVisual } from '@/components/workout/MovementVisual';
import { muscleLabelKey } from '@/components/workout/muscle-groups';

export interface WorkoutExerciseOption {
  id: string;
  name: string;
  name_es?: string | null;
  name_el?: string | null;
  muscle_group?: MuscleGroup | null;
  equipment?: string | null;
}

export type PlanSaveState = 'idle' | 'pending' | 'success' | 'error';

interface WorkoutBuilderProps {
  exercises: WorkoutExerciseOption[];
  onSavePlan: (draft: WorkoutDraft) => void | Promise<void>;
  saveState?: PlanSaveState;
  saveDisabled?: boolean;
}

const cardioActivities = ['walk', 'run', 'cycle', 'hiit', 'swim', 'other'] as const;

export function WorkoutBuilder({ exercises, onSavePlan, saveState = 'idle', saveDisabled = false }: WorkoutBuilderProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const draft = workspace.state.draft;
  const mainRef = useRef<HTMLElement>(null);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); }, []);

  if (!draft) {
    return (
      <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_build_title')} className="mx-auto max-w-2xl px-4 py-8 text-center focus:outline-none">
        <p className="text-[var(--content-secondary)]">{t('workout.no_draft')}</p>
        <button type="button" className="btn-gold mt-4 min-h-11 rounded-xl px-4" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.home)}>{t('workout.back_home')}</button>
      </main>
    );
  }

  const hasName = draft.name.trim().length > 0;
  const hasContent = draft.kind === 'strength' ? draft.exercises.length > 0 : draft.durationMinutes > 0;
  const canReview = hasName && hasContent;
  const review = () => {
    if (!canReview) return;
    workspace.goToReview();
    pushWorkoutRoute(router, WORKOUT_ROUTES.review);
  };

  return (
    <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_build_title')} className="mx-auto max-w-2xl space-y-5 px-4 py-5 focus:outline-none">
      <p className="inline-flex rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-semibold text-[var(--content-secondary)]">
        {t('workout.draft_not_started')}
      </p>

      <label className="block text-sm font-medium text-[var(--content-secondary)]">
        {t('workout.name')}
        <input
          value={draft.name}
          onChange={(event) => workspace.updateDraftName(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-base text-[var(--content-primary)]"
        />
      </label>

      {draft.kind === 'strength' ? (
        <section className="space-y-3">
          {draft.exercises.map((draftExercise, index) => {
            const exercise = exerciseById.get(draftExercise.exerciseId);
            const name = draftExercise.exerciseName ?? exercise?.name ?? draftExercise.exerciseId;
            const muscleGroup = draftExercise.muscleGroup ?? exercise?.muscle_group ?? null;
            const asset = resolveWorkoutAsset({ exerciseName: exercise?.name ?? name, muscleGroup });
            const visualAlt = t(`workout.movement_${asset.kind}_alt`, { name });
            return (
              <article key={draftExercise.exerciseId} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 min-[375px]:p-4">
                <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-3">
                  <div className="h-20 overflow-hidden rounded-xl bg-[var(--workout-visual-surface)] p-1">
                    <MovementVisual asset={asset} alt={visualAlt} sizes="76px" className="h-full w-full" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-[var(--content-primary)]">{name}</h2>
                    {muscleGroup ? <p className="mt-1 truncate text-xs text-[var(--content-secondary)]">{t('workout.primary_muscle_label', { muscle: t(muscleLabelKey(muscleGroup)) })}</p> : null}
                    {exercise?.equipment ? <p className="mt-1 truncate text-xs text-[var(--content-muted)]">{t('workout.equipment_label', { equipment: exercise.equipment })}</p> : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 border-t border-[var(--workout-rail)] pt-2">
                  <button type="button" disabled={index === 0} aria-label={t('workout.move_named_up', { name })} onClick={() => workspace.reorderDraftExercise(draftExercise.exerciseId, 'up')} className="inline-flex min-h-11 min-w-11 items-center justify-center disabled:opacity-30"><ChevronUp size={18} aria-hidden="true" /></button>
                  <button type="button" disabled={index === draft.exercises.length - 1} aria-label={t('workout.move_named_down', { name })} onClick={() => workspace.reorderDraftExercise(draftExercise.exerciseId, 'down')} className="inline-flex min-h-11 min-w-11 items-center justify-center disabled:opacity-30"><ChevronDown size={18} aria-hidden="true" /></button>
                  <button type="button" aria-label={t('workout.remove_named', { name })} onClick={() => workspace.removeDraftExercise(draftExercise.exerciseId)} className="ml-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold text-[var(--status-danger-fg)]"><Trash2 size={17} aria-hidden="true" />{t('workout.remove_exercise')}</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-xs text-[var(--content-secondary)]">
                    {t('workout.target_sets')}
                    <input type="number" min={1} aria-label={t('workout.target_sets_named', { name })} value={draftExercise.targetSets} onChange={(event) => workspace.updateDraftExercise(draftExercise.exerciseId, { targetSets: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)]" />
                  </label>
                  <label className="text-xs text-[var(--content-secondary)]">
                    {t('workout.target_reps')}
                    <input aria-label={t('workout.target_reps_named', { name })} value={draftExercise.targetReps} onChange={(event) => workspace.updateDraftExercise(draftExercise.exerciseId, { targetReps: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)]" />
                  </label>
                </div>
              </article>
            );
          })}

          <button type="button" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.exercises)} className="btn-ghost inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl"><Plus size={17} aria-hidden="true" />{t('workout.add_exercise')}</button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--content-secondary)]">
            {t('workout.activity')}
            <select aria-label={t('workout.activity')} value={draft.activity} onChange={(event) => workspace.updateCardioDraft({ activity: event.target.value as typeof draft.activity })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 text-base text-[var(--content-primary)]">
              {cardioActivities.map((activity) => <option key={activity} value={activity}>{t(`workout.cardio_${activity}`)}</option>)}
            </select>
          </label>
          <label className="text-sm text-[var(--content-secondary)]">
            {t('workout.duration_minutes')}
            <input aria-label={t('workout.duration_minutes')} type="number" min={0} value={draft.durationMinutes} onChange={(event) => workspace.updateCardioDraft({ durationMinutes: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)]" />
          </label>
          <label className="text-sm text-[var(--content-secondary)]">
            {t('workout.distance_optional')}
            <input aria-label={t('workout.distance_optional')} type="number" min={0} step="0.1" value={draft.distanceKm ?? ''} onChange={(event) => workspace.updateCardioDraft({ distanceKm: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)]" />
          </label>
          <label className="text-sm text-[var(--content-secondary)]">
            {t('workout.effort')}
            <input aria-label={t('workout.effort')} type="number" min={1} max={10} value={draft.effort ?? ''} onChange={(event) => workspace.updateCardioDraft({ effort: event.target.value === '' ? null : Math.min(10, Math.max(1, Number(event.target.value))) })} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 font-mono text-base tabular-nums text-[var(--content-primary)]" />
          </label>
        </section>
      )}

      {!hasName ? <p role="alert" className="text-sm text-[var(--status-danger-fg)]">{t('workout.name_required')}</p> : null}
      {!hasContent ? <p className="text-sm text-[var(--content-secondary)]">{t(draft.kind === 'strength' ? 'workout.empty_strength_hint' : 'workout.empty_cardio_hint')}</p> : null}
      {draft.kind === 'cardio' ? <p className="text-sm text-[var(--content-muted)]">{t('workout.save_plan_strength_only')}</p> : null}
      {saveState === 'error' ? <p role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">{t('workout.save_plan_failed')}</p> : null}
      {saveState === 'success' ? <p role="status" className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-fg)]">{t('workout.save_plan_success')}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={!hasName || draft.kind !== 'strength' || !hasContent || saveDisabled || saveState === 'pending'} onClick={() => void onSavePlan(draft)} className="btn-ghost min-h-11 rounded-xl disabled:opacity-40">{t(saveState === 'pending' ? 'workout.save_plan_pending' : 'workout.save_plan')}</button>
        <button type="button" disabled={!canReview} onClick={review} className="btn-gold min-h-11 rounded-xl disabled:opacity-40">{t('workout.review_workout')}</button>
      </div>
    </main>
  );
}
