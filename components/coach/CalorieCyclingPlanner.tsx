'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type DayLevel = 'high' | 'medium' | 'low' | 'rest';

interface CyclingDay {
  day: string;
  level: DayLevel;
  calories: number;
}

interface CalorieCyclingPlannerProps {
  days: CyclingDay[];
  onChange: (days: CyclingDay[]) => void;
}

const LEVEL_STYLES: Record<DayLevel, { bg: string; border: string; text: string; label: string }> = {
  high: {
    bg: 'rgba(212, 168, 83, 0.2)',
    border: 'rgba(212, 168, 83, 0.4)',
    text: '#D4A853',
    label: 'High',
  },
  medium: {
    bg: 'rgba(168, 162, 158, 0.15)',
    border: 'rgba(168, 162, 158, 0.3)',
    text: '#a8a29e',
    label: 'Med',
  },
  low: {
    bg: 'rgba(120, 113, 108, 0.12)',
    border: 'rgba(120, 113, 108, 0.25)',
    text: '#78716c',
    label: 'Low',
  },
  rest: {
    bg: 'rgba(68, 64, 60, 0.12)',
    border: 'rgba(68, 64, 60, 0.25)',
    text: '#57534e',
    label: 'Rest',
  },
};

const CYCLE_ORDER: DayLevel[] = ['high', 'medium', 'low', 'rest'];

export default memo(function CalorieCyclingPlanner({
  days,
  onChange,
}: CalorieCyclingPlannerProps) {
  const handleCycle = (index: number) => {
    const updated = [...days];
    const currentIdx = CYCLE_ORDER.indexOf(updated[index].level);
    const nextLevel = CYCLE_ORDER[(currentIdx + 1) % CYCLE_ORDER.length];
    updated[index] = { ...updated[index], level: nextLevel };
    onChange(updated);
  };

  const avgCalories = days.length > 0
    ? Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Calorie Cycling
        </h3>
        <span className="text-stone-500 text-[10px] tabular-nums">
          Avg: {avgCalories} kcal
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.slice(0, 7).map((day, i) => {
          const style = LEVEL_STYLES[day.level];
          return (
            <motion.button
              key={`${day.day}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              onClick={() => handleCycle(i)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
              style={{
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <span className="text-stone-400 text-[9px] font-medium uppercase">
                {day.day.slice(0, 3)}
              </span>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: style.text }}
              >
                {day.calories}
              </span>
              <span
                className="text-[8px] uppercase tracking-wider font-medium"
                style={{ color: style.text }}
              >
                {style.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3">
        {CYCLE_ORDER.map((level) => (
          <div key={level} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: LEVEL_STYLES[level].bg, border: `1px solid ${LEVEL_STYLES[level].border}` }}
            />
            <span className="text-stone-600 text-[8px] uppercase">{LEVEL_STYLES[level].label}</span>
          </div>
        ))}
      </div>

      <p className="text-stone-600 text-[9px] text-center mt-2">
        Tap a day to cycle through intensity levels
      </p>
    </motion.div>
  );
});
