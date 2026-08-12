'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Icon } from '@/components/ui';
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
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

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
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);

  const todayISO = useMemo(() => getTodayISO(), []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

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
    if (entries >= 5) return 'border-[var(--status-success-border)]';
    if (entries >= 3) return 'border-[var(--border-focus)]/50';
    if (entries >= 1) return 'border-[var(--border-default)]';
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
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-50 bg-[var(--surface-overlay)] flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Food log calendar"
        tabIndex={-1}
        onKeyDown={(event) => trapFocus(event, dialogRef.current)}
        initial={reducedMotion ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reducedMotion ? undefined : { y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[85vh] bg-[var(--surface-1)] border-t border-[var(--border-default)] rounded-t-2xl overflow-hidden flex flex-col safe-bottom pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--surface-2)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={goPrevMonth}
            aria-label="Previous month"
            className="p-1.5 text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors rounded-lg hover:bg-[var(--surface-2)] min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                className="text-[var(--content-primary)] font-semibold text-base whitespace-nowrap"
              >
                {MONTH_NAMES[viewMonth]} {viewYear}
              </motion.h2>
            </AnimatePresence>
          </div>

          <button
            onClick={goNextMonth}
            aria-label="Next month"
            className="p-1.5 text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors rounded-lg hover:bg-[var(--surface-2)] min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={onClose}
            aria-label="Close calendar"
            className="p-1.5 ml-2 text-[var(--content-muted)] hover:text-[var(--content-primary)] transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-4 pt-1 pb-2">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-xs text-[var(--content-muted)] font-medium">
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
                aria-label={`Select ${dateStr}${entries > 0 ? `, ${entries} food entries` : ''}`}
                aria-pressed={isSelected}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reducedMotion ? 0 : i * 0.008 }}
                disabled={isFuture}
                onClick={() => handleSelect(dateStr)}
                className={`relative aspect-square min-h-11 min-w-11 flex flex-col items-center justify-center rounded-lg border text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]
                  ${isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                  ${isSelected ? 'bg-[var(--action-primary)] border-[var(--border-focus)] text-[var(--action-on-primary)]' : ''}
                  ${!isSelected && isCurrentDay ? 'ring-1 ring-[var(--focus-ring)]' : ''}
                  ${!isSelected ? getDayBorderColor(entries) : ''}
                  ${!isSelected ? 'hover:bg-[var(--surface-2)]' : ''}
                `}
              >
                {/* Calorie intensity background */}
                {!isSelected && intensity > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-[var(--action-primary)]"
                    style={{ opacity: intensity * 0.12 }}
                  />
                )}

                {/* Day number */}
                <span
                  className={`relative z-10 font-medium ${
                    isSelected
                      ? 'text-[var(--action-on-primary)]'
                      : isCurrentDay
                        ? 'text-[var(--action-primary)]'
                        : entries > 0
                          ? 'text-[var(--content-primary)]'
                          : 'text-[var(--content-muted)]'
                  }`}
                >
                  {dayNum}
                </span>

                {/* Streak fire */}
                {isStreakDay && !isSelected && (
                  <Icon
                    name="i-flame"
                    size={9}
                    className="absolute -top-0.5 -right-0.5"
                    style={{ color: 'var(--action-primary)' }}
                    aria-hidden
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Bottom summary */}
        <div className="glass-elevated px-4 py-3 flex items-center justify-between text-xs border-t border-[var(--border-default)]">
          <div className="flex items-center gap-3">
            <span className="text-[var(--content-secondary)]">
              <span className="text-[var(--content-primary)] font-medium">{daysLogged}</span> days logged
            </span>
            <span className="text-[var(--content-muted)]">|</span>
            <span className="text-[var(--content-secondary)]">
              avg <span className="text-[var(--content-primary)] font-medium">{avgCalories}</span> kcal
            </span>
          </div>
          <span className={`font-semibold ${consistency >= 80 ? 'text-[var(--status-success-fg)]' : consistency >= 50 ? 'text-[var(--action-primary)]' : 'text-[var(--content-muted)]'}`}>
            {consistency}%
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
