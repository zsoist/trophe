'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface MacroValues {
  calories: number;
  protein: number;
}

interface MacroAdherenceGaugeProps {
  consumed: MacroValues;
  targets: MacroValues;
}


export default memo(function MacroAdherenceGauge({
  consumed,
  targets,
}: MacroAdherenceGaugeProps) {
  const [animatedCalPct, setAnimatedCalPct] = useState(0);
  const [animatedProtPct, setAnimatedProtPct] = useState(0);

  const calPct = targets.calories > 0
    ? Math.min((consumed.calories / targets.calories) * 100, 120)
    : 0;
  const protPct = targets.protein > 0
    ? Math.min((consumed.protein / targets.protein) * 100, 120)
    : 0;
  const avgPct = Math.round((calPct + protPct) / 2);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedCalPct(calPct);
      setAnimatedProtPct(protPct);
    }, 100);
    return () => clearTimeout(timeout);
  }, [calPct, protPct]);

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = 48;
  const outerR = 62;
  const strokeWidth = 8;

  const innerCirc = 2 * Math.PI * innerR;
  const outerCirc = 2 * Math.PI * outerR;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-5 flex flex-col items-center"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-3 self-start">
        Macro Adherence
      </h3>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Inner ring track */}
          <circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={strokeWidth}
          />
          {/* Inner ring: calories (gold) */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke="var(--action-primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={innerCirc}
            initial={{ strokeDashoffset: innerCirc }}
            animate={{
              strokeDashoffset: innerCirc - (innerCirc * Math.min(animatedCalPct, 100)) / 100,
            }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* Outer ring track */}
          <circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={strokeWidth}
          />
          {/* Outer ring: protein (red) */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="none"
            stroke="var(--status-danger-fg)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={outerCirc}
            initial={{ strokeDashoffset: outerCirc }}
            animate={{
              strokeDashoffset: outerCirc - (outerCirc * Math.min(animatedProtPct, 100)) / 100,
            }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.15 }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-[var(--content-primary)] text-2xl font-bold tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {avgPct}%
          </motion.span>
          <span className="text-[var(--content-muted)] text-xs">today</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--action-primary)]" />
          <span className="text-[var(--content-secondary)] text-xs">
            Cal {consumed.calories}/{targets.calories}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--status-danger-fg)]" />
          <span className="text-[var(--content-secondary)] text-xs">
            Prot {consumed.protein}g/{targets.protein}g
          </span>
        </div>
      </div>
    </motion.div>
  );
});
