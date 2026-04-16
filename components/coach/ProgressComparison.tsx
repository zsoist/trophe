'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface WeekData {
  avgCalories: number;
  avgProtein: number;
  adherence: number;
  weight: number;
}

interface ProgressComparisonProps {
  thisWeek: WeekData;
  lastWeek: WeekData;
}

function AnimatedNumber({
  value,
  duration = 900,
}: {
  value: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = prevRef.current;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (value - start) * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return <span className="tabular-nums">{Math.round(display)}</span>;
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
}: ProgressComparisonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        This Week vs Last Week
      </h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-stone-500 uppercase tracking-wider mb-2">
        <span>Last Week</span>
        <span>This Week</span>
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
                <AnimatedNumber value={lastWeek[m.key]} />{m.unit}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-stone-100 text-sm font-bold">
                  <AnimatedNumber value={thisWeek[m.key]} />{m.unit}
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
