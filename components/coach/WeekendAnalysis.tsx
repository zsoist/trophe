'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface PeriodData {
  avgCalories: number;
  avgProtein: number;
  mealsPerDay: number;
}

interface WeekendAnalysisProps {
  weekday: PeriodData;
  weekend: PeriodData;
}

const METRICS: Array<{
  key: keyof PeriodData;
  label: string;
  unit: string;
  higher_is_better: boolean;
}> = [
  { key: 'avgCalories', label: 'Avg Calories', unit: 'kcal', higher_is_better: false },
  { key: 'avgProtein', label: 'Avg Protein', unit: 'g', higher_is_better: true },
  { key: 'mealsPerDay', label: 'Meals/Day', unit: '', higher_is_better: true },
];

export default memo(function WeekendAnalysis({
  weekday,
  weekend,
}: WeekendAnalysisProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-4">
        Weekday vs Weekend
      </h3>

      <div className="flex flex-col gap-4">
        {METRICS.map((m, i) => {
          const wdVal = weekday[m.key];
          const weVal = weekend[m.key];
          const maxVal = Math.max(wdVal, weVal, 1);

          const dropPct = wdVal > 0
            ? ((weVal - wdVal) / wdVal) * 100
            : 0;
          const isSignificantDrop = m.higher_is_better
            ? dropPct < -20
            : dropPct > 20;

          return (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[var(--content-secondary)] text-xs uppercase tracking-wider">
                  {m.label}
                </span>
                {isSignificantDrop && (
                  <span className="text-xs text-red-400 font-medium">
                    {Math.round(Math.abs(dropPct))}% {m.higher_is_better ? 'drop' : 'spike'}
                  </span>
                )}
              </div>

              {/* Side-by-side bars */}
              <div className="flex flex-col gap-1">
                {/* Weekday */}
                <div className="flex items-center gap-2">
                  <span className="text-[var(--content-muted)] text-xs w-8 text-right">WD</span>
                  <div className="flex-1 h-4 bg-[var(--surface-hover)] rounded-full overflow-hidden relative">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-[var(--action-primary)]/60"
                      initial={{ width: 0 }}
                      animate={{ width: `${(wdVal / maxVal) * 100}%` }}
                      transition={{ delay: i * 0.08 + 0.2, duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[var(--content-secondary)] text-xs tabular-nums w-14 text-right">
                    {Math.round(wdVal)}{m.unit}
                  </span>
                </div>

                {/* Weekend */}
                <div className="flex items-center gap-2">
                  <span className="text-[var(--content-muted)] text-xs w-8 text-right">WE</span>
                  <div className="flex-1 h-4 bg-[var(--surface-hover)] rounded-full overflow-hidden relative">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        backgroundColor: isSignificantDrop
                          ? 'var(--status-danger-border)'
                          : 'var(--status-warning-border)',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(weVal / maxVal) * 100}%` }}
                      transition={{ delay: i * 0.08 + 0.3, duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[var(--content-secondary)] text-xs tabular-nums w-14 text-right">
                    {Math.round(weVal)}{m.unit}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
});
