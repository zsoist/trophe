'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';

interface Measurement {
  date: string;
  weight: number | null;
  bodyFat: number | null;
}

interface MeasurementChartProps {
  measurements: Measurement[];
}

function buildPath(
  points: Array<{ x: number; y: number }>,
): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export default memo(function MeasurementChart({ measurements }: MeasurementChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (measurements.length < 2) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
          Measurements
        </h3>
        <p className="text-stone-500 text-xs text-center py-4">Not enough data</p>
      </motion.div>
    );
  }

  const w = 320;
  const h = 140;
  const padX = 30;
  const padY = 20;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;

  const weights = measurements.map((m) => m.weight).filter((v): v is number => v !== null);
  const fats = measurements.map((m) => m.bodyFat).filter((v): v is number => v !== null);

  const wMin = Math.min(...weights) - 1;
  const wMax = Math.max(...weights) + 1;
  const fMin = fats.length > 0 ? Math.min(...fats) - 2 : 0;
  const fMax = fats.length > 0 ? Math.max(...fats) + 2 : 40;

  const weightPoints: Array<{ x: number; y: number; date: string; val: number }> = [];
  const fatPoints: Array<{ x: number; y: number; date: string; val: number }> = [];

  measurements.forEach((m, i) => {
    const x = padX + (i / (measurements.length - 1)) * chartW;
    if (m.weight !== null) {
      const y = padY + chartH - ((m.weight - wMin) / (wMax - wMin)) * chartH;
      weightPoints.push({ x, y, date: m.date, val: m.weight });
    }
    if (m.bodyFat !== null) {
      const y = padY + chartH - ((m.bodyFat - fMin) / (fMax - fMin)) * chartH;
      fatPoints.push({ x, y, date: m.date, val: m.bodyFat });
    }
  });

  const wDelta = weights.length >= 2
    ? Math.round((weights[weights.length - 1] - weights[weights.length - 2]) * 10) / 10
    : null;
  const fDelta = fats.length >= 2
    ? Math.round((fats[fats.length - 1] - fats[fats.length - 2]) * 10) / 10
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Measurements
        </h3>
        <div className="flex items-center gap-3">
          {wDelta !== null && (
            <span className={`text-[10px] font-medium ${wDelta > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {wDelta > 0 ? '+' : ''}{wDelta}kg
            </span>
          )}
          {fDelta !== null && (
            <span className={`text-[10px] font-medium ${fDelta > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {fDelta > 0 ? '+' : ''}{fDelta}%bf
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* Weight line (gold) */}
        {weightPoints.length >= 2 && (
          <motion.path
            d={buildPath(weightPoints)}
            fill="none"
            stroke="#D4A853"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        )}

        {/* Body fat line (purple) */}
        {fatPoints.length >= 2 && (
          <motion.path
            d={buildPath(fatPoints)}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          />
        )}

        {/* Dots */}
        {weightPoints.map((p, i) => (
          <circle key={`w-${i}`} cx={p.x} cy={p.y} r={3} fill="#D4A853" />
        ))}
        {fatPoints.map((p, i) => (
          <circle key={`f-${i}`} cx={p.x} cy={p.y} r={3} fill="#a78bfa" />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#D4A853]" />
          <span className="text-stone-500 text-[10px]">Weight</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
          <span className="text-stone-500 text-[10px]">Body Fat %</span>
        </div>
      </div>
    </motion.div>
  );
});
