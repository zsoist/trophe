'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { WORKOUT_SPLITS } from '@/components/workout/muscle-groups';
import { MovementVisual } from '@/components/workout/MovementVisual';

interface WorkoutEntryPanelProps {
  disabled: boolean;
  onStrength: () => void;
  onCardio: () => void;
  onSplit: (key: string) => void;
}

export default function WorkoutEntryPanel({ disabled, onStrength, onCardio, onSplit }: WorkoutEntryPanelProps) {
  const { t } = useI18n();
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <section className="space-y-5" aria-label={t('workout.build_choices')}>
      <div className="workout-entry-panel__modes">
        <button
          type="button"
          disabled={disabled}
          onClick={onStrength}
          aria-label={t('workout.build_strength')}
          className="workout-mode-card workout-mode-card--strength focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <MovementVisual bodyArea="full-body" alt={t('workout.strength')} priority sizes="(max-width: 640px) 50vw, 320px" />
          <span className="workout-mode-card__scrim" aria-hidden="true" />
          <span className="workout-mode-card__copy">
            <strong>{t('workout.strength')}</strong>
            <small>{t('workout.strength_sub')}</small>
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onCardio}
          aria-label={t('workout.build_cardio')}
          className="workout-mode-card workout-mode-card--cardio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <MovementVisual bodyArea="cardio" alt={t('workout.cardio')} priority sizes="(max-width: 640px) 50vw, 320px" />
          <span className="workout-mode-card__scrim" aria-hidden="true" />
          <span className="workout-mode-card__copy">
            <strong>{t('workout.cardio')}</strong>
            <small>{t('workout.cardio_sub')}</small>
          </span>
        </button>
      </div>

      <div className="workout-quick-start">
        <button
          type="button"
          className="workout-quick-start__trigger"
          aria-expanded={templatesOpen}
          aria-controls="workout-template-options"
          onClick={() => setTemplatesOpen((open) => !open)}
        >
          <span>{t('workout.templates')}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {templatesOpen ? <div id="workout-template-options" className="workout-quick-start__options mt-3">
          {WORKOUT_SPLITS.map((split) => {
            const name = t(`workout.split_${split.key}`);
            return (
              <button
                type="button"
                key={split.key}
                disabled={disabled}
                onClick={() => onSplit(split.key)}
                aria-label={t('workout.preview_named', { name })}
                className="px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
              >
                {name}
              </button>
            );
          })}
        </div> : null}
      </div>
    </section>
  );
}
