'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DayPatternsProps {
  userId: string;
}

interface DayAvg {
  dayIndex: number;
  dayLabel: string;
  shortLabel: string;
  totalCalories: number;
  count: number;
  avg: number;
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DayPatterns({ userId }: DayPatternsProps) {
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayAvg[]>([]);

  const loadData = useCallback(async () => {
    if (!userId) return;

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];

    const { data } = await supabase
      .from('food_log')
      .select('logged_date, calories')
      .eq('user_id', userId)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate);

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    // Aggregate by date first, then by day of week
    const dateMap: Record<string, number> = {};
    for (const entry of data) {
      const d = entry.logged_date;
      dateMap[d] = (dateMap[d] ?? 0) + (entry.calories ?? 0);
    }

    // Group by day of week
    const days: DayAvg[] = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      dayLabel: DAY_LABELS[i],
      shortLabel: DAY_SHORT[i],
      totalCalories: 0,
      count: 0,
      avg: 0,
    }));

    for (const [dateStr, cals] of Object.entries(dateMap)) {
      if (cals === 0) continue;
      const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
      days[dayOfWeek].totalCalories += cals;
      days[dayOfWeek].count += 1;
    }

    for (const day of days) {
      day.avg = day.count > 0 ? Math.round(day.totalCalories / day.count) : 0;
    }

    setDayData(days);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Insight: find the biggest outlier
  const insight = useMemo(() => {
    const withData = dayData.filter((d) => d.avg > 0);
    if (withData.length < 3) return null;

    // Weekday average vs weekend
    const weekdays = dayData.filter((d) => d.dayIndex >= 1 && d.dayIndex <= 5 && d.avg > 0);
    const weekend = dayData.filter((d) => (d.dayIndex === 0 || d.dayIndex === 6) && d.avg > 0);

    if (weekdays.length === 0 || weekend.length === 0) return null;

    const weekdayAvg = Math.round(weekdays.reduce((s, d) => s + d.avg, 0) / weekdays.length);
    const weekendAvg = Math.round(weekend.reduce((s, d) => s + d.avg, 0) / weekend.length);

    if (weekdayAvg === 0) return null;

    const diff = Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100);
    if (Math.abs(diff) < 5) return null;

    // Find the single highest day
    const highest = [...withData].sort((a, b) => b.avg - a.avg)[0];
    const overallAvg = Math.round(withData.reduce((s, d) => s + d.avg, 0) / withData.length);
    const highestPct = Math.round(((highest.avg - overallAvg) / overallAvg) * 100);

    if (highestPct > 10) {
      return `${highest.dayLabel}s you eat ${highestPct}% more than average`;
    }

    if (diff > 10) {
      return `Weekends you eat ${diff}% more than weekdays`;
    } else if (diff < -10) {
      return `Weekdays you eat ${Math.abs(diff)}% more than weekends`;
    }

    return null;
  }, [dayData]);

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">Loading patterns...</div>
      </div>
    );
  }

  const maxAvg = Math.max(...dayData.map((d) => d.avg), 1);
  const overallAvg = dayData.filter((d) => d.avg > 0).length > 0
    ? Math.round(dayData.filter((d) => d.avg > 0).reduce((s, d) => s + d.avg, 0) / dayData.filter((d) => d.avg > 0).length)
    : 0;

  // Reorder to Mon-Sun
  const ordered = [...dayData.slice(1), dayData[0]];

  const chartHeight = 100;
  const barWidth = 30;
  const gap = 8;
  const totalWidth = ordered.length * (barWidth + gap) - gap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 size={14} /> Day Patterns
      </h3>

      {overallAvg === 0 ? (
        <p className="text-stone-500 text-sm text-center py-4">Not enough data yet (need 7+ days)</p>
      ) : (
        <>
          {/* SVG Bar Chart */}
          <div className="flex justify-center mb-3">
            <svg
              width={totalWidth + 20}
              height={chartHeight + 28}
              viewBox={`0 0 ${totalWidth + 20} ${chartHeight + 28}`}
              className="overflow-visible"
            >
              {/* Average line */}
              {overallAvg > 0 && (
                <>
                  <line
                    x1={0}
                    y1={chartHeight - (overallAvg / maxAvg) * chartHeight}
                    x2={totalWidth + 20}
                    y2={chartHeight - (overallAvg / maxAvg) * chartHeight}
                    stroke="#78716c"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.4}
                  />
                  <text
                    x={totalWidth + 18}
                    y={chartHeight - (overallAvg / maxAvg) * chartHeight - 4}
                    textAnchor="end"
                    fill="#78716c"
                    fontSize={8}
                    opacity={0.6}
                  >
                    avg
                  </text>
                </>
              )}

              {/* Bars */}
              {ordered.map((day, i) => {
                const x = 10 + i * (barWidth + gap);
                const barH = day.avg > 0 ? (day.avg / maxAvg) * chartHeight : 3;
                const y = chartHeight - barH;
                const isWeekend = day.dayIndex === 0 || day.dayIndex === 6;
                const isHigh = day.avg > overallAvg * 1.15;
                const color = day.avg === 0
                  ? 'rgba(255,255,255,0.04)'
                  : isHigh
                  ? '#ef4444'
                  : isWeekend
                  ? '#a855f7'
                  : '#D4A853';

                return (
                  <g key={day.dayIndex}>
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
                    {day.avg > 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={y - 4}
                        textAnchor="middle"
                        fill="#a8a29e"
                        fontSize={8}
                      >
                        {day.avg}
                      </text>
                    )}
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 14}
                      textAnchor="middle"
                      fill={isWeekend ? '#a855f7' : '#78716c'}
                      fontSize={9}
                      fontWeight={isWeekend ? 600 : 400}
                    >
                      {day.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Insight */}
          {insight && (
            <div className="flex items-start gap-2 border-t border-white/5 pt-3">
              <TrendingUp size={12} className="text-[#D4A853] mt-0.5 flex-shrink-0" />
              <p className="text-stone-400 text-xs">{insight}</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
