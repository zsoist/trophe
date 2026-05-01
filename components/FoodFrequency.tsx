'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localDateStr } from '../lib/dates';

interface FoodStat {
  food_name:     string;
  count:         number;
  totalCalories: number;
  totalProtein:  number;
  totalCarbs:    number;
  totalFat:      number;
  avgCalories:   number;
  avgProtein:    number;
  avgCarbs:      number;
  avgFat:        number;
  lastSeen:      string;
}

interface FoodFrequencyProps {
  userId: string;
  days?: number;
}

const RANK_COLORS = ['#D4A853', '#a8a29e', '#92754a'];
const BAR_COLOR   = 'rgba(168,162,158,0.35)';

export default function FoodFrequency({ userId, days = 30 }: FoodFrequencyProps) {
  const { t } = useI18n();
  const [foods,    setFoods]    = useState<FoodStat[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<FoodStat | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = localDateStr(startDate);

      const { data } = await supabase
        .from('food_log')
        .select('food_name, calories, protein_g, carbs_g, fat_g, logged_date')
        .eq('user_id', userId)
        .gte('logged_date', startStr)
        .order('logged_date', { ascending: false });

      if (cancelled) return;

      if (!data || data.length === 0) {
        setFoods([]);
        setLoading(false);
        return;
      }

      const map = new Map<string, FoodStat>();
      for (const entry of data) {
        const key = entry.food_name.trim().toLowerCase();
        const ex  = map.get(key) ?? {
          food_name:     entry.food_name.trim(),
          count:         0,
          totalCalories: 0,
          totalProtein:  0,
          totalCarbs:    0,
          totalFat:      0,
          avgCalories:   0,
          avgProtein:    0,
          avgCarbs:      0,
          avgFat:        0,
          lastSeen:      entry.logged_date ?? '',
        };
        ex.count         += 1;
        ex.totalCalories += entry.calories  ?? 0;
        ex.totalProtein  += entry.protein_g ?? 0;
        ex.totalCarbs    += entry.carbs_g   ?? 0;
        ex.totalFat      += entry.fat_g     ?? 0;
        // lastSeen stays as the most recent (data ordered desc)
        if (!map.has(key)) ex.lastSeen = entry.logged_date ?? '';
        map.set(key, ex);
      }

      const sorted = Array.from(map.values())
        .map(f => ({
          ...f,
          avgCalories: Math.round(f.totalCalories / f.count),
          avgProtein:  Math.round(f.totalProtein  / f.count),
          avgCarbs:    Math.round(f.totalCarbs     / f.count),
          avgFat:      Math.round(f.totalFat       / f.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setFoods(sorted);
      setLoading(false);
    }

    void loadData();
    return () => { cancelled = true; };
  }, [userId, days]);

  if (loading) {
    return (
      <div className="glass p-5">
        <div className="h-3 w-28 rounded bg-stone-800/60 animate-pulse mb-3" />
        {[1,2,3].map(i => (
          <div key={i} className="h-14 w-full rounded-xl bg-stone-800/40 animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  if (foods.length === 0) {
    return (
      <div className="glass p-5">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Icon name="i-trophy" size={14} /> {t('analytics.top_foods')}
        </h3>
        <p className="text-stone-500 text-sm text-center py-3">No food data yet</p>
      </div>
    );
  }

  const maxCount  = foods[0].count;
  const weeksInRange = Math.max(days / 7, 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass p-4"
    >
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Icon name="i-trophy" size={14} className="text-[var(--gold-300)]" />
          Top Foods
          <span className="text-stone-600 font-normal normal-case tracking-normal">
            · {days}d
          </span>
        </h3>
        {expanded
          ? <ChevronUp size={14} className="text-stone-500" />
          : <ChevronDown size={14} className="text-stone-500" />}
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
            <div className="mt-3 space-y-1.5">
              {foods.map((food, i) => {
                const barPct  = (food.count / maxCount) * 100;
                const perWeek = (food.count / weeksInRange).toFixed(1);
                const rankColor = RANK_COLORS[i] ?? BAR_COLOR;
                const isOpen = selected?.food_name === food.food_name;

                return (
                  <motion.div
                    key={food.food_name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.25 }}
                    className="rounded-xl overflow-hidden"
                  >
                    {/* Row */}
                    <button
                      onClick={() => setSelected(isOpen ? null : food)}
                      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition-colors rounded-xl text-left"
                    >
                      {/* Rank badge */}
                      <span
                        className="text-[10px] font-bold w-5 text-center shrink-0"
                        style={{ color: rankColor }}
                      >
                        {i < 3 ? `#${i + 1}` : `${i + 1}`}
                      </span>

                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-stone-200 text-xs font-medium truncate">
                            {food.food_name}
                          </span>
                          <span className="text-stone-500 text-[10px] shrink-0 ml-2">
                            {food.count}× · {food.avgCalories} kcal
                          </span>
                        </div>

                        <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <motion.div
                            className="absolute top-0 left-0 h-full rounded-full"
                            style={{ backgroundColor: i < 3 ? rankColor : BAR_COLOR }}
                            initial={{ width: 0 }}
                            animate={{ width: `${barPct}%` }}
                            transition={{ duration: 0.5, delay: 0.04 * i, ease: 'easeOut' }}
                          />
                        </div>

                        <p className="text-stone-600 text-[10px] mt-0.5">
                          {perWeek}× / week
                        </p>
                      </div>

                      {/* Expand chevron */}
                      <ChevronDown
                        size={11}
                        className="text-stone-600 shrink-0 transition-transform"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </button>

                    {/* Expanded macro detail */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="px-3 pb-3">
                            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                              {/* Macro grid */}
                              <div className="grid grid-cols-4 gap-2 text-center mb-2.5">
                                <div>
                                  <p className="text-orange-400 font-bold text-sm">{food.avgCalories}</p>
                                  <p className="text-stone-600 text-[9px] mt-0.5">kcal</p>
                                </div>
                                <div>
                                  <p className="text-red-400 font-bold text-sm">{food.avgProtein}g</p>
                                  <p className="text-stone-600 text-[9px] mt-0.5">protein</p>
                                </div>
                                <div>
                                  <p className="text-blue-400 font-bold text-sm">{food.avgCarbs}g</p>
                                  <p className="text-stone-600 text-[9px] mt-0.5">carbs</p>
                                </div>
                                <div>
                                  <p className="text-purple-400 font-bold text-sm">{food.avgFat}g</p>
                                  <p className="text-stone-600 text-[9px] mt-0.5">fat</p>
                                </div>
                              </div>

                              {/* Totals + frequency */}
                              <div className="flex items-center justify-between border-t border-white/[0.05] pt-2">
                                <span className="text-stone-600 text-[10px]">
                                  Logged {food.count}× over {days}d
                                </span>
                                <span className="text-[var(--gold-300)] text-[10px] font-medium">
                                  {Math.round(food.totalCalories).toLocaleString()} kcal total
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
