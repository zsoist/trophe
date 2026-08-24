'use client';

import { Activity, Dumbbell } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { WORKOUT_SPLITS } from '@/components/workout/muscle-groups';

interface WorkoutEntryPanelProps {
  disabled: boolean;
  onStrength: () => void;
  onCardio: () => void;
  onSplit: (key: string) => void;
}

export default function WorkoutEntryPanel({ disabled, onStrength, onCardio, onSplit }: WorkoutEntryPanelProps) {
  const { t } = useI18n();

  return (
    <section className="space-y-5" aria-label={t('workout.build_choices')}>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onStrength}
          aria-label={t('workout.build_strength')}
          className="min-h-36 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        >
          <Dumbbell className="mb-7 text-[var(--action-primary)]" size={24} aria-hidden="true" />
          <strong className="block text-base text-[var(--content-primary)]">{t('workout.strength')}</strong>
          <small className="mt-1 block text-sm leading-5 text-[var(--content-secondary)]">{t('workout.strength_sub')}</small>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onCardio}
          aria-label={t('workout.build_cardio')}
          className="min-h-36 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        >
          <Activity className="mb-7 text-[var(--status-info-fg)]" size={24} aria-hidden="true" />
          <strong className="block text-base text-[var(--content-primary)]">{t('workout.cardio')}</strong>
          <small className="mt-1 block text-sm leading-5 text-[var(--content-secondary)]">{t('workout.cardio_sub')}</small>
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--content-secondary)]">
          {t('workout.templates')}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WORKOUT_SPLITS.map((split) => {
            const name = t(`workout.split_${split.key}`);
            return (
              <button
                type="button"
                key={split.key}
                disabled={disabled}
                onClick={() => onSplit(split.key)}
                aria-label={t('workout.preview_named', { name })}
                className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
