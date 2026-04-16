'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';

interface WeekVolume {
  weekLabel: string;
  totalSets: number;
  totalReps: number;
}

interface WorkoutVolumeChartProps {
  weeks: WeekVolume[];
}

export default memo(function WorkoutVolumeChart({ weeks }: WorkoutVolumeChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (weeks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
          Training Volume
        </h3>
        <p className="text-stone-500 text-xs text-center py-4">No training data</p>
      </motion.div>
    );
  }

  const w = 320;
  const h = 140;
  const padX = 16;
  const padY = 16;
  const padBottom = 28;
  const chartW = w - padX * 2;
  const chartH = h - padY - padBottom;

  const maxSets = Math.max(...weeks.map((w) => w.totalSets), 1);
  const barW = Math.min(chartW / weeks.length - 8, 32);
  const barGap = (chartW - barW * weeks.length) / (weeks.length + 1);

  // Trend line points
  const trendPoints = weeks.map((wk, i) => {
    const x = padX + barGap + i * (barW + barGap) + barW / 2;
    const barH = (wk.totalSets / maxSets) * chartH;
    const y = padY + chartH - barH;
    return { x, y };
  });

  const trendPath = trendPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Training Volume
      </h3>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* Bars */}
        {weeks.map((wk, i) => {
          const barH = (wk.totalSets / maxSets) * chartH;
          const x = padX + barGap + i * (barW + barGap);
          const y = padY + chartH - barH;

          return (
            <g
              key={`bar-${i}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <motion.rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={4}
                fill={hoveredIdx === i ? '#D4A853' : 'rgba(212, 168, 83, 0.6)'}
                initial={{ height: 0, y: padY + chartH }}
                animate={{ height: barH, y }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: 'easeOut' }}
              />

              {/* Label */}
              <text
                x={x + barW / 2}
                y={h - padBottom + 14}
                textAnchor="middle"
                fill="#78716c"
                fontSize={8}
                fontFamily="sans-serif"
              >
                {wk.weekLabel}
              </text>

              {/* Sets label on bar */}
              {hoveredIdx === i && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#D4A853"
                  fontSize={9}
                  fontWeight="bold"
                >
                  {wk.totalSets}s / {wk.totalReps}r
                </text>
              )}
            </g>
          );
        })}

        {/* Trend line */}
        {trendPoints.length >= 2 && (
          <motion.path
            d={trendPath}
            fill="none"
            stroke="rgba(212, 168, 83, 0.3)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
          />
        )}
      </svg>
    </motion.div>
  );
});
