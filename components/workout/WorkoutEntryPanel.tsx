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

export default function WorkoutEntryPanel({
  disabled,
  onStrength,
  onCardio,
  onSplit,
}: WorkoutEntryPanelProps) {
  const { t } = useI18n();
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  return (
    <section className="workout-entry-panel" aria-label="Start a workout">
      <div className="workout-entry-panel__modes">
        <button
          type="button"
          disabled={disabled}
          onClick={onStrength}
          className="workout-mode-card workout-mode-card--strength"
          aria-label="Start strength workout"
        >
          <MovementVisual bodyArea="full_body" alt="Athlete performing a strength movement" priority />
          <span className="workout-mode-card__scrim" aria-hidden="true" />
          <span className="workout-mode-card__copy">
            <strong>{t('workout.strength')}</strong>
            <small>{t('workout.strength_sub')}</small>
          </span>
        </button>

        <button
          type="button"
          onClick={onCardio}
          className="workout-mode-card workout-mode-card--cardio"
          aria-label="Log cardio workout"
        >
          <MovementVisual bodyArea="cardio" alt="Athlete running" priority />
          <span className="workout-mode-card__scrim" aria-hidden="true" />
          <span className="workout-mode-card__copy">
            <strong>{t('workout.cardio')}</strong>
            <small>{t('workout.cardio_sub')}</small>
          </span>
        </button>
      </div>

      <button
        type="button"
        className="workout-quick-start__trigger"
        aria-expanded={quickStartOpen}
        aria-controls="workout-quick-start-options"
        onClick={() => setQuickStartOpen((open) => !open)}
      >
        <span>{t('workout.quick_start')}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>

      {quickStartOpen ? (
        <div id="workout-quick-start-options" className="workout-quick-start__options">
          {WORKOUT_SPLITS.map((split) => (
            <button
              type="button"
              key={split.key}
              disabled={disabled}
              onClick={() => onSplit(split.key)}
            >
              {t(`workout.split_${split.key}`)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
