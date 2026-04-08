'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';

interface DailyInsightsProps {
  entries: FoodLogEntry[];
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

function generateInsights(
  entries: FoodLogEntry[],
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
): string[] {
  if (entries.length === 0) return [];

  const insights: string[] = [];
  const totalCal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein_g ?? 0), 0);
  const totalFiber = entries.reduce((s, e) => s + (e.fiber_g ?? 0), 0);

  // Protein distribution across meals
  const mealProtein: Record<string, number> = {};
  for (const e of entries) {
    const mt = e.meal_type || 'other';
    mealProtein[mt] = (mealProtein[mt] || 0) + (e.protein_g ?? 0);
  }
  const proteinMeals = Object.entries(mealProtein);
  if (proteinMeals.length >= 2) {
    const max = proteinMeals.reduce((a, b) => a[1] > b[1] ? a : b);
    const min = proteinMeals.reduce((a, b) => a[1] < b[1] ? a : b);
    if (max[1] > min[1] * 3 && min[1] < 15) {
      insights.push(`Your protein is concentrated at ${max[0]} (${Math.round(max[1])}g). Spreading it across meals improves muscle protein synthesis.`);
    }
  }

  // Fiber check
  if (totalFiber < 10 && entries.length >= 3) {
    insights.push(`Fiber is only ${Math.round(totalFiber)}g so far. Adding vegetables, fruits, or whole grains helps with satiety and digestion.`);
  }

  // Calorie pacing
  if (targets.calories > 0) {
    const hour = new Date().getHours();
    const dayProgress = Math.max(0.1, (hour - 6) / 16); // 6am-10pm window
    const expectedCal = targets.calories * dayProgress;
    const pace = totalCal / expectedCal;

    if (pace > 1.3 && hour < 18) {
      insights.push(`You're ahead of your calorie pace for this time of day. Consider lighter meals for the rest of the day.`);
    } else if (pace < 0.5 && hour > 14) {
      insights.push(`You're behind on calories for this time of day. Make sure to eat enough for energy and recovery.`);
    }
  }

  // Protein target
  if (targets.protein_g > 0 && totalProtein < targets.protein_g * 0.3 && entries.length >= 2) {
    const remaining = Math.round(targets.protein_g - totalProtein);
    insights.push(`${remaining}g protein remaining today. High-protein options: Greek yogurt (15g), chicken breast (31g/150g), eggs (6g each).`);
  }

  // Variety
  const uniqueFoods = new Set(entries.map(e => e.food_name)).size;
  if (uniqueFoods >= 8) {
    insights.push(`Great food variety today! ${uniqueFoods} different foods logged. Diverse diets provide broader micronutrient coverage.`);
  }

  return insights.slice(0, 3);
}

export default function DailyInsights({ entries, targets }: DailyInsightsProps) {
  const [expanded, setExpanded] = useState(false);
  const insights = useMemo(() => generateInsights(entries, targets), [entries, targets]);

  if (insights.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-3 mb-4"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="gold-text" />
          <span className="text-stone-300 text-xs font-medium">Daily Insights</span>
          <span className="text-stone-600 text-[10px]">({insights.length})</span>
        </div>
        {expanded ? <ChevronUp size={12} className="text-stone-500" /> : <ChevronDown size={12} className="text-stone-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-2 overflow-hidden"
          >
            {insights.map((insight, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-stone-400 text-xs leading-relaxed pl-6"
              >
                {insight}
              </motion.p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
