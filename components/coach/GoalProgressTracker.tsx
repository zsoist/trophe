'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface GoalProgressTrackerProps {
  goal: string;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export default memo(function GoalProgressTracker({
  goal,
  startValue,
  targetValue,
  currentValue,
  unit,
}: GoalProgressTrackerProps) {
  const range = targetValue - startValue;
  const progress = range !== 0 ? ((currentValue - startValue) / range) * 100 : 0;
  const clampedProgress = clamp(progress, 0, 100);
  const pct = Math.round(clampedProgress);

  // Milestone markers at 25%, 50%, 75%
  const milestones = [25, 50, 75];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-200 text-sm font-semibold">{goal}</h3>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            pct >= 100
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-[#D4A853]/20 text-[#D4A853]'
          }`}
        >
          {pct}% there
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: 'linear-gradient(90deg, #D4A853, #e8c875)',
          }}
        />
        {/* Milestone markers */}
        {milestones.map((m) => (
          <div
            key={m}
            className="absolute top-0 bottom-0 w-px bg-white/[0.15]"
            style={{ left: `${m}%` }}
          />
        ))}
      </div>

      {/* Values row */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-stone-500">
          {startValue} {unit}
        </span>
        <span className="text-[#D4A853] font-semibold">
          {currentValue} {unit}
        </span>
        <span className="text-stone-500">
          {targetValue} {unit}
        </span>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-[9px] text-stone-600 mt-0.5">
        <span>Start</span>
        <span>Current</span>
        <span>Target</span>
      </div>
    </motion.div>
  );
});
