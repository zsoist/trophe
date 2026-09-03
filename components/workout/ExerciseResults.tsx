'use client';

import { Check, Info } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import { ExerciseMediaBadge } from './ExerciseMediaBadge';
import { exerciseDisplayName } from './muscle-groups';

export interface ExerciseResultsProps {
  exercises: Exercise[];
  lang: string;
  selectedIds: ReadonlySet<string>;
  onAdd: (exercise: Exercise) => void;
  onInfo?: (exercise: Exercise) => void;
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function ExerciseResults({ exercises, lang, selectedIds, onAdd, onInfo }: ExerciseResultsProps) {
  const { t } = useI18n();

  return (
    <div className="mt-5 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[0.875rem] border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      {exercises.map((exercise) => {
        const name = exerciseDisplayName(exercise, lang);
        const selected = selectedIds.has(exercise.id);
        const media = resolveExerciseMedia({
          name: exercise.name,
          equipment: exercise.equipment,
          muscleGroup: exercise.muscle_group,
        });
        const posterAlt = media.tier === 'verified-technique'
          ? `${name} technique poster`
          : `${name} anatomy reference`;

        return (
          <article
            key={exercise.id}
            data-testid={`exercise-result-${exercise.id}`}
            data-media-tier={media.tier}
            className="flex min-h-[5.5rem] items-center gap-2.5 px-2.5 py-2.5"
          >
            {/* These reviewed local posters are static list thumbnails, not decorative motion. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.posterSrc}
              alt={posterAlt}
              width={72}
              height={72}
              className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-[0.625rem] bg-[var(--workout-visual-surface)] object-contain"
            />

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.015em] text-[var(--content-primary)]">{name}</h3>
                {onInfo ? (
                  <button
                    type="button"
                    onClick={() => onInfo(exercise)}
                    aria-label={t('workout.picker_info_named', { name })}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[0.625rem] text-[var(--content-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                  >
                    <Info size={17} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onAdd(exercise)}
                  disabled={selected}
                  aria-label={selected ? t('workout.exercise_added_named', { name }) : t('workout.picker_add_named', { name })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-[0.625rem] bg-[var(--action-secondary)] px-2.5 text-sm font-semibold text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none"
                >
                  {selected ? <Check size={15} aria-hidden="true" /> : null}
                  <span className="hidden min-[360px]:inline">{selected ? t('workout.exercise_added') : t('workout.picker_add')}</span>
                </button>
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--content-muted)]">
                {exercise.equipment ? titleCase(exercise.equipment) : t('workout.picker_all_equipment')}
              </p>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-xs font-medium text-[var(--content-secondary)]">
                  {t('workout.info_primary')}
                </span>
                {media.tier === 'verified-technique' ? (
                  <span
                    className="exercise-media-badge exercise-media-badge--verified-technique"
                    title={t('workout.picker_exact_poster_detail')}
                  >
                    {t('workout.picker_exact_poster')}
                  </span>
                ) : <ExerciseMediaBadge media={media} />}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default ExerciseResults;
