'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import WorkoutEntryPanel from '@/components/workout/WorkoutEntryPanel';
import { RestDayCard, TodayProgramCard } from '@/components/workout/TodayProgramCard';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { muscleLabelKey, WORKOUT_SPLITS } from '@/components/workout/muscle-groups';
import { useWorkoutWorkspace, type WorkoutDraftTemplateInput } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup, WorkoutSession } from '@/lib/types';
import type { WorkoutKind } from '@/lib/workout/workspace-state';
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
  programLoading?: boolean;
  programError?: boolean;
  supportError?: boolean;
  recents: WorkoutSession[];
  routines: WorkoutHomeTemplate[];
  disabled?: boolean;
}

type ReplacementChoice = {
  name: string;
  destination: 'build' | 'review';
  input:
    | { type: 'draft'; value: { name: string; kind: WorkoutKind } }
    | { type: 'template'; value: WorkoutHomeTemplate };
};

function splitTemplate(key: string, exercises: Exercise[], name: string): WorkoutHomeTemplate | null {
  const split = WORKOUT_SPLITS.find((candidate) => candidate.key === key);
  if (!split) return null;
  const matches = split.muscles.length === 0
    ? exercises
    : exercises.filter((exercise) => split.muscles.includes(exercise.muscle_group));
  return {
    templateKey: `split:${split.key}`,
    templateId: null,
    name,
    muscleSummary: split.muscles.length === 0 ? ['full_body'] : split.muscles,
    exercises: matches.slice(0, 6).map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      muscleGroup: exercise.muscle_group,
      targetSets: 3,
      targetReps: '8-12',
    })),
  };
}

