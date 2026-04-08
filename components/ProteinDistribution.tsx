'use client';

import { motion } from 'framer-motion';
import type { FoodLogEntry } from '@/lib/types';

interface ProteinDistributionProps {
  entries: FoodLogEntry[];
}

// F12: Protein distribution across meals
export default function ProteinDistribution({ entries }: ProteinDistributionProps) {
  if (entries.length === 0) return null;

  const mealOrder = ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'];
  const mealLabels: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    pre_workout: 'Pre-WO',
    post_workout: 'Post-WO',
  };
  const mealColors: Record<string, string> = {
    breakfast: '#f59e0b',
    lunch: '#22c55e',
    dinner: '#3b82f6',
    snack: '#78716c',
    pre_workout: '#a855f7',
    post_workout: '#ec4899',
  };

  // Group protein by meal type
  const byMeal = new Map<string, number>();
  for (const e of entries) {
    const mt = e.meal_type || 'snack';
    byMeal.set(mt, (byMeal.get(mt) || 0) + (e.protein_g ?? 0));
  }

  const meals = Array.from(byMeal.entries())
    .sort((a, b) => mealOrder.indexOf(a[0]) - mealOrder.indexOf(b[0]));

  const totalProtein = meals.reduce((s, [, p]) => s + p, 0);
  const maxProtein = Math.max(...meals.map(([, p]) => p), 1);

  if (totalProtein === 0) return null;

  // Optimal: 20-40g per meal for muscle protein synthesis
  const optimalMin = 20;
  const optimalMax = 40;

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-stone-300 text-xs font-medium">Protein Distribution</span>
        <span className="text-red-400 text-xs font-bold">{Math.round(totalProtein)}g total</span>
      </div>

      <div className="space-y-1.5">
        {meals.map(([meal, protein], i) => {
          const pct = (protein / maxProtein) * 100;
          const isOptimal = protein >= optimalMin && protein <= optimalMax;
          const isLow = protein < optimalMin && protein > 0;
          return (
            <div key={meal} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 w-14 text-right">
                {mealLabels[meal] || meal}
              </span>
              <div className="flex-1 h-3 bg-white/[0.05] rounded-full overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: mealColors[meal] || '#78716c' }}
                />
                {/* Optimal zone markers */}
                <div
                  className="absolute top-0 bottom-0 border-l border-dashed border-green-500/30"
                  style={{ left: `${(optimalMin / maxProtein) * 100}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 border-l border-dashed border-green-500/30"
                  style={{ left: `${Math.min((optimalMax / maxProtein) * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] w-8 text-right font-medium ${isOptimal ? 'text-green-400' : isLow ? 'text-orange-400' : 'text-stone-400'}`}>
                {Math.round(protein)}g
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-stone-600 mt-1.5">Green zone: 20-40g optimal for muscle protein synthesis</p>
    </div>
  );
}
