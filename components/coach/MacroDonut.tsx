'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Coach Macro Donut Chart (Wave 4)
// Pure SVG animated donut with P/C/F segments
// ═══════════════════════════════════════════════

interface MacroDonutProps {
  protein: number;
  carbs: number;
  fat: number;
}

const COLORS = {
  protein: '#ef4444', // Red
  carbs: '#3b82f6',   // Blue
  fat: '#a855f7',     // Purple
};

const SIZE = 160;
const STROKE_WIDTH = 20;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function MacroDonut({ protein, carbs, fat }: MacroDonutProps) {
  const [hovered, setHovered] = useState<'protein' | 'carbs' | 'fat' | null>(null);

  const total = protein + carbs + fat;
  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatCal = fat * 9;
  const totalCal = proteinCal + carbsCal + fatCal;

  const proteinPct = total > 0 ? protein / total : 0;
  const carbsPct = total > 0 ? carbs / total : 0;
  const fatPct = total > 0 ? fat / total : 0;

  // Stroke dash segments
  const proteinDash = proteinPct * CIRCUMFERENCE;
  const carbsDash = carbsPct * CIRCUMFERENCE;
  const fatDash = fatPct * CIRCUMFERENCE;

  // Offsets (each segment starts where the previous ended)
  const proteinOffset = 0;
  const carbsOffset = -(proteinDash);
  const fatOffset = -(proteinDash + carbsDash);

  const segments = [
    {
      key: 'protein' as const,
      label: 'Protein',
      grams: protein,
      pct: Math.round(proteinPct * 100),
      color: COLORS.protein,
      dash: proteinDash,
      offset: proteinOffset,
      delay: 0.2,
    },
    {
      key: 'carbs' as const,
      label: 'Carbs',
      grams: carbs,
      pct: Math.round(carbsPct * 100),
      color: COLORS.carbs,
      dash: carbsDash,
      offset: carbsOffset,
      delay: 0.4,
    },
    {
      key: 'fat' as const,
      label: 'Fat',
      grams: fat,
      pct: Math.round(fatPct * 100),
      color: COLORS.fat,
      dash: fatDash,
      offset: fatOffset,
      delay: 0.6,
    },
  ];

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={STROKE_WIDTH}
          />

          {/* Segments */}
          {total > 0 && segments.map((seg) => (
            <motion.circle
              key={seg.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={hovered === seg.key ? STROKE_WIDTH + 4 : STROKE_WIDTH}
              strokeLinecap="butt"
              strokeDasharray={`${seg.dash} ${CIRCUMFERENCE - seg.dash}`}
              strokeDashoffset={seg.offset}
              initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
              animate={{
                strokeDasharray: `${seg.dash} ${CIRCUMFERENCE - seg.dash}`,
                strokeWidth: hovered === seg.key ? STROKE_WIDTH + 4 : STROKE_WIDTH,
                opacity: hovered && hovered !== seg.key ? 0.4 : 1,
              }}
              transition={{ duration: 1, delay: seg.delay, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => setHovered(seg.key)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hovered ? (
            <motion.div
              className="text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              <div className="text-2xl font-bold text-stone-100">
                {segments.find((s) => s.key === hovered)?.pct}%
              </div>
              <div className="text-[10px] text-stone-400 capitalize">{hovered}</div>
            </motion.div>
          ) : (
            <>
              <motion.span
                className="text-2xl font-bold text-stone-100"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {Math.round(totalCal)}
              </motion.span>
              <span className="text-[10px] text-stone-500 uppercase tracking-wider">kcal</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {segments.map((seg) => (
          <motion.div
            key={seg.key}
            className="text-center cursor-pointer"
            onMouseEnter={() => setHovered(seg.key)}
            onMouseLeave={() => setHovered(null)}
            whileHover={{ y: -1 }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-[11px] text-stone-400">{seg.label}</span>
            </div>
            <div className="text-xs text-stone-200 font-semibold">
              {Math.round(seg.grams)}g
              <span className="text-stone-500 font-normal ml-1">
                ({seg.pct}%)
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
