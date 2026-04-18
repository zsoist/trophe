'use client';

import { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FoodLogEntry } from '@/lib/types';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface MealPatternViewProps {
  entries: FoodLogEntry[];
}

interface MealPattern {
  mealType: string;
  emoji: string;
  label: string;
  totalEntries: number;
  topFoods: { name: string; count: number; avgCalories: number }[];
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  uniqueDays: number;
}

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const MEAL_META: Record<string, { emoji: string; label: string; order: number }> = {
  breakfast: { emoji: '🌅', label: 'Breakfast', order: 0 },
  lunch: { emoji: '☀️', label: 'Lunch', order: 1 },
  dinner: { emoji: '🌙', label: 'Dinner', order: 2 },
  snack: { emoji: '🍎', label: 'Snacks', order: 3 },
  pre_workout: { emoji: '💪', label: 'Pre-Workout', order: 4 },
  post_workout: { emoji: '🥤', label: 'Post-Workout', order: 5 },
};

const MAX_CAL_BAR = 800; // max calories for bar scale

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

function MealPatternView({ entries }: MealPatternViewProps) {
  const [view, setView] = useState<'pattern' | 'daily'>('pattern');

  const patterns = useMemo(() => {
    const grouped: Record<string, FoodLogEntry[]> = {};

    entries.forEach((entry) => {
      const key = entry.meal_type || 'snack';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    });

    const result: MealPattern[] = Object.entries(grouped).map(([mealType, items]) => {
      // Count food frequencies + sum calories per food name
      const foodStats: Record<string, { count: number; calTotal: number }> = {};
      items.forEach((item) => {
        const name = item.food_name.toLowerCase().trim();
        if (!foodStats[name]) foodStats[name] = { count: 0, calTotal: 0 };
        foodStats[name].count += 1;
        foodStats[name].calTotal += item.calories || 0;
      });
      const topFoods = Object.entries(foodStats)
        .map(([name, s]) => ({
          name,
          count: s.count,
          avgCalories: Math.round(s.calTotal / s.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Calculate average per meal occasion (group by date)
      const byDate: Record<string, { cal: number; p: number; c: number; f: number }> = {};
      items.forEach((item) => {
        if (!byDate[item.logged_date]) byDate[item.logged_date] = { cal: 0, p: 0, c: 0, f: 0 };
        byDate[item.logged_date].cal += item.calories || 0;
        byDate[item.logged_date].p += item.protein_g || 0;
        byDate[item.logged_date].c += item.carbs_g || 0;
        byDate[item.logged_date].f += item.fat_g || 0;
      });

      const dayCount = Object.keys(byDate).length || 1;
      const totals = Object.values(byDate).reduce(
        (acc, d) => ({
          cal: acc.cal + d.cal,
          p: acc.p + d.p,
          c: acc.c + d.c,
          f: acc.f + d.f,
        }),
        { cal: 0, p: 0, c: 0, f: 0 }
      );

      const meta = MEAL_META[mealType] || { emoji: '🍽️', label: mealType, order: 99 };

      return {
        mealType,
        emoji: meta.emoji,
        label: meta.label,
        totalEntries: items.length,
        topFoods,
        avgCalories: Math.round(totals.cal / dayCount),
        avgProtein: Math.round(totals.p / dayCount),
        avgCarbs: Math.round(totals.c / dayCount),
        avgFat: Math.round(totals.f / dayCount),
        uniqueDays: dayCount,
      };
    });

    // Sort by meal order
    result.sort((a, b) => {
      const orderA = MEAL_META[a.mealType]?.order ?? 99;
      const orderB = MEAL_META[b.mealType]?.order ?? 99;
      return orderA - orderB;
    });

    return result;
  }, [entries]);

  // Daily view: group by date (existing behavior)
  const foodByDate = useMemo(() => {
    const byDate: Record<string, FoodLogEntry[]> = {};
    entries.forEach((entry) => {
      const key = entry.logged_date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(entry);
    });
    return byDate;
  }, [entries]);

  const maxAvgCal = useMemo(
    () => Math.max(...patterns.map((p) => p.avgCalories), MAX_CAL_BAR),
    [patterns]
  );

  if (entries.length === 0) {
    return <p className="text-stone-600 text-sm text-center py-4">No food logged recently</p>;
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] mb-4 w-fit">
        <button
          onClick={() => setView('pattern')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === 'pattern'
              ? 'bg-[#D4A853]/15 text-[#D4A853]'
              : 'text-stone-500 hover:text-stone-300'
          }`}
        >
          Pattern View
        </button>
        <button
          onClick={() => setView('daily')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === 'daily'
              ? 'bg-[#D4A853]/15 text-[#D4A853]'
              : 'text-stone-500 hover:text-stone-300'
          }`}
        >
          Daily View
        </button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'pattern' ? (
          <motion.div
            key="pattern"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {patterns.map((pattern) => {
              const maxFoodCount = Math.max(...pattern.topFoods.map((f) => f.count), 1);
              return (
                <div
                  key={pattern.mealType}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  {/* Minimal meal header — emoji + label + day count, everything else demoted */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-base">{pattern.emoji}</span>
                    <h4 className="text-sm font-semibold text-stone-200">{pattern.label}</h4>
                    <span className="text-[10px] text-stone-500">
                      · {pattern.uniqueDays} day{pattern.uniqueDays !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* FOODS — the hero of the card */}
                  <div className="space-y-2">
                    {pattern.topFoods.map((food) => {
                      const freqPct = (food.count / maxFoodCount) * 100;
                      return (
                        <div key={food.name} className="space-y-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm text-stone-100 capitalize truncate">
                              {food.name}
                            </span>
                            <span className="text-[10px] text-stone-500 whitespace-nowrap tabular-nums">
                              {food.count}×{food.avgCalories > 0 ? ` · ~${food.avgCalories} kcal` : ''}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-[#D4A853]/60"
                              initial={{ width: 0 }}
                              animate={{ width: `${freqPct}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Demoted footer — totals in small print */}
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-stone-500">
                    <span>
                      ~{pattern.avgCalories} kcal/day · P{pattern.avgProtein} C{pattern.avgCarbs} F{pattern.avgFat}
                    </span>
                    <div className="h-1 w-16 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full bg-[#D4A853]/30 rounded-full"
                        style={{ width: `${Math.min((pattern.avgCalories / maxAvgCal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {Object.entries(foodByDate)
              .slice(0, 3)
              .map(([date, dayEntries]) => {
                const totals = dayEntries.reduce(
                  (acc, e) => ({
                    cal: acc.cal + (e.calories || 0),
                    p: acc.p + (e.protein_g || 0),
                    c: acc.c + (e.carbs_g || 0),
                    f: acc.f + (e.fat_g || 0),
                  }),
                  { cal: 0, p: 0, c: 0, f: 0 }
                );
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-stone-400">
                        {new Date(date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-stone-500">
                        {Math.round(totals.cal)} kcal | P:{Math.round(totals.p)}g C:
                        {Math.round(totals.c)}g F:{Math.round(totals.f)}g
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/[0.03]"
                        >
                          <span className="text-stone-300 truncate">{entry.food_name}</span>
                          <span className="text-stone-500 whitespace-nowrap ml-2">
                            {entry.calories || 0} kcal
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(MealPatternView);
