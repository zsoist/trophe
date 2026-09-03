'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, BarChart3, ChevronRight, History, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { muscleLabelKey } from '@/components/workout/muscle-groups';
import { WorkoutAtlasHome } from '@/components/workout/workspace/WorkoutAtlasHome';
import { WorkoutScheduleStrip } from '@/components/workout/workspace/WorkoutScheduleStrip';
import { WorkoutTodayRail } from '@/components/workout/workspace/WorkoutTodayRail';
import { useWorkoutWorkspace, type WorkoutDraftTemplateInput } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { resolveMuscleActivations, type MuscleActivation } from '@/lib/workout/anatomy';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup, WorkoutRecommendation, WorkoutSession } from '@/lib/types';
import type { WorkoutKind, WorkoutWorkspaceState } from '@/lib/workout/workspace-state';
import { pushWorkoutRoute, WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';

export interface WorkoutHomeTemplate extends WorkoutDraftTemplateInput {
  muscleSummary: MuscleGroup[];
}

export interface WorkoutHomeProgram {
  programName: string;
  todayTemplate: WorkoutHomeTemplate | null;
  alsoToday: WorkoutHomeTemplate[];
  nextWeekday?: number | null;
  nextTemplateName?: string | null;
}

interface WorkoutHomeProps {
  exercises: Exercise[];
  program: WorkoutHomeProgram | null;
  recommendation?: WorkoutRecommendation | null;
  programLoading?: boolean;
  recommendationLoading?: boolean;
  programError?: boolean;
  recommendationError?: boolean;
  supportError?: boolean;
  recents: WorkoutSession[];
  routines: WorkoutHomeTemplate[];
  disabled?: boolean;
}

type ReplacementChoice = {
  name: string;
  destination: 'build' | 'review' | 'exercises';
  input:
    | { type: 'draft'; value: { name: string; kind: WorkoutKind } }
    | { type: 'template'; value: WorkoutHomeTemplate };
};

function templateFromRecommendation(recommendation: WorkoutRecommendation | null | undefined): WorkoutHomeTemplate | null {
  if (!recommendation?.exercises.length) return null;
  return {
    templateKey: 'recommendation:today',
    templateId: null,
    name: recommendation.source === 'coach' ? 'Coach workout' : 'Recommended workout',
    muscleSummary: Array.from(new Set(recommendation.exercises.map((exercise) => exercise.muscleGroup))),
    exercises: recommendation.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscleGroup,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      ...(exercise.targetRpe !== undefined ? { targetRpe: exercise.targetRpe } : {}),
    })),
  };
}

function uniqueActivations(template: WorkoutHomeTemplate | null, exercises: Exercise[]): MuscleActivation[] {
  if (!template) return [];
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const resolved = template.exercises.flatMap((draftExercise) => {
    const exercise = byId.get(draftExercise.exerciseId);
    return resolveMuscleActivations({
      name: draftExercise.exerciseName ?? exercise?.name,
      equipment: exercise?.equipment,
      muscleGroup: draftExercise.muscleGroup ?? exercise?.muscle_group,
    });
  });
  const fallbacks = template.muscleSummary.flatMap((muscleGroup) => resolveMuscleActivations({ muscleGroup }));
  const roleStrength = { primary: 3, secondary: 2, stabilizer: 1 } as const;
  const strongestById = new Map<MuscleActivation['id'], MuscleActivation>();
  for (const activation of [...resolved, ...fallbacks]) {
    const current = strongestById.get(activation.id);
    if (!current || roleStrength[activation.role] > roleStrength[current.role]) strongestById.set(activation.id, activation);
  }
  return Array.from(strongestById.values());
}

function workspaceTemplate(state: WorkoutWorkspaceState): WorkoutHomeTemplate | null {
  if (!state.draft || state.draft.kind !== 'strength') return null;
  return {
    templateKey: state.draft.templateKey ?? 'workspace:draft',
    templateId: state.draft.templateId ?? null,
    name: state.draft.name || 'Workout draft',
    muscleSummary: Array.from(new Set(state.draft.exercises.map((exercise) => exercise.muscleGroup).filter((value): value is MuscleGroup => Boolean(value)))),
    exercises: state.draft.exercises,
  };
}

