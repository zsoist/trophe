'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { FoodLogEntry } from '@/lib/types';

interface ProteinDistributionProps {
  entries: FoodLogEntry[];
}

const MEAL_NAMES: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  pre_workout: 'Pre-WO',
  post_workout: 'Post-WO',
};

const MEAL_COLORS: Record<string, string> = {
  breakfast: '#f59e0b',
  lunch: '#22c55e',
  dinner: '#3b82f6',
  snack: '#78716c',
  pre_workout: '#a855f7',
  post_workout: '#ec4899',
};

export default memo(function ProteinDistribution({ entries }: ProteinDistributionProps) {
  if (entries.length < 2) return null;

  // Group protein by meal
  const byMeal = new Map<string, number>();
  for (const e of entries) {
    const mt = e.meal_type || 'snack';
    byMeal.set(mt, (byMeal.get(mt) || 0) + (e.protein_g ?? 0));
  }

  const meals = Array.from(byMeal.entries()).filter(([, p]) => p > 0);
  if (meals.length < 2) return null;

  const totalProtein = meals.reduce((s, [, p]) => s + p, 0);
  const maxProtein = Math.max(...meals.map(([, p]) => p));

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-stone-300 text-xs font-medium">Protein per Meal</span>
        <span className="text-red-400 text-xs font-bold">{Math.round(totalProtein)}g total</span>
      </div>

      <div className="space-y-1.5">
        {meals.map(([meal, protein], i) => {
          const pct = (protein / maxProtein) * 100;
          const color = MEAL_COLORS[meal] || '#78716c';
          return (
            <div key={meal} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 w-16 text-right truncate">
                {MEAL_NAMES[meal] || meal}
              </span>
              <div className="flex-1 h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
              <span className="text-[10px] text-stone-400 w-8 text-right font-medium">
                {Math.round(protein)}g
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
