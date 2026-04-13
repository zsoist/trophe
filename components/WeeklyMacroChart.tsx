'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DayData {
  date: string;
  dayLabel: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface WeeklyMacroChartProps {
  userId: string | null;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

export default function WeeklyMacroChart({
  userId,
  targetCalories,
}: WeeklyMacroChartProps) {
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;

    async function loadWeekData() {
      if (!userId) return;

      const days: DayData[] = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setDate(day.getDate() - i);
        const dateStr = day.toISOString().split('T')[0];
        days.push({
          date: dateStr,
          dayLabel: dayNames[day.getDay()],
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
        });
      }

      const startDate = days[0].date;
      const endDate = days[6].date;

      const { data } = await supabase
        .from('food_log')
        .select('logged_date, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', userId)
        .gte('logged_date', startDate)
        .lte('logged_date', endDate);

      if (cancelled) return;

      if (data) {
        for (const entry of data) {
          const matchingDay = days.find((day) => day.date === entry.logged_date);
          if (matchingDay) {
            matchingDay.calories += entry.calories ?? 0;
            matchingDay.protein_g += entry.protein_g ?? 0;
            matchingDay.carbs_g += entry.carbs_g ?? 0;
            matchingDay.fat_g += entry.fat_g ?? 0;
          }
        }
      }

      setWeekData(days);
      setLoading(false);
    }

    void loadWeekData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-8 animate-pulse">
          Loading weekly data...
        </div>
      </div>
    );
  }

  const maxCal = Math.max(targetCalories, ...weekData.map((d) => d.calories), 1) * 1.1;
  const chartHeight = 120;
  const barWidth = 28;
  const gap = 8;
  const totalWidth = weekData.length * (barWidth + gap) - gap;

  // Averages
  const daysWithData = weekData.filter((d) => d.calories > 0);
  const avgCalories = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.calories, 0) / daysWithData.length)
    : 0;
  const avgProtein = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.protein_g, 0) / daysWithData.length)
    : 0;
  const avgCarbs = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.carbs_g, 0) / daysWithData.length)
    : 0;
  const avgFat = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.fat_g, 0) / daysWithData.length)
    : 0;

  const targetY = chartHeight - (targetCalories / maxCal) * chartHeight;

  function getBarColor(calories: number): string {
    if (calories === 0) return 'rgba(255,255,255,0.04)';
    const ratio = calories / targetCalories;
    if (ratio >= 0.9 && ratio <= 1.1) return '#D4A853'; // Gold - on target
    if (ratio < 0.9) return '#6b7280'; // Gray - under
    return '#ef4444'; // Red - over
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 size={14} /> Weekly Calories
      </h3>

      {/* SVG Bar Chart */}
      <div className="flex justify-center mb-4">
        <svg
          width={totalWidth + 20}
          height={chartHeight + 28}
          viewBox={`0 0 ${totalWidth + 20} ${chartHeight + 28}`}
          className="overflow-visible"
        >
          {/* Target line */}
          <line
            x1={0}
            y1={targetY}
            x2={totalWidth + 20}
            y2={targetY}
            stroke="#D4A853"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.5}
          />
          <text
            x={totalWidth + 18}
            y={targetY - 4}
            textAnchor="end"
            fill="#D4A853"
            fontSize={8}
            opacity={0.6}
          >
            {targetCalories}
          </text>

          {/* Bars */}
          {weekData.map((day, i) => {
            const x = 10 + i * (barWidth + gap);
            const barH = day.calories > 0 ? (day.calories / maxCal) * chartHeight : 4;
            const y = chartHeight - barH;
            const color = getBarColor(day.calories);
            const isToday = i === 6;

            return (
              <g key={day.date}>
                {/* Bar */}
                <motion.rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={4}
                  fill={color}
                  initial={{ height: 0, y: chartHeight }}
                  animate={{ height: barH, y }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                />
                {/* Calorie label on bar */}
                {day.calories > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fill="#a8a29e"
                    fontSize={8}
                  >
                    {Math.round(day.calories)}
                  </text>
                )}
                {/* Day label */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 14}
                  textAnchor="middle"
                  fill={isToday ? '#D4A853' : '#78716c'}
                  fontSize={9}
                  fontWeight={isToday ? 600 : 400}
                >
                  {day.dayLabel}
                </text>
                {/* Today dot */}
                {isToday && (
                  <circle cx={x + barWidth / 2} cy={chartHeight + 22} r={2} fill="#D4A853" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Weekly Averages */}
      <div className="border-t border-white/5 pt-3">
        <p className="text-stone-500 text-[10px] uppercase tracking-wider mb-2">
          7-Day Average
        </p>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="gold-text font-bold text-sm">{avgCalories}</p>
            <p className="text-stone-600 text-[10px]">kcal</p>
          </div>
          <div>
            <p className="text-red-400 font-bold text-sm">{avgProtein}g</p>
            <p className="text-stone-600 text-[10px]">Protein</p>
          </div>
          <div>
            <p className="text-blue-400 font-bold text-sm">{avgCarbs}g</p>
            <p className="text-stone-600 text-[10px]">Carbs</p>
          </div>
          <div>
            <p className="text-purple-400 font-bold text-sm">{avgFat}g</p>
            <p className="text-stone-600 text-[10px]">Fat</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