export function WorkoutHome({
  exercises,
  program,
  programLoading = false,
  programError = false,
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
  const recoveryAction = workspace.state.stage === 'completed'
    ? t('workout.view_completed_summary')
    : workspace.state.stage === 'live' || workspace.state.stage === 'paused' || workspace.state.stage === 'finishing'
      ? t('workout.continue_active')
      : null;
  const hasDraft = (workspace.state.stage === 'draft' || workspace.state.stage === 'review') && Boolean(workspace.state.draft);

  const finishChoice = (choice: ReplacementChoice, replace: boolean) => {
    if (choice.input.type === 'template') {
      if (replace) workspace.replaceDraftFromTemplate(choice.input.value);
      else workspace.createDraftFromTemplate(choice.input.value);
    } else if (replace) {
      workspace.replaceDraft(choice.input.value);
    } else {
      workspace.createDraft(choice.input.value);
    }
    if (choice.destination === 'review') workspace.goToReview();
    setReplacement(null);
    setPreview(null);
    pushWorkoutRoute(router, choice.destination === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build);
  };

  const choose = (choice: ReplacementChoice) => {
    if (hasDraft) setReplacement(choice);
    else finishChoice(choice, false);
  };

  const buildStrength = () => {
    choose({ name: t('workout.strength'), destination: 'build', input: { type: 'draft', value: { name: t('workout.strength'), kind: 'strength' } } });
  };

  const buildCardio = () => {
    choose({ name: t('workout.cardio'), destination: 'build', input: { type: 'draft', value: { name: t('workout.cardio'), kind: 'cardio' } } });
  };

  const previewSplit = (key: string) => {
    const template = splitTemplate(key, exercises, t(`workout.split_${key}`));
    if (template) setPreview(template);
  };

  const confirmTemplate = (template: WorkoutHomeTemplate) => {
    choose({ name: template.name, destination: 'build', input: { type: 'template', value: template } });
  };

  const reviewProgram = (template: WorkoutHomeTemplate) => {
    choose({ name: template.name, destination: 'review', input: { type: 'template', value: template } });
  };

  if (recoveryAction) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5">
        <section className="rounded-2xl border border-[var(--action-primary)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-low)]">
          <p className="text-sm text-[var(--content-secondary)]">
            {workspace.state.stage === 'completed' ? t('workout.completed_message') : t('workout.resume_current_workout')}
          </p>
          {workspace.state.draft?.name ? <h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name}</h2> : null}
          <button
            type="button"
            onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.live)}
            className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold"
          >
            {recoveryAction}
          </button>
        </section>
      </main>
    );
  }

  if (hasDraft && workspace.state.retrospectiveRequest && workspace.state.draft) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5">
        <section className="rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-5">
          <p className="text-sm leading-6 text-[var(--content-primary)]">{t('workout.retrospective_request_locked')}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name}</h2>
          <button
            type="button"
            disabled={workspace.retrospectiveSaving}
            onClick={() => void workspace.retryRetrospective().then((ok) => { if (ok) pushWorkoutRoute(router, WORKOUT_ROUTES.live); })}
            className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold disabled:opacity-50"
          >
            {workspace.retrospectiveSaving ? t('workout.saving') : t('workout.retry_same_save')}
          </button>
        </section>
      </main>
    );
  }

  if (hasDraft && workspace.state.startRequest && workspace.state.draft) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-5">
        <section className="rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-5">
          <p className="text-sm leading-6 text-[var(--content-primary)]">{t('workout.start_request_locked')}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name}</h2>
          <button type="button" onClick={() => pushWorkoutRoute(router, WORKOUT_ROUTES.review)} className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold">
            {t('workout.continue_review')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      {hasDraft && workspace.state.draft ? (
        <section className="rounded-2xl border border-[var(--action-primary)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-low)]">
          <p className="text-sm text-[var(--content-secondary)]">{t('workout.draft_waiting')}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--content-primary)]">{workspace.state.draft.name || t('workout.title')}</h2>
          <button
            type="button"
            onClick={() => pushWorkoutRoute(router, workspace.state.stage === 'review' ? WORKOUT_ROUTES.review : WORKOUT_ROUTES.build)}
            className="btn-gold mt-4 min-h-11 w-full rounded-xl px-4 font-semibold"
          >
            {t(workspace.state.stage === 'review' ? 'workout.continue_review' : 'workout.continue_editing')}
          </button>
        </section>
      ) : null}
      {programLoading ? (
        <div role="status" aria-label={t('workout.loading_program')} data-loading-skeleton className="h-36 animate-pulse rounded-2xl bg-[var(--surface-subtle)]" />
      ) : programError ? (
        <div role="alert" className="rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
          {t('workout.program_load_failed')}
        </div>
      ) : program?.todayTemplate ? (
        <TodayProgramCard
          programName={program.programName}
          template={program.todayTemplate}
          alsoToday={program.alsoToday}
          onReview={reviewProgram}
          disabled={disabled}
        />
      ) : program ? (
        <RestDayCard
          programName={program.programName}
          nextWeekday={program.nextWeekday ?? null}
          nextTemplateName={program.nextTemplateName ?? null}
          onTrainAnyway={buildStrength}
          disabled={disabled}
        />
      ) : null}

      {supportError ? (
        <div role="alert" className="rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--content-primary)]">
          {t('workout.support_data_load_failed')}
        </div>
      ) : null}

      <WorkoutEntryPanel disabled={disabled} onStrength={buildStrength} onCardio={buildCardio} onSplit={previewSplit} />

      {preview ? (
        <section aria-label={t('workout.preview')} className="rounded-2xl border border-[var(--action-primary)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--action-primary)]">{t('workout.preview')}</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--content-primary)]">{preview.name}</h2>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            {preview.muscleSummary.map((muscle) => t(muscleLabelKey(muscle))).join(' · ')}
          </p>
          <p className="mt-1 text-sm text-[var(--content-secondary)]">{t('workout.exercise_count', { n: preview.exercises.length })}</p>
          {preview.exercises.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-[var(--content-primary)]">
              {preview.exercises.map((exercise) => <li key={exercise.exerciseId}>{exercise.exerciseName ?? exerciseNames.get(exercise.exerciseId) ?? exercise.exerciseId}</li>)}
            </ul>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => confirmTemplate(preview)} className="btn-gold min-h-11 flex-1 rounded-xl px-4">
              {t('workout.use_template')}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="btn-ghost min-h-11 rounded-xl px-4">
              {t('general.cancel')}
            </button>
          </div>
        </section>
      ) : null}

      {routines.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--content-secondary)]">{t('workout.my_routines')}</h2>
          <div className="grid grid-cols-1 gap-2 min-[375px]:grid-cols-2">
            {routines.map((routine) => (
              <button key={routine.templateKey} type="button" onClick={() => setPreview(routine)} className="min-h-11 min-w-0 max-w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-2 text-left text-sm font-medium break-words">
                {routine.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recents.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--content-secondary)]">{t('workout.recent')}</h2>
            <Link href="/dashboard/workout/history" aria-label={t('workout.history')} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t('workout.history')}</Link>
          </div>
          <ul className="space-y-2">
            {recents.slice(0, 3).map((session) => (
              <li key={session.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-3 text-sm">
                <span className="font-medium text-[var(--content-primary)]">{session.name ?? t('workout.title')}</span>
                <span className="ml-2 text-[var(--content-muted)]">{session.session_date}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ConfirmSheet
        open={Boolean(replacement)}
        title={t('workout.replace_choice_title')}
        message={replacement && workspace.state.draft
          ? t('workout.replace_choice_message', { current: workspace.state.draft.name || t('workout.title'), next: replacement.name })
          : undefined}
        confirmLabel={t('workout.replace_choice_confirm')}
        cancelLabel={t('workout.replace_choice_cancel')}
        onCancel={() => setReplacement(null)}
        onConfirm={() => { if (replacement) finishChoice(replacement, true); }}
      />
    </main>
  );
}
