'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';

type CalendarState = 'scheduled' | 'completed' | 'both' | 'today' | 'none';

export interface WorkoutCalendarProps {
  month: string;
  scheduled: string[];
  completed: string[];
  today?: string;
  selectedDate?: string;
  onSelect?: (date: string) => void;
  onMonthChange?: (month: string) => void;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function stateFor(day: string, scheduled: Set<string>, completed: Set<string>, today?: string): CalendarState {
  if (scheduled.has(day) && completed.has(day)) return 'both';
  if (scheduled.has(day)) return 'scheduled';
  if (completed.has(day)) return 'completed';
  if (day === today) return 'today';
  return 'none';
}

const stateCopyKey: Record<CalendarState, string> = {
  scheduled: 'workout.analytics_day_scheduled',
  completed: 'workout.analytics_day_completed',
  both: 'workout.analytics_day_both',
  today: 'workout.analytics_day_today_empty',
  none: 'workout.analytics_day_none',
};

export function WorkoutCalendar({ month, scheduled, completed, today, selectedDate, onSelect, onMonthChange }: WorkoutCalendarProps) {
  const { lang, t } = useI18n();
  const locale = localeForLanguage(lang);
  const initial = useMemo(() => new Date(`${month}-01T12:00:00`), [month]);
  const [monthOverride, setMonthOverride] = useState<{ source: string; date: Date } | null>(null);
  const visibleMonth = monthOverride?.source === month ? monthOverride.date : initial;

  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }), [locale]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }), [locale]);
  const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short' }), [locale]);
  const scheduledDays = useMemo(() => new Set(scheduled), [scheduled]);
  const completedDays = useMemo(() => new Set(completed), [completed]);
  const cells = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);
  const monthLabel = monthFormatter.format(visibleMonth);

  const moveMonth = (amount: number) => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1, 12);
    setMonthOverride({ source: month, date: next });
    onMonthChange?.(dateKey(next).slice(0, 7));
  };

  return (
    <section aria-labelledby="workout-calendar-title" className="rounded-xl bg-[var(--surface-subtle)] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => moveMonth(-1)} aria-label={t('workout.analytics_previous_month')} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-[var(--content-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronLeft size={18} /></button>
        <h2 id="workout-calendar-title" className="text-base font-semibold text-[var(--content-primary)]">{monthLabel}</h2>
        <button type="button" onClick={() => moveMonth(1)} aria-label={t('workout.analytics_next_month')} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-[var(--content-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={t('workout.analytics_calendar_grid', { month: monthLabel })}>
        {Array.from({ length: 7 }, (_, index) => <span key={index} className="py-1 text-[11px] font-medium text-[var(--content-muted)]">{weekdayFormatter.format(new Date(2026, 7, 2 + index, 12))}</span>)}
        {cells.map((date) => {
          const key = dateKey(date);
          const state = stateFor(key, scheduledDays, completedDays, today);
          const muted = date.getMonth() !== visibleMonth.getMonth();
          const icon = state === 'both' ? <><CalendarClock size={11} /><Check size={10} /></> : state === 'scheduled' ? <CalendarClock size={12} /> : state === 'completed' ? <CalendarCheck size={12} /> : null;
          const suffix = key === today && state !== 'today' ? `, ${t('workout.analytics_today_suffix')}` : '';
          const dayLabel = `${dateFormatter.format(date)}: ${t(stateCopyKey[state])}${suffix}`;
          return <div key={key} role="gridcell" aria-label={dayLabel}><button type="button" aria-pressed={key === selectedDate} onClick={() => onSelect?.(key)} className={`min-h-11 w-full rounded-lg px-0.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${muted ? 'text-[var(--content-muted)] opacity-60' : 'text-[var(--content-primary)]'} ${key === today || key === selectedDate ? 'outline outline-1 outline-[var(--action-primary)]' : ''}`}>
            <span className="block tabular-nums">{date.getDate()}</span>
            <span className="mt-0.5 flex min-h-3 items-center justify-center gap-0.5 text-[var(--content-secondary)]" aria-hidden>{icon}</span>
          </button></div>;
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--content-muted)]"><CalendarClock className="mr-1 inline" size={12} />{t('workout.analytics_legend_scheduled')} <span className="mx-2" aria-hidden>·</span><CalendarCheck className="mr-1 inline" size={12} />{t('workout.analytics_legend_completed')} <span className="mx-2" aria-hidden>·</span><CalendarClock className="mr-1 inline" size={12} /><Check className="-ml-0.5 inline" size={10} />{t('workout.analytics_legend_both')}</p>
    </section>
  );
}
