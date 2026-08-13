'use client';

import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import { useCoachDialogFocus } from '@/components/coach/useCoachDialogFocus';

// ═══════════════════════════════════════════════
// Keyboard Shortcuts Modal
// ═══════════════════════════════════════════════

interface Shortcut {
  key: string;
  description: string;
}

const shortcuts: Shortcut[] = [
  { key: 'N', description: 'Focus search input' },
  { key: '/', description: 'Focus search input' },
  { key: '1-9', description: 'Jump to client by index' },
  { key: '?', description: 'Toggle this shortcuts panel' },
  { key: 'Esc', description: 'Close modal / clear search' },
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useCoachDialogFocus(true, onClose, dialogRef);

  return (
    <motion.div
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reducedMotion ? 1 : 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        initial={reducedMotion ? { opacity: 1 } : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reducedMotion ? { opacity: 1 } : { scale: 0.9, opacity: 0 }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="glass-elevated p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-[var(--action-primary)]" />
            <h2 id="shortcuts-title" className="text-lg font-semibold text-[var(--content-primary)]">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-[var(--content-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="text-sm text-[var(--content-secondary)]">{s.description}</span>
              <kbd className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-[var(--surface-2)] text-[var(--action-primary)] border border-[var(--border-default)] min-w-[32px] text-center">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--content-muted)] mt-4 text-center">
          Shortcuts are active when no input is focused
        </p>
      </motion.div>
    </motion.div>
  );
}
