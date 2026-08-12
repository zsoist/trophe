'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface AutoMacroOptimizerProps {
  current: Macros;
  recommended: Macros;
  reason: string;
  onApply?: () => void;
}

const MACRO_KEYS: Array<{ key: keyof Macros; label: string; unit: string; color: string }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--action-primary)' },
  { key: 'protein', label: 'Protein', unit: 'g', color: 'var(--status-danger-fg)' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: 'var(--status-info-fg)' },
  { key: 'fat', label: 'Fat', unit: 'g', color: 'var(--data-fat)' },
];

export default memo(function AutoMacroOptimizer({
  current,
  recommended,
  reason,
  onApply,
}: AutoMacroOptimizerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider">
          Macro Optimization
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--action-primary)]/10 text-[var(--action-primary)] font-medium">
          AI Suggestion
        </span>
      </div>

      <p className="text-[var(--content-secondary)] text-xs mb-4 leading-relaxed">{reason}</p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-0 mb-1">
        <span className="text-[var(--content-muted)] text-xs uppercase tracking-wider">Current</span>
        <span className="text-[var(--action-primary)] text-xs uppercase tracking-wider font-medium">
          Recommended
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {MACRO_KEYS.map((m, i) => {
          const diff = recommended[m.key] - current[m.key];
          const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '=';
          const arrowColor = diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-[var(--content-muted)]';

          return (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div className="text-[var(--content-muted)] text-xs mb-0.5">{m.label}</div>
              <div className="grid grid-cols-2 gap-x-6 items-center">
                <span className="text-[var(--content-secondary)] text-sm tabular-nums">
                  {current[m.key]}{m.unit}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: m.color }}
                  >
                    {recommended[m.key]}{m.unit}
                  </span>
                  <span className={`text-xs font-medium ${arrowColor}`}>
                    {arrow} {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}` : ''}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {onApply && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={onApply}
          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] mt-4 w-full py-2.5 rounded-xl bg-[var(--action-primary)]/15 border border-[var(--action-primary)]/20 text-[var(--action-primary)] text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-[var(--action-primary)]/25 active:bg-[var(--action-primary)]/30"
        >
          Apply Recommendations
        </motion.button>
      )}
    </motion.div>
  );
});