export function WorkoutHome({
  exercises,
  program,
  recommendation = null,
  programLoading = false,
  recommendationLoading = false,
  programError = false,
  recommendationError = false,
  supportError = false,
  recents,
  routines,
  disabled = false,
}: WorkoutHomeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const [preview, setPreview] = useState<WorkoutHomeTemplate | null>(null);
  const [replacement, setReplacement] = useState<ReplacementChoice | null>(null);
  const exerciseNames = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise.name])), [exercises]);
  const recommendedTemplate = useMemo(() => templateFromRecommendation(recommendation), [recommendation]);
  const assignedTemplate = program?.todayTemplate ?? (recommendation?.source === 'coach' ? recommendedTemplate : null);
  const offeredTemplate = assignedTemplate ?? recommendedTemplate;
  const hasDraft = (workspace.state.stage === 'draft' || workspace.state.stage === 'review') && Boolean(workspace.state.draft);
  const activeStage = workspace.state.stage === 'live' || workspace.state.stage === 'paused' || workspace.state.stage === 'finishing';
  const recoveryStage = activeStage || workspace.state.stage === 'completed';
  const recoveredTemplate = workspaceTemplate(workspace.state);
  const displayedTemplate = workspace.state.draft ? recoveredTemplate : offeredTemplate;
  const activations = useMemo(() => uniqueActivations(displayedTemplate, exercises), [displayedTemplate, exercises]);
  const isCardioDraft = workspace.state.draft?.kind === 'cardio';
  const targetLabel = displayedTemplate?.muscleSummary.length
    ? displayedTemplate.muscleSummary.map((muscle) => t(muscleLabelKey(muscle))).join(' · ')
    : isCardioDraft ? 'Cardio session · no named muscle target' : 'No muscle target selected';
  const source = activeStage ? 'Workout in progress' : workspace.state.stage === 'completed' ? 'Completed workout' : hasDraft ? 'Your saved draft' : assignedTemplate ? 'Assigned by coach' : recommendedTemplate ? 'Recommended by Trophē' : 'Open training';
  const readiness = workspace.state.stage === 'live' || workspace.state.stage === 'paused' ? 'Ready to resume' : recoveryStage ? 'Session recovered' : hasDraft ? 'Draft saved' : offeredTemplate ? 'Ready to review' : 'Ready to build';
  const estimatedDuration = workspace.state.draft?.kind === 'cardio'
    ? workspace.state.draft.durationMinutes || null
    : recoveredTemplate
      ? recoveredTemplate.exercises.length * 8
      : assignedTemplate
        ? assignedTemplate.exercises.length * 8
        : recommendation?.estimatedDurationMinutes ?? null;

  const finishChoice = (choice: ReplacementChoice, replace: boolean) => {
    if (choice.input.type === 'template') {
      if (replace) workspace.replaceDraftFromTemplate(choice.input.value);
      else workspace.createDraftFromTemplate(choice.input.value);
    } else if (replace) workspace.replaceDraft(choice.input.value);
    else workspace.createDraft(choice.input.value);
    if (choice.destination === 'review') workspace.goToReview();
    setReplacement(null);
    setPreview(null);
    pushWorkoutRoute(router, choice.destination === 'review' ? WORKOUT_ROUTES.review : choice.destination === 'exercises' ? WORKOUT_ROUTES.exercises : WORKOUT_ROUTES.build);
  };

  const choose = (choice: ReplacementChoice) => {
    if (hasDraft) setReplacement(choice);
    else finishChoice(choice, false);
  };
  const buildStrength = () => choose({ name: 'Workout', destination: 'exercises', input: { type: 'draft', value: { name: 'Workout', kind: 'strength' } } });
  const buildCardio = () => choose({ name: t('workout.cardio'), destination: 'build', input: { type: 'draft', value: { name: t('workout.cardio'), kind: 'cardio' } } });
  const reviewTemplate = (template: WorkoutHomeTemplate) => choose({ name: template.name, destination: 'review', input: { type: 'template', value: template } });

  if (hasDraft && workspace.state.retrospectiveRequest && workspace.state.draft) {
    return <main className="mx-auto max-w-2xl px-4 py-5"><section className="rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-5"><p className="text-sm leading-6 text-[var(--content-primary)]">{t('workout.retrospective_request_locked')}</p><h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name}</h2><button type="button" disabled={workspace.retrospectiveSaving} onClick={() => void workspace.retryRetrospective().then((ok) => { if (ok) pushWorkoutRoute(router, WORKOUT_ROUTES.live); })} className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold disabled:opacity-50">{workspace.retrospectiveSaving ? t('workout.saving') : t('workout.retry_same_save')}</button></section></main>;
  }
  if (hasDraft && workspace.state.startRequest && workspace.state.draft) {
    return <main className="mx-auto max-w-2xl px-4 py-5"><section className="rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-5"><p className="text-sm leading-6 text-[var(--content-primary)]">{t('workout.start_request_locked')}</p><h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name}</h2><button type="button" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.review)} className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold">{t('workout.continue_review')}</button></section></main>;
  }

  const primaryAction = workspace.state.stage === 'live' || workspace.state.stage === 'paused'
    ? { label: 'Resume workout', action: () => pushWorkoutRoute(router, WORKOUT_ROUTES.live) }
    : workspace.state.stage === 'finishing'
      ? { label: 'Continue workout', action: () => pushWorkoutRoute(router, WORKOUT_ROUTES.live) }
      : workspace.state.stage === 'completed'
        ? { label: 'View workout summary', action: () => pushWorkoutRoute(router, WORKOUT_ROUTES.live) }
        : hasDraft
          ? { label: workspace.state.stage === 'review' ? t('workout.continue_review') : t('workout.continue_editing'), action: () => pushWorkoutRoute(router, workspace.state.stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build) }
          : offeredTemplate
            ? { label: 'Review plan', action: () => reviewTemplate(offeredTemplate) }
            : { label: 'Build workout', action: buildStrength };
  const showLoading = !hasDraft && !recoveryStage && (programLoading || recommendationLoading);

  if (showLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-4 sm:py-5">
        <section role="status" aria-live="polite" aria-label="Loading workout plan" data-loading-skeleton className="rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--content-primary)]">Loading today&apos;s training</p>
          <p className="mt-1 text-xs leading-5 text-[var(--content-secondary)]">Checking today’s coach assignment and recommendation before workout actions become available.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:py-5">
      {hasDraft || recoveryStage ? <p className="rounded-xl border border-[var(--workout-rail)] bg-[var(--workout-surface)] px-3 py-2 text-xs text-[var(--content-secondary)]">{activeStage ? 'Your active session was recovered. Your logged work is still here.' : workspace.state.stage === 'completed' ? 'Your completed session is ready to review.' : 'Your saved draft is available on this device.'}</p> : null}

      <WorkoutTodayRail title={displayedTemplate?.name ?? workspace.state.draft?.name ?? 'Build today’s workout'} source={source} readiness={readiness} workSummary={isCardioDraft ? 'Cardio session' : displayedTemplate?.exercises.length ? `${displayedTemplate.exercises.length} exercises` : 'Choose your exercises'} nextAction={primaryAction.label} estimatedDurationMinutes={estimatedDuration} />

      {(programError || recommendationError) && !offeredTemplate ? <div role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">Your workout program could not be loaded. You can still build one.</div> : null}
      {supportError ? <div role="alert" className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--content-primary)]">{t('workout.support_data_load_failed')}</div> : null}

      <WorkoutAtlasHome activations={activations} targetLabel={targetLabel} emptyDescription={isCardioDraft ? 'Cardio is tracked by activity, duration, distance, and effort.' : 'Add strength exercises to see their muscle roles.'} />
      <button type="button" data-testid="workout-primary-action" onClick={primaryAction.action} disabled={disabled && !recoveryStage && !hasDraft} className="btn-gold min-h-11 w-full rounded-xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{primaryAction.label}</button>

      {!recoveryStage ? <WorkoutScheduleStrip program={program} todayName={offeredTemplate?.name ?? null} todaySource={assignedTemplate ? 'Assigned by coach' : recommendedTemplate ? 'Recommended by Trophē' : 'Open training'} /> : null}

      {!recoveryStage ? <section aria-labelledby="workout-destinations-title"><h2 id="workout-destinations-title" className="mb-2 text-sm font-bold tracking-[-0.01em] text-[var(--content-primary)]">Explore and plan</h2><div className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
        <Link href={WORKOUT_ROUTES.exercises} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"><Search aria-hidden="true" size={16} className="text-[var(--content-muted)]" /><span className="flex-1">Find an exercise</span><ChevronRight aria-hidden="true" size={16} /></Link>
        <button type="button" onClick={buildCardio} disabled={disabled} className="flex min-h-11 w-full items-center gap-3 border-t border-[var(--workout-rail)] px-3 py-2 text-left text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><Activity aria-hidden="true" size={16} className="text-[var(--content-muted)]" /><span className="flex-1">Plan cardio</span><ChevronRight aria-hidden="true" size={16} /></button>
        <Link href="/dashboard/workout/history" className="flex min-h-11 items-center gap-3 border-t border-[var(--workout-rail)] px-3 py-2 text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"><History aria-hidden="true" size={16} className="text-[var(--content-muted)]" /><span className="flex-1">Workout history</span><ChevronRight aria-hidden="true" size={16} /></Link>
        <Link href="/dashboard/workout/stats" className="flex min-h-11 items-center gap-3 border-t border-[var(--workout-rail)] px-3 py-2 text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"><BarChart3 aria-hidden="true" size={16} className="text-[var(--content-muted)]" /><span className="flex-1">Training progress</span><ChevronRight aria-hidden="true" size={16} /></Link>
      </div></section> : null}

      {!recoveryStage && routines.length ? <section aria-labelledby="saved-plans-title"><h2 id="saved-plans-title" className="mb-2 text-sm font-bold tracking-[-0.01em] text-[var(--content-primary)]">Saved plans</h2><div className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">{routines.map((routine, index) => <button key={routine.templateKey} type="button" disabled={disabled} aria-label={`Preview ${routine.name}`} onClick={() => setPreview(routine)} className={`flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${index ? 'border-t border-[var(--workout-rail)]' : ''}`}><span className="flex-1">{routine.name}</span><ChevronRight aria-hidden="true" size={16} /></button>)}</div></section> : null}

      {preview ? <section aria-label={t('workout.preview')} className="rounded-[14px] border border-[var(--action-primary)] bg-[var(--workout-surface)] p-4"><h2 className="text-lg font-bold text-[var(--content-primary)]">{preview.name}</h2><p className="mt-1 text-sm text-[var(--content-secondary)]">{preview.muscleSummary.map((muscle) => t(muscleLabelKey(muscle))).join(' · ')}</p><p className="mt-1 text-sm text-[var(--content-secondary)]">{t('workout.exercise_count', { n: preview.exercises.length })}</p>{preview.exercises.length ? <ul className="mt-3 space-y-1 text-sm text-[var(--content-primary)]">{preview.exercises.map((exercise) => <li key={exercise.exerciseId}>{exercise.exerciseName ?? exerciseNames.get(exercise.exerciseId) ?? exercise.exerciseId}</li>)}</ul> : null}<div className="mt-4 flex gap-2"><button type="button" onClick={() => choose({ name: preview.name, destination: 'build', input: { type: 'template', value: preview } })} className="btn-gold min-h-11 flex-1 rounded-xl px-4">{t('workout.use_template')}</button><button type="button" onClick={() => setPreview(null)} className="btn-ghost min-h-11 rounded-xl px-4">{t('general.cancel')}</button></div></section> : null}

      {recents.length ? <section aria-labelledby="recent-progress-title"><h2 id="recent-progress-title" className="mb-2 text-sm font-bold tracking-[-0.01em] text-[var(--content-primary)]">Recent progress</h2><ul className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">{recents.slice(0, 3).map((session, index) => <li key={session.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${index ? 'border-t border-[var(--workout-rail)]' : ''}`}><span className="truncate font-medium text-[var(--content-primary)]">{session.name ?? t('workout.title')}</span><time className="shrink-0 font-mono text-xs tabular-nums text-[var(--content-muted)]">{session.session_date}</time></li>)}</ul></section> : null}

      <ConfirmSheet open={Boolean(replacement)} title={t('workout.replace_choice_title')} message={replacement && workspace.state.draft ? t('workout.replace_choice_message', { current: workspace.state.draft.name || t('workout.title'), next: replacement.name }) : undefined} confirmLabel={t('workout.replace_choice_confirm')} cancelLabel={t('workout.replace_choice_cancel')} onCancel={() => setReplacement(null)} onConfirm={() => { if (replacement) finishChoice(replacement, true); }} />
    </main>
  );
}
