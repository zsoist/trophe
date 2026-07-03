'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { AnimatedValue } from '@/components/ui/AnimatedValue';

interface WeekData {
  avgCalories: number;
  avgProtein: number;
  adherence: number;
  weight: number;
}

interface ProgressComparisonProps {
  thisWeek: WeekData;
  lastWeek: WeekData;
  /** Window labels — the data is a 14-day window vs the prior 14 days (Michael:
   *  body reacts ~2 weeks delayed, so week-vs-week is too noisy). */
  title?: string;
  currentLabel?: string;
  priorLabel?: string;
}

function DeltaBadge({ current, previous, unit }: { current: number; previous: number; unit: string }) {
  const diff = current - previous;
  if (diff === 0) return null;

  const isPositive = diff > 0;
  const sign = isPositive ? '+' : '';
  const color = isPositive ? 'text-green-400' : 'text-red-400';
  const arrow = isPositive ? '\u2191' : '\u2193';

  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {arrow} {sign}{Math.round(diff * 10) / 10}{unit}
    </span>
  );
}

const METRICS: Array<{
  key: keyof WeekData;
  label: string;
  unit: string;
  deltaUnit: string;
}> = [
  { key: 'avgCalories', label: 'Avg Calories', unit: '', deltaUnit: 'cal' },
  { key: 'avgProtein', label: 'Avg Protein', unit: 'g', deltaUnit: 'g' },
  { key: 'adherence', label: 'Adherence', unit: '%', deltaUnit: '%' },
  { key: 'weight', label: 'Weight', unit: 'kg', deltaUnit: 'kg' },
];

export default memo(function ProgressComparison({
  thisWeek,
  lastWeek,
  title = 'Last 14 days vs previous 14',
  currentLabel = 'Last 14d',
  priorLabel = 'Previous 14d',
}: ProgressComparisonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        {title}
      </h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-stone-500 uppercase tracking-wider mb-2">
        <span>{priorLabel}</span>
        <span>{currentLabel}</span>
      </div>

      <div className="flex flex-col gap-3">
        {METRICS.map((m, i) => (
          <motion.div
            key={m.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
          >
            <div className="text-stone-500 text-[10px] uppercase tracking-wider mb-1">
              {m.label}
            </div>
            <div className="grid grid-cols-2 gap-x-4 items-center">
              <div className="text-stone-400 text-sm font-medium">
                <AnimatedValue value={lastWeek[m.key]} grouped={false} />{m.unit}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-stone-100 text-sm font-bold">
                  <AnimatedValue value={thisWeek[m.key]} grouped={false} />{m.unit}
                </span>
                <DeltaBadge
                  current={thisWeek[m.key]}
                  previous={lastWeek[m.key]}
                  unit={m.deltaUnit}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
});
