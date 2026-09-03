'use client';

import { Dumbbell } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import { exerciseDisplayName } from './muscle-groups';

export interface WorkoutPlanTrayProps {
  exercises: Exercise[];
  selectedCount: number;
  lang: string;
  onReview: () => void;
}

const navClearance = 'calc(var(--client-shell-nav-base-height, 4.5rem) + max(env(safe-area-inset-bottom, 0px), var(--client-shell-nav-min-bottom-padding, 1rem)) + var(--client-shell-content-buffer, 0.625rem))';

export function WorkoutPlanTray({ exercises, selectedCount, lang, onReview }: WorkoutPlanTrayProps) {
  const { t } = useI18n();
  const countCopy = t(selectedCount === 1 ? 'workout.picker_selected_one' : 'workout.picker_selected_many', { n: selectedCount });
  const visibleExercises = exercises.slice(-3);
  const missingPosterCount = Math.min(3 - visibleExercises.length, Math.max(0, selectedCount - visibleExercises.length));

  return (
    <aside
      data-workout-plan-tray
      aria-label={countCopy}
      className="fixed inset-x-4 mx-auto flex min-h-[4.75rem] max-w-3xl items-center gap-3 rounded-[0.875rem] border border-[var(--border-default)] bg-[var(--surface-overlay)] px-3 py-2.5 shadow-[var(--shadow-medium)]"
      style={{ bottom: navClearance, zIndex: 'calc(var(--z-nav, 30) + 1)' }}
    >
      <div className="flex min-w-[3.25rem] shrink-0 -space-x-2" aria-hidden="true">
        {visibleExercises.map((exercise) => {
          const media = resolveExerciseMedia({
            name: exercise.name,
            equipment: exercise.equipment,
            muscleGroup: exercise.muscle_group,
          });
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={exercise.id}
              src={media.posterSrc}
              alt=""
              width={40}
              height={40}
              title={exerciseDisplayName(exercise, lang)}
              className="h-10 w-10 rounded-full border-2 border-[var(--surface-overlay)] bg-[var(--workout-visual-surface)] object-contain"
            />
          );
        })}
        {Array.from({ length: missingPosterCount }, (_, index) => (
          <span key={`missing-${index}`} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--surface-overlay)] bg-[var(--surface-raised)] text-[var(--content-muted)]">
            <Dumbbell size={15} />
          </span>
        ))}
      </div>
      <p aria-live="polite" className="min-w-0 flex-1 text-sm font-medium text-[var(--content-secondary)]">{countCopy}</p>
      <button
        type="button"
        onClick={onReview}
        className="min-h-12 shrink-0 rounded-xl bg-[var(--action-primary)] px-4 text-sm font-semibold text-[var(--action-on-primary)] transition-colors hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] motion-reduce:transition-none"
      >
        {t('workout.picker_review_plan')}
      </button>
    </aside>
  );
}

export default WorkoutPlanTray;
