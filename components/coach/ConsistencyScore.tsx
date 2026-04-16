'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ConsistencyScoreProps {
  daysLogged: number;
  totalDays: number;
  avgMealScore: number;
  habitAdherence: number;
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#D4A853';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}

export default memo(function ConsistencyScore({
  daysLogged,
  totalDays,
  avgMealScore,
  habitAdherence,
}: ConsistencyScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  const loggedPct = totalDays > 0 ? (daysLogged / totalDays) * 100 : 0;
  const score = Math.round(loggedPct * 0.4 + avgMealScore * 0.3 + habitAdherence * 0.3);
  const clampedScore = Math.min(Math.max(score, 0), 100);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedScore(Math.round(eased * clampedScore));
      if (p < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clampedScore]);

  const color = getScoreColor(clampedScore);
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 54;
  const circ = 2 * Math.PI * r;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 flex flex-col items-center"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 self-start">
        Consistency Score
      </h3>

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={10}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{
              strokeDashoffset: circ - (circ * clampedScore) / 100,
            }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-bold tabular-nums"
            style={{ color }}
          >
            {animatedScore}
          </span>
          <span className="text-stone-500 text-[10px]">/ 100</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3 mt-3 w-full">
        {[
          { label: 'Logging', value: `${Math.round(loggedPct)}%`, weight: '40%' },
          { label: 'Meals', value: `${Math.round(avgMealScore)}`, weight: '30%' },
          { label: 'Habits', value: `${Math.round(habitAdherence)}%`, weight: '30%' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-stone-200 text-xs font-medium tabular-nums">{item.value}</p>
            <p className="text-stone-600 text-[9px]">
              {item.label} ({item.weight})
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
});
