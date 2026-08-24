'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Exercise } from '@/lib/types';
import { exerciseDisplayName } from './muscle-groups';
import { ExerciseDetail } from './ExerciseDetail';

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** Compatibility modal for live-session callers; routed screens use ExerciseDetail directly. */
export default function ExerciseInfoSheet({
  exercise,
  userId,
  onClose,
  onAdd,
  isAdded,
}: {
  exercise: Exercise;
  userId: string | null;
  onClose: () => void;
  onAdd?: (exercise: Exercise) => void;
  isAdded?: boolean;
}) {
  const { t, lang } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const name = exerciseDisplayName(exercise, lang);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center bg-[var(--surface-overlay)]"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        onKeyDown={(event) => trapFocus(event, dialogRef.current)}
        initial={reducedMotion ? false : { y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducedMotion ? undefined : { y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="safe-bottom max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-[var(--canvas)] px-4 pt-3 outline-none sm:px-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex justify-end bg-[var(--canvas)]/95 py-1 backdrop-blur-xl">
          <button type="button" onClick={onClose} aria-label={t('workout.custom_cancel')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--action-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ExerciseDetail exercise={exercise} userId={userId} onAdd={onAdd} isAdded={isAdded} />
      </motion.div>
    </motion.div>
  );
}

export { ExerciseDetail } from './ExerciseDetail';
