'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Habit } from '@/lib/types';

export type AssignableHabit = Pick<Habit, 'id' | 'name_en' | 'emoji' | 'category' | 'cycle_days' | 'difficulty'>;

export function AssignHabitDialog({
  habits,
  onAssign,
  onClose,
}: {
  habits: AssignableHabit[];
  onAssign: (habit: AssignableHabit) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === dialogRef.current || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--surface-overlay)] p-4 sm:items-center">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-habit-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="safe-bottom glass-elevated max-h-[70vh] w-full max-w-md overflow-y-auto p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="assign-habit-title" className="font-semibold text-[var(--content-primary)]">Assign Habit</h3>
          <button
            aria-label="Close habit assignment"
            onClick={onClose}
            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-muted)] hover:text-[var(--content-secondary)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          {habits.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--content-muted)]">No habit templates found</p>
          ) : habits.map((habit) => (
            <button
              key={habit.id}
              aria-label={`Assign ${habit.name_en}`}
              onClick={() => onAssign(habit)}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <span className="text-xl">{habit.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--content-primary)]">{habit.name_en}</div>
                <div className="flex items-center gap-2 text-xs text-[var(--content-muted)]">
                  <span className="capitalize">{habit.category}</span><span>-</span><span>{habit.cycle_days}d cycle</span>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                habit.difficulty === 'beginner'
                  ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
                  : habit.difficulty === 'intermediate'
                    ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]'
                    : 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]'
              }`}>{habit.difficulty}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
