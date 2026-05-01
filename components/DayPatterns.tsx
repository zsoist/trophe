'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localToday, localDateStr } from '../lib/dates';

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
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const endDate = localToday();
      const startDate = localDateStr(new Date(Date.now() - 60 * 86400000));

      const { data } = await supabase
        .from('food_log')
        .select('logged_date, calories')
        .eq('user_id', userId)
        .gte('logged_date', startDate)
        .lte('logged_date', endDate);

      if (cancelled) return;

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      const dateMap: Record<string, number> = {};
      for (const entry of data) {
        const date = entry.logged_date;
        dateMap[date] = (dateMap[date] ?? 0) + (entry.calories ?? 0);
      }

      const days: DayAvg[] = Array.from({ length: 7 }, (_, i) => ({
        dayIndex: i,
        dayLabel: DAY_LABELS[i],
        shortLabel: DAY_SHORT[i],
        totalCalories: 0,
        count: 0,
        avg: 0,
      }));

      for (const [dateStr, calories] of Object.entries(dateMap)) {
        if (calories === 0) continue;
        const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
        days[dayOfWeek].totalCalories += calories;
        days[dayOfWeek].count += 1;
      }

      for (const day of days) {
        day.avg = day.count > 0 ? Math.round(day.totalCalories / day.count) : 0;
      }

      setDayData(days);
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
  // Mon–Sun order
  const ordered = [...dayData.slice(1), dayData[0]];

  // Highest day for callout
  const withData = ordered.filter(d => d.avg > 0);
  const highestDay = withData.length > 0 ? [...withData].sort((a, b) => b.avg - a.avg)[0] : null;
  const lowestDay = withData.length > 1 ? [...withData].sort((a, b) => a.avg - b.avg)[0] : null;

  // Weekday vs weekend split
  const weekdayAvg = Math.round(
    ordered.filter(d => d.dayIndex >= 1 && d.dayIndex <= 5 && d.avg > 0)
      .reduce((s, d) => s + d.avg, 0) /
    Math.max(ordered.filter(d => d.dayIndex >= 1 && d.dayIndex <= 5 && d.avg > 0).length, 1)
  );
  const weekendAvg = Math.round(
    ordered.filter(d => (d.dayIndex === 0 || d.dayIndex === 6) && d.avg > 0)
      .reduce((s, d) => s + d.avg, 0) /
    Math.max(ordered.filter(d => (d.dayIndex === 0 || d.dayIndex === 6) && d.avg > 0).length, 1)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <BarChart3 size={14} /> Day Patterns
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
            {overallAvg === 0 ? (
              <div className="text-center py-6">
                <BarChart3 size={28} className="text-stone-700 mx-auto mb-2" />
                <p className="text-stone-500 text-sm">Not enough data yet</p>
                <p className="text-stone-600 text-xs mt-1">Log meals for 7+ days to see your patterns</p>
              </div>
            ) : (
              <>
                {/* Flex-based bar chart — fully responsive, no SVG overflow */}
                <div className="relative mb-1">
                  {/* Average dashed line */}
                  <div
                    className="absolute left-0 right-0 border-t border-dashed pointer-events-none z-10"
                    style={{
                      borderColor: 'var(--t4, #78716c)',
                      opacity: 0.35,
                      bottom: `calc(22px + ${(overallAvg / maxAvg) * 80}px)`,
                    }}
                  >
                    <span
                      className="absolute right-0 text-[8px] translate-y-[-100%] pr-0.5"
                      style={{ color: 'var(--t5, #57534e)' }}
                    >
                      avg {overallAvg}
                    </span>
                  </div>

                  {/* Bars */}
                  <div className="flex items-end gap-1.5 h-[102px]">
                    {ordered.map((day, i) => {
                      const isWeekend = day.dayIndex === 0 || day.dayIndex === 6;
                      const isHigh = day.avg > overallAvg * 1.2;
                      const pct = day.avg > 0 ? Math.max((day.avg / maxAvg) * 80, 4) : 3;

                      const barColor = day.avg === 0
                        ? 'var(--line-2, rgba(255,255,255,0.10))'
                        : isHigh
                        ? 'linear-gradient(180deg, #E8C078, #D4A853)'
                        : isWeekend
                        ? 'linear-gradient(180deg, rgba(212,168,83,0.55), rgba(212,168,83,0.3))'
                        : 'linear-gradient(180deg, rgba(212,168,83,0.75), rgba(212,168,83,0.45))';

                      return (
                        <div key={day.dayIndex} className="flex-1 flex flex-col items-center gap-1">
                          {/* Calorie label */}
                          <div
                            className="text-center"
                            style={{ height: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                          >
                            {day.avg > 0 && (
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 + i * 0.04 }}
                                style={{ fontSize: 8, color: isHigh ? '#D4A853' : 'var(--t4, #78716c)', fontWeight: isHigh ? 700 : 400, lineHeight: 1 }}
                              >
                                {day.avg >= 1000 ? `${(day.avg / 1000).toFixed(1)}k` : day.avg}
                              </motion.span>
                            )}
                          </div>

                          {/* Bar */}
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: pct }}
                            transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                            className="w-full rounded-t-md"
                            style={{ background: barColor, minHeight: 3 }}
                          />

                          {/* Day label */}
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: isWeekend ? 600 : 400,
                              color: isWeekend ? '#D4A853' : 'var(--t4, #78716c)',
                            }}
                          >
                            {day.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stats row */}
                {(weekdayAvg > 0 || weekendAvg > 0) && (
                  <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
                    <div
                      className="rounded-xl p-2.5 text-center"
                      style={{ background: 'rgba(212,168,83,0.07)', border: '1px solid rgba(212,168,83,0.12)' }}
                    >
                      <p className="text-[11px] font-bold" style={{ color: '#D4A853' }}>
                        {weekdayAvg > 0 ? weekdayAvg.toLocaleString() : '—'}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ color: 'var(--t4, #78716c)' }}>Weekday avg kcal</p>
                    </div>
                    <div
                      className="rounded-xl p-2.5 text-center"
                      style={{ background: 'rgba(212,168,83,0.07)', border: '1px solid rgba(212,168,83,0.12)' }}
                    >
                      <p className="text-[11px] font-bold" style={{ color: '#D4A853' }}>
                        {weekendAvg > 0 ? weekendAvg.toLocaleString() : '—'}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ color: 'var(--t4, #78716c)' }}>Weekend avg kcal</p>
                    </div>
                  </div>
                )}

                {/* Highest / lowest callout */}
                {highestDay && lowestDay && highestDay.dayLabel !== lowestDay.dayLabel && (
                  <div
                    className="rounded-xl p-3 mb-2"
                    style={{ background: 'var(--line, rgba(255,255,255,0.05))', border: '1px solid var(--line-2, rgba(255,255,255,0.08))' }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span style={{ color: 'var(--t4)' }}>Highest: </span>
                        <span style={{ color: '#D4A853', fontWeight: 600 }}>{highestDay.dayLabel}</span>
                        <span style={{ color: 'var(--t5)' }}> · {highestDay.avg.toLocaleString()} kcal</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--t4)' }}>Lowest: </span>
                        <span style={{ color: 'var(--t3)', fontWeight: 600 }}>{lowestDay.dayLabel}</span>
                        <span style={{ color: 'var(--t5)' }}> · {lowestDay.avg.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Insight */}
                {insight && (
                  <div
                    className="flex items-start gap-2 pt-2 mt-1 border-t"
                    style={{ borderColor: 'var(--line, rgba(255,255,255,0.05))' }}
                  >
                    <TrendingUp size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#D4A853' }} />
                    <p className="text-xs" style={{ color: 'var(--t3, #a8a29e)' }}>{insight}</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
