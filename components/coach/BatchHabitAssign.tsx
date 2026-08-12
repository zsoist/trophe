'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Check, ChevronDown } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  selected: boolean;
}

interface Habit {
  id: string;
  name: string;
  emoji: string;
}

interface BatchHabitAssignProps {
  clients: Client[];
  habits: Habit[];
  onAssign: (habitId: string, clientIds: string[]) => void;
  onClose: () => void;
}

export default memo(function BatchHabitAssign({
  clients: initialClients,
  habits,
  onAssign,
  onClose,
}: BatchHabitAssignProps) {
  const [clientState, setClientState] = useState<Client[]>(initialClients);
  const [selectedHabitId, setSelectedHabitId] = useState<string>(habits[0]?.id ?? '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const selectedCount = clientState.filter((c) => c.selected).length;
  const selectedHabit = habits.find((h) => h.id === selectedHabitId);

  const toggleClient = useCallback((id: string) => {
    setClientState((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allSelected = clientState.every((c) => c.selected);
    setClientState((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  }, [clientState]);

  const handleAssign = useCallback(() => {
    if (!selectedHabitId || selectedCount === 0) return;
    const selectedIds = clientState.filter((c) => c.selected).map((c) => c.id);
    onAssign(selectedHabitId, selectedIds);
  }, [selectedHabitId, selectedCount, clientState, onAssign]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeRef.current?.focus();

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [onClose]);

  const containFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    if (controls.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--canvas)]/80 p-4 backdrop-blur-sm sm:items-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-habit-title"
          tabIndex={-1}
          onKeyDown={containFocus}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, type: 'spring', stiffness: 300, damping: 30 }}
          className="safe-bottom max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border-default)] bg-[var(--surface-overlay)] shadow-[var(--shadow-high)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
            <h2 id="batch-habit-title" className="text-sm font-semibold text-[var(--content-primary)]">Assign Habit</h2>
            <button
              ref={closeRef}
              aria-label="Close habit assignment"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--content-muted)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Habit selector */}
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--content-muted)]">
                Habit
              </span>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="listbox"
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <span>
                    {selectedHabit ? `${selectedHabit.emoji} ${selectedHabit.name}` : 'Select habit...'}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`text-[var(--content-muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      role="listbox"
                      aria-label="Habit options"
                      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-overlay)] shadow-[var(--shadow-high)]"
                    >
                      {habits.map((habit) => (
                        <button
                          key={habit.id}
                          role="option"
                          aria-selected={habit.id === selectedHabitId}
                          onClick={() => {
                            setSelectedHabitId(habit.id);
                            setDropdownOpen(false);
                          }}
                          className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
                            habit.id === selectedHabitId ? 'bg-[var(--surface-active)] text-[var(--action-primary)]' : 'text-[var(--content-secondary)]'
                          }`}
                        >
                          <span>{habit.emoji}</span>
                          <span>{habit.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Client list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--content-muted)]">
                  Clients ({selectedCount}/{clientState.length})
                </span>
                <button
                  onClick={toggleAll}
                  className="min-h-11 rounded-lg px-2 text-xs text-[var(--action-primary)] transition-colors hover:text-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {clientState.every((c) => c.selected) ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {clientState.map((client, i) => (
                  <motion.button
                    key={client.id}
                    initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => toggleClient(client.id)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                      client.selected ? 'bg-[var(--surface-active)]' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors ${
                        client.selected
                          ? 'border border-[var(--action-primary)] bg-[var(--action-primary)]'
                          : 'border border-[var(--border-strong)] bg-transparent'
                      }`}
                    >
                      {client.selected && <Check aria-hidden="true" size={10} className="text-[var(--action-on-primary)]" />}
                    </div>
                    <span className="text-sm text-[var(--content-primary)]">{client.name}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-[var(--border-subtle)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl bg-[var(--action-secondary)] px-4 py-2.5 text-sm font-medium text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={selectedCount === 0 || !selectedHabitId}
              className="min-h-11 flex-1 rounded-xl bg-[var(--action-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--action-on-primary)] transition-colors hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Assign to {selectedCount} client{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
