'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import WorkoutEntryPanel from '@/components/workout/WorkoutEntryPanel';
import { RestDayCard, TodayProgramCard } from '@/components/workout/TodayProgramCard';
import { muscleLabelKey, WORKOUT_SPLITS } from '@/components/workout/muscle-groups';
import { useWorkoutWorkspace, type WorkoutDraftTemplateInput } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup, WorkoutSession } from '@/lib/types';
import { WORKOUT_ROUTES } from '@/lib/workout/workspace-routes';

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
  recents: WorkoutSession[];
  routines: WorkoutHomeTemplate[];
  disabled?: boolean;
}

function splitTemplate(key: string, exercises: Exercise[], name: string): WorkoutHomeTemplate | null {
  const split = WORKOUT_SPLITS.find((candidate) => candidate.key === key);
  if (!split) return null;
  const matches = split.muscles.length === 0
    ? exercises
    : exercises.filter((exercise) => split.muscles.includes(exercise.muscle_group));
  return {
    templateId: `split:${split.key}`,
    name,
    muscleSummary: split.muscles.length === 0 ? ['full_body'] : split.muscles,
    exercises: matches.slice(0, 6).map((exercise) => ({ exerciseId: exercise.id, targetSets: 3, targetReps: '8-12' })),
  };
}

export function WorkoutHome({
  exercises,
  program,
  programLoading = false,
  programError = false,
  recents,
  routines,
  disabled = false,
}: WorkoutHomeProps) {
  const router = useRouter();
  const { t } = useI18n();
  const workspace = useWorkoutWorkspace();
  const [preview, setPreview] = useState<WorkoutHomeTemplate | null>(null);
  const exerciseNames = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise.name])), [exercises]);

  const buildStrength = () => {
    workspace.createDraft({ name: t('workout.strength'), kind: 'strength' });
    router.push(WORKOUT_ROUTES.build);
  };

  const buildCardio = () => {
    workspace.createDraft({ name: t('workout.cardio'), kind: 'cardio' });
    router.push(WORKOUT_ROUTES.build);
  };

  const previewSplit = (key: string) => {
    const template = splitTemplate(key, exercises, t(`workout.split_${key}`));
    if (template) setPreview(template);
  };

  const confirmTemplate = (template: WorkoutHomeTemplate) => {
    workspace.createDraftFromTemplate(template);
    setPreview(null);
    router.push(WORKOUT_ROUTES.build);
  };

  const reviewProgram = (template: WorkoutHomeTemplate) => {
    workspace.createDraftFromTemplate(template);
    workspace.goToReview();
    router.push(WORKOUT_ROUTES.review);
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
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
              {preview.exercises.map((exercise) => <li key={exercise.exerciseId}>{exerciseNames.get(exercise.exerciseId) ?? exercise.exerciseId}</li>)}
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
          <div className="flex gap-2 overflow-x-auto pb-1">
            {routines.map((routine) => (
              <button key={routine.templateId} type="button" onClick={() => setPreview(routine)} className="min-h-11 shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 text-sm font-medium">
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
    </main>
  );
}
