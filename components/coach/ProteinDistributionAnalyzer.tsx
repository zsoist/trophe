'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface MealProtein {
  name: string;
  protein: number;
}

interface ProteinDistributionAnalyzerProps {
  meals: MealProtein[];
}

export default memo(function ProteinDistributionAnalyzer({
  meals,
}: ProteinDistributionAnalyzerProps) {
  const totalProtein = meals.reduce((sum, m) => sum + m.protein, 0);
  const idealPerMeal = meals.length > 0 ? totalProtein / meals.length : 0;

  if (meals.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
          Protein Distribution
        </h3>
        <p className="text-stone-500 text-xs text-center py-4">No meal data</p>
      </motion.div>
    );
  }

  const maxProtein = Math.max(...meals.map((m) => m.protein), idealPerMeal);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Protein Distribution
        </h3>
        <span className="text-stone-500 text-[10px] tabular-nums">
          Total: {totalProtein}g
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {meals.map((meal, i) => {
          const pct = totalProtein > 0 ? (meal.protein / totalProtein) * 100 : 0;
          const isOverloaded = pct > 50;
          const barColor = isOverloaded ? '#f87171' : '#D4A853';
          const barFraction = maxProtein > 0 ? meal.protein / maxProtein : 0;

          return (
            <motion.div
              key={`${meal.name}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-stone-300 text-xs">{meal.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-stone-400 text-[10px] tabular-nums">
                    {meal.protein}g
                  </span>
                  <span className="text-stone-500 text-[10px] tabular-nums">
                    ({Math.round(pct)}%)
                  </span>
                  {isOverloaded && (
                    <span className="text-[9px] text-red-400 font-medium">
                      Overloaded
                    </span>
                  )}
                </div>
              </div>
              <div className="relative h-3 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${barFraction * 100}%` }}
                  transition={{ delay: i * 0.06 + 0.2, duration: 0.6, ease: 'easeOut' }}
                />
                {/* Ideal target line */}
                {idealPerMeal > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white/20"
                    style={{ left: `${(idealPerMeal / maxProtein) * 100}%` }}
                  />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-1">
          <div className="w-4 h-px bg-white/20" />
          <span className="text-stone-600 text-[9px]">Equal distribution target</span>
        </div>
      </div>
    </motion.div>
  );
});
