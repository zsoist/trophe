'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarClock, Check, ChevronLeft, ChevronRight } from 'lucide-react';

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

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

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

function labelFor(date: Date, state: CalendarState) {
  const labels: Record<CalendarState, string> = {
    scheduled: 'scheduled workout', completed: 'completed workout', both: 'scheduled and completed workout', today: 'today, no workout logged', none: 'no workout scheduled or completed',
  };
  return `${dateFormatter.format(date)}: ${labels[state]}`;
}

export function WorkoutCalendar({ month, scheduled, completed, today, selectedDate, onSelect, onMonthChange }: WorkoutCalendarProps) {
  const initial = useMemo(() => new Date(`${month}-01T12:00:00`), [month]);
  const [visibleMonth, setVisibleMonth] = useState(initial);
  const scheduledDays = useMemo(() => new Set(scheduled), [scheduled]);
  const completedDays = useMemo(() => new Set(completed), [completed]);
  const cells = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const moveMonth = (amount: number) => setVisibleMonth((current) => { const next = new Date(current.getFullYear(), current.getMonth() + amount, 1); onMonthChange?.(dateKey(next).slice(0, 7)); return next; });

  return (
    <section aria-labelledby="workout-calendar-title" className="rounded-xl bg-[var(--surface-subtle)] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-[var(--content-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronLeft size={18} /></button>
        <h2 id="workout-calendar-title" className="text-base font-semibold text-[var(--content-primary)]">{monthFormatter.format(visibleMonth)}</h2>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Next month" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-[var(--content-secondary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${monthFormatter.format(visibleMonth)} workout calendar`}>
        {Array.from({ length: 7 }, (_, index) => <span key={index} className="py-1 text-[11px] font-medium text-[var(--content-muted)]">{weekdayFormatter.format(new Date(2026, 7, 2 + index))}</span>)}
        {cells.map((date) => {
          const key = dateKey(date);
          const state = stateFor(key, scheduledDays, completedDays, today);
          const muted = date.getMonth() !== visibleMonth.getMonth();
          const icon = state === 'both' ? <><CalendarClock size={11} /><Check size={10} /></> : state === 'scheduled' ? <CalendarClock size={12} /> : state === 'completed' ? <CalendarCheck size={12} /> : null;
          const dayLabel = `${labelFor(date, state)}${key === today && state !== 'today' ? ', today' : ''}`;
          return <button type="button" key={key} role="gridcell" aria-label={dayLabel} aria-pressed={key === selectedDate} onClick={() => onSelect?.(key)} className={`min-h-11 rounded-lg px-0.5 py-1 text-xs ${muted ? 'text-[var(--content-muted)] opacity-60' : 'text-[var(--content-primary)]'} ${key === today || key === selectedDate ? 'outline outline-1 outline-[var(--action-primary)]' : ''}`}>
            <span className="block tabular-nums">{date.getDate()}</span>
            <span className="mt-0.5 flex min-h-3 items-center justify-center gap-0.5 text-[var(--content-secondary)]" aria-hidden>{icon}</span>
          </button>;
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--content-muted)]"><CalendarClock className="mr-1 inline" size={12} />Scheduled <span className="mx-2" aria-hidden>·</span><CalendarCheck className="mr-1 inline" size={12} />Completed <span className="mx-2" aria-hidden>·</span><CalendarClock className="mr-1 inline" size={12} /><Check className="-ml-0.5 inline" size={10} />Scheduled and completed</p>
    </section>
  );
}
