'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { REST_CHOICES } from '@/lib/workout/rest-targets';

/**
 * Per-exercise rest-duration picker. Purely presentational: the caller owns the
 * canonical value and the persistence attempt (see `useRestTarget`). Rendered as
 * a labelled radiogroup so a screen reader hears the exercise name (identity)
 * plus the checked duration. AG2 restyles through the class names, not the
 * semantics below (radiogroup + `aria-checked` + roving tabindex are the
 * contract).
 */
export interface RestTargetControlProps {
  /** Current effective countdown target in seconds. */
  value: number;
  /** Exercise display name — used only for the accessible group label. */
  exerciseName: string;
  choices?: readonly number[];
  disabled?: boolean;
  /** True when the last selection could not be stored; the value is unchanged. */
  storageFailed?: boolean;
  onSelect: (seconds: number) => void;
}

export function RestTargetControl({
  value,
  exerciseName,
  choices = REST_CHOICES,
  disabled = false,
  storageFailed = false,
  onSelect,
}: RestTargetControlProps) {
  const { t } = useI18n();
  const groupRef = useRef<HTMLDivElement>(null);
  // Roving tabindex needs exactly one reachable radio. The effective value can
  // now come from a plan prescription that is not one of REST_CHOICES (e.g. 100s),
  // so fall back to the first radio for keyboard entry instead of leaving the
  // whole radiogroup unreachable.
  const selectedIndex = choices.indexOf(value);
  const rovingIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const moveFocus = (index: number) => {
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const last = choices.length - 1;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    onSelect(choices[next]);
    moveFocus(next);
  };

  return (
    <div className="mt-3">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t('workout.rest_seconds_named', { name: exerciseName })}
        className="flex flex-wrap items-center gap-1.5"
      >
        <span aria-hidden="true" className="mr-0.5 text-xs font-medium text-[var(--content-muted)]">
          {t('workout.rest_target')}
        </span>
        {choices.map((seconds, index) => {
          const selected = seconds === value;
          return (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${seconds}s`}
              tabIndex={index === rovingIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelect(seconds)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`${selected ? 'btn-gold' : 'btn-ghost'} inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 font-mono text-sm tabular-nums disabled:opacity-50`}
            >
              {seconds}s
            </button>
          );
        })}
      </div>
      {storageFailed ? (
        <p role="status" className="mt-1 text-xs text-[var(--status-warning-fg)]">
          {t('workout.save_failed')}
        </p>
      ) : null}
    </div>
  );
}
