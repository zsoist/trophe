'use client';

import { Pause, Play } from 'lucide-react';
import type React from 'react';
import { ExerciseMotion } from '@/components/workout/ExerciseMotion';
import { useI18n } from '@/lib/i18n';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import type { Exercise } from '@/lib/types';

interface LiveExerciseStageProps {
  exercise: Pick<Exercise, 'id' | 'name' | 'equipment' | 'muscle_group'>;
  position: number;
  total: number;
  targetSets: number;
  targetReps: string;
  previous: string;
  nextExerciseName?: string;
  paused: boolean;
  onPause(): void;
  onResume(): void;
  children: React.ReactNode;
}

/** The only expanded exercise surface during a strength session. */
export function LiveExerciseStage({
  exercise, position, total, targetSets, targetReps, previous, nextExerciseName,
  paused, onPause, onResume, children,
}: LiveExerciseStageProps) {
  const { t } = useI18n();
  const media = resolveExerciseMedia({
    name: exercise.name,
    equipment: exercise.equipment,
    muscleGroup: exercise.muscle_group,
  });
  const mediaAlt = `${exercise.name} ${t('workout.technique_media')}`;

  return (
    <section aria-labelledby="live-exercise-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--content-secondary)]">{t('workout.exercise_position', { current: position, total })}</p>
          <h1 id="live-exercise-title" className="mt-1 text-2xl font-bold tracking-[-0.02em] text-[var(--content-primary)]">{exercise.name}</h1>
        </div>
        <button type="button" onClick={paused ? onResume : onPause} className="btn-ghost inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3" aria-label={t(paused ? 'workout.resume_workout' : 'workout.pause_workout')}>
          {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
          <span className="hidden sm:inline">{t(paused ? 'workout.resume' : 'workout.pause')}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-[var(--surface-subtle)]">
        <ExerciseMotion media={media} alt={mediaAlt} autoplay={!paused} playbackDisabled={paused} className="live-exercise-motion" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--border-subtle)] py-3 text-sm">
        <div><dt className="text-[var(--content-muted)]">{t('workout.current_target_label')}</dt><dd className="mt-0.5 font-semibold text-[var(--content-primary)]">{t('workout.current_target', { sets: targetSets, reps: targetReps })}</dd></div>
        <div><dt className="text-[var(--content-muted)]">{t('workout.previous_values_label')}</dt><dd className="mt-0.5 font-semibold text-[var(--content-primary)]">{previous}</dd></div>
      </dl>

      {children}

      {nextExerciseName ? <p className="border-t border-[var(--border-subtle)] pt-3 text-sm text-[var(--content-secondary)]">{t('workout.up_next_named', { name: nextExerciseName })}</p> : null}
    </section>
  );
}
