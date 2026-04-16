'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';

type MoodLevel = 'great' | 'good' | 'okay' | 'tough' | 'struggled';

interface MoodEntry {
  date: string;
  mood: MoodLevel;
}

interface MoodTrendProps {
  moods: MoodEntry[];
}

const MOOD_MAP: Record<MoodLevel, { value: number; emoji: string }> = {
  great: { value: 5, emoji: '\u{1F929}' },
  good: { value: 4, emoji: '\u{1F60A}' },
  okay: { value: 3, emoji: '\u{1F610}' },
  tough: { value: 2, emoji: '\u{1F614}' },
  struggled: { value: 1, emoji: '\u{1F62D}' },
};

export default memo(function MoodTrend({ moods }: MoodTrendProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (moods.length < 2) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
          Mood Trend (14d)
        </h3>
        <p className="text-stone-500 text-xs text-center py-4">Not enough data</p>
      </motion.div>
    );
  }

  const w = 320;
  const h = 120;
  const padX = 24;
  const padY = 16;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;

  const dataPoints = moods.map((m, i) => {
    const val = MOOD_MAP[m.mood].value;
    const x = padX + (i / (moods.length - 1)) * chartW;
    const y = padY + chartH - ((val - 1) / 4) * chartH;
    return { x, y, val, mood: m.mood, date: m.date };
  });

  const linePath = dataPoints
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
        Mood Trend (14d)
      </h3>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ maxHeight: 140 }}
      >
        {/* Grid lines */}
        {[1, 2, 3, 4, 5].map((v) => {
          const y = padY + chartH - ((v - 1) / 4) * chartH;
          return (
            <line
              key={v}
              x1={padX}
              y1={y}
              x2={w - padX}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          );
        })}

        {/* Gold line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="#D4A853"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />

        {/* Emoji markers */}
        {dataPoints.map((p, i) => (
          <g
            key={i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            className="cursor-pointer"
          >
            <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
            <text
              x={p.x}
              y={p.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={hoveredIdx === i ? 14 : 11}
              className="transition-all select-none"
            >
              {MOOD_MAP[p.mood].emoji}
            </text>

            {hoveredIdx === i && (
              <g>
                <rect
                  x={p.x - 30}
                  y={p.y - 28}
                  width={60}
                  height={18}
                  rx={4}
                  fill="rgba(28,25,23,0.95)"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={0.5}
                />
                <text
                  x={p.x}
                  y={p.y - 17}
                  textAnchor="middle"
                  fill="#a8a29e"
                  fontSize={8}
                >
                  {p.date}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </motion.div>
  );
});
