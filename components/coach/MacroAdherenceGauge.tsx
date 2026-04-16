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

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = {
    x: cx + r * Math.cos(((startAngle - 90) * Math.PI) / 180),
    y: cy + r * Math.sin(((startAngle - 90) * Math.PI) / 180),
  };
  const end = {
    x: cx + r * Math.cos(((endAngle - 90) * Math.PI) / 180),
    y: cy + r * Math.sin(((endAngle - 90) * Math.PI) / 180),
  };
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
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
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 flex flex-col items-center"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 self-start">
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
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Inner ring: calories (gold) */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={innerR}
            fill="none"
            stroke="#D4A853"
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
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Outer ring: protein (red) */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="none"
            stroke="#f87171"
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
            className="text-stone-100 text-2xl font-bold tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {avgPct}%
          </motion.span>
          <span className="text-stone-500 text-[10px]">today</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#D4A853]" />
          <span className="text-stone-400 text-[10px]">
            Cal {consumed.calories}/{targets.calories}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#f87171]" />
          <span className="text-stone-400 text-[10px]">
            Prot {consumed.protein}g/{targets.protein}g
          </span>
        </div>
      </div>
    </motion.div>
  );
});
