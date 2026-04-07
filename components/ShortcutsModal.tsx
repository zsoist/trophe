'use client';

import { motion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="glass-elevated p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-[#D4A853]" />
            <h2 className="text-lg font-semibold text-stone-100">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-sm text-stone-300">{s.description}</span>
              <kbd className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-stone-800/80 text-[#D4A853] border border-stone-700/50 min-w-[32px] text-center">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-stone-600 mt-4 text-center">
          Shortcuts are active when no input is focused
        </p>
      </motion.div>
    </motion.div>
  );
}
