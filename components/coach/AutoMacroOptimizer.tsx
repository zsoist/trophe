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
  { key: 'calories', label: 'Calories', unit: 'kcal', color: '#D4A853' },
  { key: 'protein', label: 'Protein', unit: 'g', color: '#f87171' },
  { key: 'carbs', label: 'Carbs', unit: 'g', color: '#60a5fa' },
  { key: 'fat', label: 'Fat', unit: 'g', color: '#a78bfa' },
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
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Macro Optimization
        </h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#D4A853]/10 text-[#D4A853] font-medium">
          AI Suggestion
        </span>
      </div>

      <p className="text-stone-400 text-xs mb-4 leading-relaxed">{reason}</p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-0 mb-1">
        <span className="text-stone-500 text-[10px] uppercase tracking-wider">Current</span>
        <span className="text-[#D4A853] text-[10px] uppercase tracking-wider font-medium">
          Recommended
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {MACRO_KEYS.map((m, i) => {
          const diff = recommended[m.key] - current[m.key];
          const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : '=';
          const arrowColor = diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-stone-500';

          return (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div className="text-stone-500 text-[10px] mb-0.5">{m.label}</div>
              <div className="grid grid-cols-2 gap-x-6 items-center">
                <span className="text-stone-400 text-sm tabular-nums">
                  {current[m.key]}{m.unit}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: m.color }}
                  >
                    {recommended[m.key]}{m.unit}
                  </span>
                  <span className={`text-[10px] font-medium ${arrowColor}`}>
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
          className="mt-4 w-full py-2.5 rounded-xl bg-[#D4A853]/15 border border-[#D4A853]/20 text-[#D4A853] text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-[#D4A853]/25 active:bg-[#D4A853]/30"
        >
          Apply Recommendations
        </motion.button>
      )}
    </motion.div>
  );
});
