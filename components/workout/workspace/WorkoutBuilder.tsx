'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PlanExerciseCard } from '@/components/workout/workspace/PlanExerciseCard';
import { PlanMuscleSummary } from '@/components/workout/workspace/PlanMuscleSummary';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { MuscleGroup } from '@/lib/types';
import { isWorkoutDraftReady, type WorkoutDraft } from '@/lib/workout/workspace-state';
import { pushWorkoutRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';

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
  libraryError?: boolean;
}

const cardioActivities = ['walk', 'run', 'cycle', 'hiit', 'swim', 'other'] as const;

export function WorkoutBuilder({ exercises, onSavePlan, saveState = 'idle', saveDisabled = false, libraryError = false }: WorkoutBuilderProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const draft = workspace.state.draft;
  const mainRef = useRef<HTMLElement>(null);
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); }, []);

  if (!draft) {
    return <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_build_title')} className="workout-plan-editor workout-plan-editor--empty"><p>{t('workout.no_draft')}</p><button type="button" className="btn-gold" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.home)}>{t('workout.back_home')}</button></main>;
  }

  const hasName = draft.name.trim().length > 0;
  const hasContent = draft.kind === 'strength' ? draft.exercises.length > 0 : draft.durationMinutes > 0;
  const validPrescription = draft.kind !== 'strength' || draft.exercises.every((exercise) => Number.isInteger(exercise.targetSets) && exercise.targetSets > 0 && exercise.targetReps.trim().length > 0);
  const canReview = isWorkoutDraftReady(draft);

  return (
    <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_build_title')} className="workout-plan-editor">
      <header className="workout-plan-editor__header">
        <div><h1>{draft.name || t('workout.workspace_build_title')}</h1><p>{t('workout.draft_not_started')}</p></div>
        <label><span>{t('workout.name')}</span><input className="text-base" value={draft.name} onChange={(event) => workspace.updateDraftName(event.target.value)} /></label>
      </header>

      {libraryError ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.program_load_failed')}</p> : null}

      {draft.kind === 'strength' ? (
        <>
          <PlanMuscleSummary draftExercises={draft.exercises} exercises={exercises} />
          <section className="workout-plan-editor__sequence" aria-label={t('workout.plan_sequence')}>
            {draft.exercises.map((draftExercise, index) => <PlanExerciseCard key={draftExercise.exerciseId} draftExercise={draftExercise} exercise={exerciseById.get(draftExercise.exerciseId)} index={index} total={draft.exercises.length} onUpdate={(patch) => workspace.updateDraftExercise(draftExercise.exerciseId, patch)} onMove={(direction) => workspace.reorderDraftExercise(draftExercise.exerciseId, direction)} onReplace={() => pushWorkoutRoute(router, `${WORKOUT_ROUTES.exercises}?replace=${encodeURIComponent(draftExercise.exerciseId)}&return=build`)} onRemove={() => workspace.removeDraftExercise(draftExercise.exerciseId)} onTechnique={() => pushWorkoutRoute(router, `${WORKOUT_ROUTES.exercises}/${encodeURIComponent(draftExercise.exerciseId)}?return=build`)} />)}
            {draft.exercises.length === 0 ? <p className="workout-plan-editor__empty-state">{t('workout.empty_strength_hint')}</p> : null}
            <button type="button" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.exercises)} className="workout-plan-editor__add"><Plus size={17} aria-hidden="true" />{t('workout.add_exercise')}</button>
          </section>
        </>
      ) : (
        <section className="workout-cardio-editor">
          <label><span>{t('workout.activity')}</span><select className="text-base" aria-label={t('workout.activity')} value={draft.activity} onChange={(event) => workspace.updateCardioDraft({ activity: event.target.value as typeof draft.activity })}>{cardioActivities.map((activity) => <option key={activity} value={activity}>{t(`workout.cardio_${activity}`)}</option>)}</select></label>
          <label><span>{t('workout.duration_minutes')}</span><input className="text-base" aria-label={t('workout.duration_minutes')} type="number" min={0} value={draft.durationMinutes} onChange={(event) => workspace.updateCardioDraft({ durationMinutes: Math.max(0, Number(event.target.value) || 0) })} /></label>
          <label><span>{t('workout.distance_optional')}</span><input className="text-base" aria-label={t('workout.distance_optional')} type="number" min={0} step="0.1" value={draft.distanceKm ?? ''} onChange={(event) => workspace.updateCardioDraft({ distanceKm: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })} /></label>
          <label><span>{t('workout.effort')}</span><input className="text-base" aria-label={t('workout.effort')} type="number" min={1} max={10} value={draft.effort ?? ''} onChange={(event) => workspace.updateCardioDraft({ effort: event.target.value === '' ? null : Math.min(10, Math.max(1, Number(event.target.value))) })} /></label>
        </section>
      )}

      {!hasName ? <p role="alert" className="workout-plan-editor__validation">{t('workout.name_required')}</p> : null}
      {!hasContent && draft.kind === 'cardio' ? <p className="workout-plan-editor__empty-state">{t('workout.empty_cardio_hint')}</p> : null}
      {!validPrescription ? <p role="alert" className="workout-plan-editor__validation">{t('workout.invalid_prescription')}</p> : null}
      {draft.kind === 'cardio' ? <p className="workout-plan-editor__save-scope">{t('workout.save_plan_strength_only')}</p> : <p className="workout-plan-editor__save-scope">{t('workout.plan_save_scope')}</p>}
      {saveState === 'error' ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.save_plan_failed')}</p> : null}
      {saveState === 'success' ? <p role="status" className="workout-plan-editor__notice workout-plan-editor__notice--success">{t('workout.save_plan_success_limited')}</p> : null}
      <div className="workout-plan-editor__footer">
        <button type="button" disabled={!hasName || draft.kind !== 'strength' || !hasContent || !validPrescription || saveDisabled || saveState === 'pending'} onClick={() => void onSavePlan(draft)} className="btn-ghost">{t(saveState === 'pending' ? 'workout.save_plan_pending' : 'workout.save_plan')}</button>
        <button type="button" disabled={!canReview} onClick={() => { workspace.goToReview(); pushWorkoutRoute(router, WORKOUT_ROUTES.review); }} className="btn-gold">{t('workout.review_workout')}</button>
      </div>
    </main>
  );
}
