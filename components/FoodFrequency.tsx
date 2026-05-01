'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '../lib/dates';

interface FoodStat {
  food_name: string;
  count: number;
  totalCalories: number;
  totalProtein: number;
}

interface FoodFrequencyProps {
  userId: string;
  days?: number;
}

export default function FoodFrequency({ userId, days = 30 }: FoodFrequencyProps) {
  const [foods, setFoods] = useState<FoodStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = localDateStr(startDate);

      const { data } = await supabase
        .from('food_log')
        .select('food_name, calories, protein_g')
        .eq('user_id', userId)
        .gte('logged_date', startStr);

      if (cancelled) return;

      if (!data || data.length === 0) {
        setFoods([]);
        setLoading(false);
        return;
      }

      const map = new Map<string, FoodStat>();
      for (const entry of data) {
        const name = entry.food_name.trim().toLowerCase();
        const existing = map.get(name) || {
          food_name: entry.food_name.trim(),
          count: 0,
          totalCalories: 0,
          totalProtein: 0,
        };
        existing.count += 1;
        existing.totalCalories += entry.calories ?? 0;
        existing.totalProtein += entry.protein_g ?? 0;
        if (!map.has(name)) existing.food_name = entry.food_name.trim();
        map.set(name, existing);
      }

      const sorted = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      setFoods(sorted);
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">
          Loading food data...
        </div>
      </div>
    );
  }

  if (foods.length === 0) {
    return (
      <div className="glass p-5 mb-4">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Repeat size={14} /> Your Top Foods
        </h3>
        <p className="text-stone-500 text-sm text-center py-3">
          No food data in the last {days} days
        </p>
      </div>
    );
  }

  const maxCount = foods[0].count;
  const weeksInRange = days / 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass p-5 mb-4"
    >
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Repeat size={14} /> Your Top Foods
        </h3>
        {expanded ? <ChevronUp size={14} className="text-stone-500" /> : <ChevronDown size={14} className="text-stone-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2.5">
              {foods.map((food, i) => {
                const barPct = (food.count / maxCount) * 100;
                const perWeek = (food.count / weeksInRange).toFixed(1);

                return (
                  <motion.div
                    key={food.food_name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                  >
                    {/* Food name and stats */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-stone-200 text-xs font-medium truncate max-w-[55%]">
                        {food.food_name}
                      </span>
                      <span className="text-stone-500 text-[10px]">
                        {food.count}x &middot; {Math.round(food.totalCalories)} kcal
                      </span>
                    </div>

                    {/* Bar */}
                    <div className="relative h-2 rounded-full bg-white/[0.03] overflow-hidden">
                      <motion.div
                        className="absolute top-0 left-0 h-full rounded-full"
                        style={{
                          background:
                            i === 0
                              ? 'linear-gradient(90deg, rgba(212,168,83,0.7), rgba(212,168,83,0.4))'
                              : 'linear-gradient(90deg, rgba(168,162,158,0.4), rgba(168,162,158,0.15))',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.6, delay: 0.05 * i, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Weekly frequency */}
                    <p className="text-stone-600 text-[10px] mt-0.5">
                      {perWeek}x / week
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
