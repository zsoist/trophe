'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { supabase } from '@/lib/supabase';
import { localToday, localDateStr } from '../lib/dates';

interface DayPatternsProps {
  userId: string;
}

interface DayAvg {
  dayIndex:  number;
  dayLabel:  string;
  shortLabel: string;
  total:     number;
  count:     number;
  avg:       number;
}

type MacroType  = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
type PeriodType = '7d' | '30d' | 'custom';

interface MacroTab {
  key:   MacroType;
  label: string;
  icon:  IconName;
  color: string;
  unit:  string;
  field: string;
}

const MACRO_TABS: MacroTab[] = [
  { key: 'calories', label: 'kcal',    icon: 'i-flame',    color: '#fb923c', unit: 'kcal', field: 'calories'   },
  { key: 'protein',  label: 'Protein', icon: 'i-dumbbell', color: '#f87171', unit: 'g',    field: 'protein_g'  },
  { key: 'carbs',    label: 'Carbs',   icon: 'i-zap',      color: '#60a5fa', unit: 'g',    field: 'carbs_g'    },
  { key: 'fat',      label: 'Fat',     icon: 'i-drop',     color: '#c084fc', unit: 'g',    field: 'fat_g'      },
  { key: 'fiber',    label: 'Fiber',   icon: 'i-leaf',     color: '#34d399', unit: 'g',    field: 'fiber_g'    },
];

const DAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DayPatterns({ userId }: DayPatternsProps) {
  const [loading,    setLoading]    = useState(true);
  const [dayData,    setDayData]    = useState<DayAvg[]>([]);
  const [expanded,   setExpanded]   = useState(false);
  const [macro,      setMacro]      = useState<MacroType>('calories');
  const [period,     setPeriod]     = useState<PeriodType>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const tab = MACRO_TABS.find(t => t.key === macro)!;

  useEffect(() => {
    if (!expanded) return; // only load when open
    let cancelled = false;

    async function loadData() {
      if (!userId) return;
      setLoading(true);

      let startStr: string;
      let endStr = localToday();

      if (period === '7d') {
        startStr = localDateStr(new Date(Date.now() - 7 * 86400000));
      } else if (period === '30d') {
        startStr = localDateStr(new Date(Date.now() - 30 * 86400000));
      } else {
        // custom
        startStr = customFrom || localDateStr(new Date(Date.now() - 30 * 86400000));
        endStr   = customTo   || localToday();
      }

      const { data: rawData } = await supabase
        .from('food_log')
        .select(`logged_date, ${tab.field}`)
        .eq('user_id', userId)
        .gte('logged_date', startStr)
        .lte('logged_date', endStr);

      if (cancelled) return;

      const data = rawData as Array<Record<string, unknown>> | null;

      if (!data || data.length === 0) {
        setDayData([]);
        setLoading(false);
        return;
      }

      // Aggregate per date first, then map to day-of-week
      const dateMap: Record<string, number> = {};
      for (const entry of data) {
        const date = entry.logged_date as string;
        const val  = (entry[tab.field] as number | null) ?? 0;
        dateMap[date] = (dateMap[date] ?? 0) + val;
      }

      const days: DayAvg[] = Array.from({ length: 7 }, (_, i) => ({
        dayIndex:   i,
        dayLabel:   DAY_LABELS[i],
        shortLabel: DAY_SHORT[i],
        total:      0,
        count:      0,
        avg:        0,
      }));

      for (const [dateStr, val] of Object.entries(dateMap)) {
        if (val === 0) continue;
        const dow = new Date(`${dateStr}T12:00:00`).getDay();
        days[dow].total += val;
        days[dow].count += 1;
      }

      for (const day of days) {
        day.avg = day.count > 0 ? Math.round(day.total / day.count) : 0;
      }

      setDayData(days);
      setLoading(false);
    }

    void loadData();
    return () => { cancelled = true; };
  }, [userId, macro, period, customFrom, customTo, expanded, tab.field]);

  // Insight computation
  const insight = useMemo(() => {
    const withData = dayData.filter(d => d.avg > 0);
    if (withData.length < 3) return null;

    const weekdays = dayData.filter(d => d.dayIndex >= 1 && d.dayIndex <= 5 && d.avg > 0);
    const weekend  = dayData.filter(d => (d.dayIndex === 0 || d.dayIndex === 6) && d.avg > 0);
    if (!weekdays.length || !weekend.length) return null;

    const wdAvg  = Math.round(weekdays.reduce((s, d) => s + d.avg, 0) / weekdays.length);
    const weAvg  = Math.round(weekend.reduce((s,  d) => s + d.avg, 0) / weekend.length);
    const diff   = wdAvg > 0 ? Math.round(((weAvg - wdAvg) / wdAvg) * 100) : 0;

    const highest    = [...withData].sort((a, b) => b.avg - a.avg)[0];
    const overallAvg = Math.round(withData.reduce((s, d) => s + d.avg, 0) / withData.length);
    const highestPct = overallAvg > 0 ? Math.round(((highest.avg - overallAvg) / overallAvg) * 100) : 0;

    if (highestPct > 15) return `${highest.dayLabel}s you eat ${highestPct}% more ${tab.label} than average`;
    if (diff > 10)       return `Weekends you consume ${diff}% more ${tab.label} than weekdays`;
    if (diff < -10)      return `Weekdays you consume ${Math.abs(diff)}% more ${tab.label} than weekends`;
    return null;
  }, [dayData, tab.label]);

  // Mon–Sun order
  const ordered = [...dayData.slice(1), dayData[0]];
  const maxAvg  = Math.max(...ordered.map(d => d.avg), 1);
  const activeDays  = ordered.filter(d => d.avg > 0);
  const overallAvg  = activeDays.length > 0
    ? Math.round(activeDays.reduce((s, d) => s + d.avg, 0) / activeDays.length)
    : 0;

  const highestDay = activeDays.length > 0 ? [...activeDays].sort((a, b) => b.avg - a.avg)[0] : null;
  const lowestDay  = activeDays.length > 1 ? [...activeDays].sort((a, b) => a.avg - b.avg)[0] : null;

  const weekdayList = ordered.filter(d => d.dayIndex >= 1 && d.dayIndex <= 5 && d.avg > 0);
  const weekendList = ordered.filter(d => (d.dayIndex === 0 || d.dayIndex === 6) && d.avg > 0);
  const weekdayAvg  = weekdayList.length > 0 ? Math.round(weekdayList.reduce((s,d) => s+d.avg,0)/weekdayList.length) : 0;
  const weekendAvg  = weekendList.length > 0 ? Math.round(weekendList.reduce((s,d) => s+d.avg,0)/weekendList.length) : 0;

  const fmtVal = (v: number) => macro === 'calories'
    ? (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toString())
    : `${v}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-4"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Icon name="i-bars" size={14} className="text-[var(--gold-300)]" />
          Day Patterns
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
            {/* Controls row: period + macro */}
            <div className="mt-3 space-y-2">
              {/* Period pills */}
              <div className="flex gap-1.5">
                {(['7d','30d','custom'] as PeriodType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                      period === p
                        ? 'bg-white/5 border-white/10 text-stone-200'
                        : 'border-transparent text-stone-600 hover:text-stone-400'
                    }`}
                  >
                    {p === '7d' ? '7 days' : p === '30d' ? '30 days' : 'Custom'}
                  </button>
                ))}
              </div>

              {/* Custom date range */}
              <AnimatePresence>
                {period === 'custom' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex gap-2 overflow-hidden"
                  >
                    <div className="flex-1">
                      <p className="text-[9px] text-stone-600 mb-1">From</p>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        className="input-dark text-xs py-1.5"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] text-stone-600 mb-1">To</p>
                      <input
                        type="date"
                        value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        className="input-dark text-xs py-1.5"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Macro type pills */}
              <div className="flex gap-1">
                {MACRO_TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setMacro(t.key)}
                    className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 rounded-lg text-[9px] font-medium border transition-all ${
                      macro === t.key
                        ? 'bg-white/5 border-white/10'
                        : 'border-transparent text-stone-600 hover:text-stone-400'
                    }`}
                    style={macro === t.key ? { color: t.color, borderColor: `${t.color}33` } : {}}
                  >
                    <Icon name={t.icon} size={9} />
                    <span className="hidden sm:inline ml-0.5">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chart area */}
            {loading ? (
              <div className="h-24 flex items-center justify-center">
                <p className="text-stone-600 text-xs animate-pulse">Loading…</p>
              </div>
            ) : overallAvg === 0 ? (
              <div className="text-center py-6">
                <Calendar size={28} className="text-stone-700 mx-auto mb-2" />
                <p className="text-stone-500 text-sm">Not enough data yet</p>
                <p className="text-stone-600 text-xs mt-1">Log meals for 7+ days to see your patterns</p>
              </div>
            ) : (
              <>
                {/* Bar chart */}
                <div className="relative mt-3 mb-1">
                  {/* Average line */}
                  <div
                    className="absolute left-0 right-0 border-t border-dashed pointer-events-none z-10"
                    style={{
                      borderColor: 'var(--t4,#78716c)',
                      opacity: 0.35,
                      bottom: `calc(22px + ${(overallAvg / maxAvg) * 80}px)`,
                    }}
                  >
                    <span
                      className="absolute right-0 text-[8px] translate-y-[-100%] pr-0.5"
                      style={{ color: 'var(--t5,#57534e)' }}
                    >
                      avg {fmtVal(overallAvg)}{tab.unit}
                    </span>
                  </div>

                  <div className="flex items-end gap-1.5 h-[102px]">
                    {ordered.map((day, i) => {
                      const isWeekend = day.dayIndex === 0 || day.dayIndex === 6;
                      const isHigh    = day.avg > overallAvg * 1.2;
                      const pct       = day.avg > 0 ? Math.max((day.avg / maxAvg) * 80, 4) : 3;

                      const barColor = day.avg === 0
                        ? 'var(--line-2,rgba(255,255,255,0.10))'
                        : isHigh
                        ? `linear-gradient(180deg, ${tab.color}, ${tab.color}88)`
                        : isWeekend
                        ? `linear-gradient(180deg, ${tab.color}88, ${tab.color}44)`
                        : `linear-gradient(180deg, ${tab.color}cc, ${tab.color}66)`;

                      return (
                        <div key={day.dayIndex} className="flex-1 flex flex-col items-center gap-1">
                          <div style={{ height: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                            {day.avg > 0 && (
                              <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 + i * 0.04 }}
                                style={{
                                  fontSize: 8,
                                  color: isHigh ? tab.color : 'var(--t4,#78716c)',
                                  fontWeight: isHigh ? 700 : 400,
                                  lineHeight: 1,
                                }}
                              >
                                {fmtVal(day.avg)}
                              </motion.span>
                            )}
                          </div>

                          <motion.div
                            key={`${macro}-${day.dayIndex}`}
                            initial={{ height: 0 }}
                            animate={{ height: pct }}
                            transition={{ duration: 0.4, delay: i * 0.05, ease: 'easeOut' }}
                            className="w-full rounded-t-md"
                            style={{ background: barColor, minHeight: 3 }}
                          />

                          <span style={{
                            fontSize: 9,
                            fontWeight: isWeekend ? 600 : 400,
                            color: isWeekend ? tab.color : 'var(--t4,#78716c)',
                          }}>
                            {day.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Weekday vs Weekend stats */}
                {(weekdayAvg > 0 || weekendAvg > 0) && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-xl p-2.5 text-center" style={{ background: `${tab.color}11`, border: `1px solid ${tab.color}22` }}>
                      <p className="text-[11px] font-bold" style={{ color: tab.color }}>
                        {weekdayAvg > 0 ? `${fmtVal(weekdayAvg)}${tab.unit}` : '—'}
                      </p>
                      <p className="text-[9px] mt-0.5 text-stone-500">Weekday avg</p>
                    </div>
                    <div className="rounded-xl p-2.5 text-center" style={{ background: `${tab.color}11`, border: `1px solid ${tab.color}22` }}>
                      <p className="text-[11px] font-bold" style={{ color: tab.color }}>
                        {weekendAvg > 0 ? `${fmtVal(weekendAvg)}${tab.unit}` : '—'}
                      </p>
                      <p className="text-[9px] mt-0.5 text-stone-500">Weekend avg</p>
                    </div>
                  </div>
                )}

                {/* High / low callout */}
                {highestDay && lowestDay && highestDay.dayLabel !== lowestDay.dayLabel && (
                  <div
                    className="rounded-xl p-3 mt-2"
                    style={{ background: 'var(--line,rgba(255,255,255,0.05))', border: '1px solid var(--line-2,rgba(255,255,255,0.08))' }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-stone-500">Peak: </span>
                        <span className="font-semibold" style={{ color: tab.color }}>{highestDay.dayLabel}</span>
                        <span className="text-stone-600"> · {fmtVal(highestDay.avg)}{tab.unit}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">Low: </span>
                        <span className="font-semibold text-stone-400">{lowestDay.dayLabel}</span>
                        <span className="text-stone-600"> · {fmtVal(lowestDay.avg)}{tab.unit}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Insight */}
                {insight && (
                  <div
                    className="flex items-start gap-2 pt-2 mt-2 border-t"
                    style={{ borderColor: 'var(--line,rgba(255,255,255,0.05))' }}
                  >
                    <TrendingUp size={12} className="mt-0.5 shrink-0" style={{ color: tab.color }} />
                    <p className="text-xs text-stone-400">{insight}</p>
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
