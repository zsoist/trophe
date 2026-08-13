'use client';

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface QuickActionsBarProps {
  onAssignHabit: () => void;
  onSetMacros: () => void;
  onAddNote: () => void;
  onExport: () => void;
}

const ACTIONS = [
  {
    key: 'habit',
    label: 'Habit',
    handler: 'onAssignHabit' as const,
    icon: (
      <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    key: 'macros',
    label: 'Macros',
    handler: 'onSetMacros' as const,
    icon: (
      <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={3} />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    key: 'note',
    label: 'Note',
    handler: 'onAddNote' as const,
    icon: (
      <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1={16} y1={13} x2={8} y2={13} />
        <line x1={16} y1={17} x2={8} y2={17} />
      </svg>
    ),
  },
  {
    key: 'export',
    label: 'Export',
    handler: 'onExport' as const,
    icon: (
      <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1={12} y1={15} x2={12} y2={3} />
      </svg>
    ),
  },
];

export default memo(function QuickActionsBar(props: QuickActionsBarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      className="w-full max-w-lg px-3 sm:px-0"
    >
      <div className="flex items-stretch justify-between gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1.5 shadow-lg">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={props[action.handler]}
            className="min-h-11 min-w-11 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[var(--accent-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
          >
            {action.icon}
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
});
