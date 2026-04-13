'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CalendarViewProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  userId: string;
}

interface DaySummary {
  entries: number;
  calories: number;
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayISO(): string {
  return toISO(new Date());
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarView({
  selectedDate,
  onSelectDate,
  onClose,
  userId,
}: CalendarViewProps) {
  const [selYear, selMonth] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selYear);
  const [viewMonth, setViewMonth] = useState(selMonth - 1); // 0-indexed
  const [monthDir, setMonthDir] = useState(0);
  const [dayData, setDayData] = useState<Record<string, DaySummary>>({});
  const [streak, setStreak] = useState<Set<string>>(new Set());

  const todayISO = useMemo(() => getTodayISO(), []);

  // Compute month boundaries
  const monthStart = useMemo(
    () => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`,
    [viewYear, viewMonth]
  );
  const monthEnd = useMemo(() => {
    const days = getDaysInMonth(viewYear, viewMonth);
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  }, [viewYear, viewMonth]);

  // Fetch food_log for the visible month
  useEffect(() => {
    let cancelled = false;

    async function fetchMonth() {
      const { data, error } = await supabase
        .from('food_log')
        .select('logged_date, calories')
        .eq('user_id', userId)
        .gte('logged_date', monthStart)
        .lte('logged_date', monthEnd);

      if (cancelled || error) {
        return;
      }

      const grouped: Record<string, DaySummary> = {};
      for (const row of data ?? []) {
        const d = row.logged_date as string;
        if (!grouped[d]) grouped[d] = { entries: 0, calories: 0 };
        grouped[d].entries += 1;
        grouped[d].calories += (row.calories as number) ?? 0;
      }
      setDayData(grouped);

      // Compute streak days (consecutive days with entries, going back from today)
      const streakSet = new Set<string>();
      const today = new Date();
      const cursor = new Date(today);
      for (let i = 0; i < 120; i++) {
        const iso = toISO(cursor);
        if (grouped[iso] && grouped[iso].entries > 0) {
          streakSet.add(iso);
        } else if (iso < todayISO) {
          // Only break on past days with no entries
          break;
        }
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreak(streakSet);
    }

    fetchMonth();
    return () => { cancelled = true; };
  }, [userId, monthStart, monthEnd, todayISO]);

  const goNextMonth = useCallback(() => {
    setMonthDir(1);
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const goPrevMonth = useCallback(() => {
    setMonthDir(-1);
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  // Grid cells
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  // Max calories for opacity normalization
  const maxCal = useMemo(
    () => Math.max(...Object.values(dayData).map((d) => d.calories), 1),
    [dayData]
  );

  // Monthly summary
  const daysLogged = Object.keys(dayData).length;
  const totalCalories = Object.values(dayData).reduce((s, d) => s + d.calories, 0);
  const avgCalories = daysLogged > 0 ? Math.round(totalCalories / daysLogged) : 0;
  const consistency = daysInMonth > 0 ? Math.round((daysLogged / Math.min(parseInt(todayISO.split('-')[2], 10), daysInMonth)) * 100) : 0;

  function handleSelect(dateStr: string) {
    if (dateStr > todayISO) return;
    onSelectDate(dateStr);
    onClose();
  }

  function getDayBorderColor(entries: number): string {
    if (entries >= 5) return 'border-green-500/60';
    if (entries >= 3) return 'border-[#D4A853]/50';
    if (entries >= 1) return 'border-stone-600/50';
    return 'border-transparent';
  }

  const monthTransition = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] bg-stone-950 border-t border-white/[0.06] rounded-t-2xl overflow-hidden flex flex-col"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={goPrevMonth}
            className="p-1.5 text-stone-400 hover:text-stone-200 transition-colors rounded-lg hover:bg-white/[0.04]"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="relative overflow-hidden min-w-[160px] h-6 flex items-center justify-center">
            <AnimatePresence mode="popLayout" custom={monthDir}>
              <motion.h2
                key={`${viewYear}-${viewMonth}`}
                custom={monthDir}
                variants={monthTransition}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="text-stone-200 font-semibold text-base whitespace-nowrap"
              >
                {MONTH_NAMES[viewMonth]} {viewYear}
              </motion.h2>
            </AnimatePresence>
          </div>

          <button
            onClick={goNextMonth}
            className="p-1.5 text-stone-400 hover:text-stone-200 transition-colors rounded-lg hover:bg-white/[0.04]"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 ml-2 text-stone-500 hover:text-stone-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-4 pt-1 pb-2">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[10px] text-stone-600 font-medium">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 px-4 pb-4 overflow-y-auto flex-1">
          {/* Empty cells for offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isFuture = dateStr > todayISO;
            const isSelected = dateStr === selectedDate;
            const isCurrentDay = dateStr === todayISO;
            const summary = dayData[dateStr];
            const entries = summary?.entries ?? 0;
            const calories = summary?.calories ?? 0;
            const isStreakDay = streak.has(dateStr);

            // Opacity based on calorie intensity
            const intensity = calories > 0 ? 0.3 + (calories / maxCal) * 0.7 : 0;

            return (
              <motion.button
                key={dateStr}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.008 }}
                disabled={isFuture}
                onClick={() => handleSelect(dateStr)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg border transition-all text-xs
                  ${isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                  ${isSelected ? 'bg-[#D4A853] border-[#D4A853] text-stone-950' : ''}
                  ${!isSelected && isCurrentDay ? 'ring-1 ring-[#D4A853]/60' : ''}
                  ${!isSelected ? getDayBorderColor(entries) : ''}
                  ${!isSelected ? 'hover:bg-white/[0.04]' : ''}
                `}
              >
                {/* Calorie intensity background */}
                {!isSelected && intensity > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-[#D4A853]"
                    style={{ opacity: intensity * 0.12 }}
                  />
                )}

                {/* Day number */}
                <span
                  className={`relative z-10 font-medium ${
                    isSelected
                      ? 'text-stone-950'
                      : isCurrentDay
                        ? 'text-[#D4A853]'
                        : entries > 0
                          ? 'text-stone-200'
                          : 'text-stone-500'
                  }`}
                >
                  {dayNum}
                </span>

                {/* Streak fire */}
                {isStreakDay && !isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 text-[8px] leading-none">
                    🔥
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Bottom summary */}
        <div className="glass-elevated px-4 py-3 flex items-center justify-between text-xs border-t border-white/[0.04]">
          <div className="flex items-center gap-3">
            <span className="text-stone-400">
              <span className="text-stone-200 font-medium">{daysLogged}</span> days logged
            </span>
            <span className="text-stone-600">|</span>
            <span className="text-stone-400">
              avg <span className="text-stone-200 font-medium">{avgCalories}</span> kcal
            </span>
          </div>
          <span className={`font-semibold ${consistency >= 80 ? 'text-green-400' : consistency >= 50 ? 'text-[#D4A853]' : 'text-stone-500'}`}>
            {consistency}%
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
