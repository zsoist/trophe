'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '../lib/dates';

interface WeeklySummaryProps {
  userId: string;
}

interface DaySummary {
  date: string;
  calories: number;
  protein: number;
  entries: number;
}

export default function WeeklySummary({ userId }: WeeklySummaryProps) {
  const [weekData, setWeekData] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const loadWeekData = async () => {
      const dates: string[] = [];
      const d = new Date();
      for (let i = 6; i >= 0; i--) {
        const dd = new Date(d);
        dd.setDate(dd.getDate() - i);
        dates.push(localDateStr(dd));
      }

      const { data } = await supabase
        .from('food_log')
        .select('logged_date, calories, protein_g')
        .eq('user_id', userId)
        .gte('logged_date', dates[0])
        .lte('logged_date', dates[6]);

      if (!data || data.length === 0) { setLoading(false); return; }

      const byDay = new Map<string, DaySummary>();
      for (const date of dates) {
        byDay.set(date, { date, calories: 0, protein: 0, entries: 0 });
      }

      for (const entry of data) {
        const day = byDay.get(entry.logged_date);
        if (day) {
          day.calories += entry.calories ?? 0;
          day.protein += entry.protein_g ?? 0;
          day.entries++;
        }
      }

      setWeekData(Array.from(byDay.values()));
      setLoading(false);
    };

    loadWeekData();
  }, [userId]);

  if (loading || weekData.length === 0) return null;

  const activeDays = weekData.filter(d => d.entries > 0);
  if (activeDays.length < 3) return null;

  const avgCalories = Math.round(activeDays.reduce((s, d) => s + d.calories, 0) / activeDays.length);
  const avgProtein = Math.round(activeDays.reduce((s, d) => s + d.protein, 0) / activeDays.length);
  const consistency = Math.round((activeDays.length / 7) * 100);
  const maxCal = Math.max(...weekData.map(d => d.calories), 1);

  // Trend: compare first half vs second half
  const firstHalf = weekData.slice(0, 3).filter(d => d.entries > 0);
  const secondHalf = weekData.slice(4).filter(d => d.entries > 0);
  const firstAvg = firstHalf.length ? firstHalf.reduce((s, d) => s + d.calories, 0) / firstHalf.length : 0;
  const secondAvg = secondHalf.length ? secondHalf.reduce((s, d) => s + d.calories, 0) / secondHalf.length : 0;
  const trend = secondAvg > firstAvg * 1.05 ? 'up' : secondAvg < firstAvg * 0.95 ? 'down' : 'stable';

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-4 mb-4"
    >
      {/* Accordion header */}
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="gold-text" />
          <span className="text-stone-300 text-xs font-semibold uppercase tracking-wider">This Week</span>
          <div className="flex items-center gap-1">
            {trend === 'up' && <TrendingUp size={11} className="text-green-400" />}
            {trend === 'down' && <TrendingDown size={11} className="text-red-400" />}
            {trend === 'stable' && <Minus size={11} className="text-stone-500" />}
          </div>
        </div>
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
            {/* Mini bar chart */}
            <div className="flex items-end gap-1 h-12 mb-3 mt-1">
              {weekData.map((day, i) => {
                const height = day.calories > 0 ? Math.max(4, (day.calories / maxCal) * 48) : 2;
                const isToday = i === 6;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                      className={`w-full rounded-sm ${
                        day.entries === 0 ? 'bg-white/[0.05]'
                        : isToday ? 'bg-[#D4A853]'
                        : 'bg-[#D4A853]/40'
                      }`}
                    />
                    <span className={`text-[8px] ${isToday ? 'gold-text font-bold' : 'text-stone-600'}`}>
                      {dayLabels[new Date(day.date).getDay() === 0 ? 6 : new Date(day.date).getDay() - 1]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-sm font-bold gold-text">{avgCalories}</p>
                <p className="text-[9px] text-stone-500">Avg kcal</p>
              </div>
              <div>
                <p className="text-sm font-bold text-red-400">{avgProtein}g</p>
                <p className="text-[9px] text-stone-500">Avg protein</p>
              </div>
              <div>
                <p className="text-sm font-bold text-green-400">{consistency}%</p>
                <p className="text-[9px] text-stone-500">Consistency</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
