'use client';

import { memo, useRef } from 'react';
import { motion } from 'framer-motion';

interface Meal {
  name: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  time?: string;
}

interface MealQualityTimelineProps {
  meals: Meal[];
}

const GRADE_STYLES: Record<Meal['grade'], { bg: string; text: string; emoji: string }> = {
  A: { bg: 'rgba(74, 222, 128, 0.2)', text: '#4ade80', emoji: '\u{1F929}' },
  B: { bg: 'rgba(212, 168, 83, 0.2)', text: '#D4A853', emoji: '\u{1F60A}' },
  C: { bg: 'rgba(251, 191, 36, 0.2)', text: '#fbbf24', emoji: '\u{1F610}' },
  D: { bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171', emoji: '\u{1F615}' },
};

export default memo(function MealQualityTimeline({ meals }: MealQualityTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Meal Quality
      </h3>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-stone-700"
      >
        {meals.map((meal, i) => {
          const style = GRADE_STYLES[meal.grade];
          return (
            <motion.div
              key={`${meal.name}-${i}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 min-w-[72px]"
            >
              {/* Connector line */}
              {i > 0 && (
                <div className="absolute left-0 top-1/2 w-3 h-px bg-white/10 -translate-x-3" />
              )}

              {/* Emoji */}
              <span className="text-xl">{style.emoji}</span>

              {/* Grade badge */}
              <div
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {meal.grade}
              </div>

              {/* Meal name */}
              <span className="text-stone-400 text-[10px] text-center leading-tight">
                {meal.name}
              </span>

              {/* Time */}
              {meal.time && (
                <span className="text-stone-600 text-[9px]">{meal.time}</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {meals.length === 0 && (
        <p className="text-stone-500 text-xs text-center py-4">No meals logged today</p>
      )}
    </motion.div>
  );
});
