'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Pencil, Play, Save } from 'lucide-react';
import { PlanExerciseCard } from '@/components/workout/workspace/PlanExerciseCard';
import { PlanMuscleSummary } from '@/components/workout/workspace/PlanMuscleSummary';
import { useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { PlanSaveState, WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { useI18n } from '@/lib/i18n';
import { isWorkoutDraftReady, type WorkoutDraft } from '@/lib/workout/workspace-state';
import { pushWorkoutRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';
import { useWorkoutRouteFocusSuppressed } from '@/components/workout/workspace/WorkoutRouteFocusContext';

interface WorkoutReviewProps {
  exercises: WorkoutExerciseOption[];
  onSavePlan: (draft: WorkoutDraft) => void | Promise<void>;
  onLogCompleted: (draft: WorkoutDraft) => void;
  saveState?: PlanSaveState;
  saveDisabled?: boolean;
  libraryError?: boolean;
}

export function WorkoutReview({ exercises, onSavePlan, onLogCompleted, saveState = 'idle', saveDisabled = false, libraryError = false }: WorkoutReviewProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const draft = workspace.state.draft;
  const startLocked = Boolean(workspace.state.startRequest);
  const startRejected = Boolean(workspace.startRejection) && !startLocked;
  const startBlocked = Boolean(workspace.startBlocked) && startLocked;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const suppressRouteFocus = useWorkoutRouteFocusSuppressed();
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  useEffect(() => {
    if (!suppressRouteFocus) mainRef.current?.focus({ preventScroll: true });
  }, [suppressRouteFocus]);

  if (!draft) return <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_review_title')} className="workout-plan-editor workout-plan-editor--empty"><p>{t('workout.no_draft')}</p><button type="button" className="btn-gold" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.home)}>{t('workout.back_home')}</button></main>;

  const hasName = draft.name.trim().length > 0;
  const hasContent = draft.kind === 'strength' ? draft.exercises.length > 0 : draft.durationMinutes > 0;
  const validPrescription = draft.kind !== 'strength' || draft.exercises.every((exercise) => Number.isInteger(exercise.targetSets) && exercise.targetSets > 0 && exercise.targetReps.trim().length > 0);
  const valid = isWorkoutDraftReady(draft);
  const startLive = async () => {
    if (!valid || starting) return;
    setStarting(true);
    setStartError(false);
    let started = false;
    try { started = await workspace.startLive(); if (!started) setStartError(true); }
    catch { setStartError(true); }
    finally { setStarting(false); }
    if (started) pushWorkoutRoute(router, WORKOUT_ROUTES.live);
  };
  const edit = () => { if (!startLocked) { workspace.returnToDraft(); pushWorkoutRoute(router, WORKOUT_ROUTES.build); } };

  return (
    <main ref={mainRef} tabIndex={-1} aria-label={t('workout.workspace_review_title')} className="workout-plan-editor workout-plan-review">
      <header className="workout-plan-review__header"><div><h1>{draft.name}</h1><p>{t('workout.review_ready')}</p></div><button type="button" disabled={startLocked} onClick={edit}><Pencil size={17} aria-hidden="true" />{t('workout.review_edit_plan')}</button></header>
      {libraryError ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.program_load_failed')}</p> : null}

      {draft.kind === 'strength' ? (
        <><PlanMuscleSummary draftExercises={draft.exercises} exercises={exercises} /><section className="workout-plan-review__sequence" aria-label={t('workout.plan_review_sequence')}>{draft.exercises.map((draftExercise, index) => <PlanExerciseCard key={draftExercise.exerciseId} mode="review" locked={startLocked} draftExercise={draftExercise} exercise={exerciseById.get(draftExercise.exerciseId)} index={index} total={draft.exercises.length} onTechnique={() => pushWorkoutRoute(router, `${WORKOUT_ROUTES.exercises}/${encodeURIComponent(draftExercise.exerciseId)}?return=review`)} />)}</section></>
      ) : (
        <section className="workout-cardio-review"><strong>{t(`workout.cardio_${draft.activity}`)}</strong><span>{t('workout.duration_summary', { minutes: draft.durationMinutes })}</span>{draft.distanceKm !== null ? <span>{t('workout.distance_summary', { distance: draft.distanceKm })}</span> : null}{draft.effort !== null ? <span>{t('workout.effort_summary', { effort: draft.effort })}</span> : null}</section>
      )}

      {!hasName ? <p role="alert" className="workout-plan-editor__validation">{t('workout.name_required')}</p> : null}
      {!hasContent ? <p className="workout-plan-editor__empty-state">{t(draft.kind === 'strength' ? 'workout.empty_strength_hint' : 'workout.empty_cardio_hint')}</p> : null}
      {!validPrescription ? <p role="alert" className="workout-plan-editor__validation">{t('workout.invalid_prescription')}</p> : null}
      {startRejected ? (
        <div role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">
          <p>{t('workout.start_rejected')}</p>
          <button type="button" onClick={edit} className="btn-ghost mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4"><Pencil size={17} aria-hidden="true" />{t('workout.back_to_draft')}</button>
        </div>
      ) : startError && !startBlocked ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.start_live_failed')}</p> : null}
      {startBlocked
        ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.start_blocked_configuration')}</p>
        : startLocked ? <p role="status" className="workout-plan-editor__notice workout-plan-editor__notice--warning">{t('workout.start_request_locked')}</p> : null}
      {saveState === 'error' ? <p role="alert" className="workout-plan-editor__notice workout-plan-editor__notice--error">{t('workout.save_plan_failed')}</p> : null}
      {saveState === 'success' ? <p role="status" className="workout-plan-editor__notice workout-plan-editor__notice--success">{t('workout.save_plan_success_limited')}</p> : null}

      <section className="workout-plan-review__decisions" aria-label={t('workout.review_actions')}>
        <p>{t('workout.start_live_explanation')}</p>
        <button type="button" disabled={!valid || starting} onClick={() => void startLive()} className="btn-gold"><Play size={17} aria-hidden="true" />{t(startLocked ? 'workout.retry_same_start' : 'workout.start_workout')}</button>
        <button type="button" disabled={!valid || startLocked} onClick={() => onLogCompleted(draft)} className="btn-ghost"><ClipboardCheck size={17} aria-hidden="true" />{t('workout.log_completed')}</button>
        <p className="workout-plan-editor__save-scope">{draft.kind === 'strength' ? t('workout.plan_save_scope') : t('workout.save_plan_strength_only')}</p>
        <button type="button" disabled={!valid || startLocked || draft.kind !== 'strength' || saveDisabled || saveState === 'pending'} onClick={() => void onSavePlan(draft)} className="btn-ghost"><Save size={17} aria-hidden="true" />{t(saveState === 'pending' ? 'workout.save_plan_pending' : 'workout.save_plan')}</button>
      </section>
    </main>
  );
}
