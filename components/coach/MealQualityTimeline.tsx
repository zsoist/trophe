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
  A: { bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)', emoji: '\u{1F929}' },
  B: { bg: 'var(--status-warning-bg)', text: 'var(--action-primary)', emoji: '\u{1F60A}' },
  C: { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)', emoji: '\u{1F610}' },
  D: { bg: 'var(--status-danger-bg)', text: 'var(--status-danger-fg)', emoji: '\u{1F615}' },
};

export default memo(function MealQualityTimeline({ meals }: MealQualityTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-3">
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
                <div className="absolute left-0 top-1/2 w-3 h-px bg-[var(--surface-hover)] -translate-x-3" />
              )}

              {/* Emoji */}
              <span className="text-xl">{style.emoji}</span>

              {/* Grade badge */}
              <div
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {meal.grade}
              </div>

              {/* Meal name */}
              <span className="text-[var(--content-secondary)] text-xs text-center leading-tight">
                {meal.name}
              </span>

              {/* Time */}
              {meal.time && (
                <span className="text-[var(--content-muted)] text-xs">{meal.time}</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {meals.length === 0 && (
        <p className="text-[var(--content-muted)] text-xs text-center py-4">No meals logged today</p>
      )}
    </motion.div>
  );
});
