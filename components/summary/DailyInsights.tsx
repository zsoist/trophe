'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

interface DailyInsightsProps {
  entries: FoodLogEntry[];
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  /**
   * Coach pref (client_view_prefs.showCalories). Default false — calorie
   * pacing copy is replaced with protein-first phrasing (Michael's rule).
   */
  showCalories?: boolean;
}

function generateInsights(
  entries: FoodLogEntry[],
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  t: (key: string, params?: Record<string, string | number>) => string,
  showCalories: boolean
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
      insights.push(t('insights.protein_concentrated', { meal: max[0], n: Math.round(max[1]) }));
    }
  }

  // Fiber check
  if (totalFiber < 10 && entries.length >= 3) {
    insights.push(t('insights.fiber_low', { n: Math.round(totalFiber) }));
  }

  // Pacing — calorie copy only when the coach shows calories; otherwise
  // protein-first phrasing (client_view_prefs.showCalories, Michael's rule).
  const hour = new Date().getHours();
  const dayProgress = Math.max(0.1, (hour - 6) / 16); // 6am-10pm window
  if (showCalories && targets.calories > 0) {
    const expectedCal = targets.calories * dayProgress;
    const pace = totalCal / expectedCal;

    if (pace > 1.3 && hour < 18) {
      insights.push(t('insights.calorie_ahead'));
    } else if (pace < 0.5 && hour > 14) {
      insights.push(t('insights.calorie_behind'));
    }
  } else if (!showCalories && targets.protein_g > 0) {
    const expectedProtein = targets.protein_g * dayProgress;
    const proteinPace = expectedProtein > 0 ? totalProtein / expectedProtein : 0;

    if (proteinPace > 1.25 && hour < 18) {
      insights.push(t('insights.protein_ahead'));
    } else if (proteinPace < 0.5 && hour > 14) {
      insights.push(t('insights.protein_behind'));
    }
  }

  // Protein target
  if (targets.protein_g > 0 && totalProtein < targets.protein_g * 0.3 && entries.length >= 2) {
    const remaining = Math.round(targets.protein_g - totalProtein);
    insights.push(t('insights.protein_remaining', { n: remaining }));
  }

  // Variety
  const uniqueFoods = new Set(entries.map(e => e.food_name)).size;
  if (uniqueFoods >= 8) {
    insights.push(t('insights.variety', { n: uniqueFoods }));
  }

  return insights.slice(0, 3);
}

export default function DailyInsights({ entries, targets, showCalories = false }: DailyInsightsProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const insights = useMemo(
    () => generateInsights(entries, targets, t, showCalories),
    [entries, targets, t, showCalories],
  );

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
          <span className="text-[var(--content-primary)] text-xs font-medium">{t('insights.title')}</span>
          <span className="text-[var(--content-muted)] text-xs">({insights.length})</span>
        </div>
        {expanded ? <ChevronUp size={12} className="text-[var(--content-muted)]" /> : <ChevronDown size={12} className="text-[var(--content-muted)]" />}
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
                className="text-[var(--content-muted)] text-xs leading-relaxed pl-6"
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
