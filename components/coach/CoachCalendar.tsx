'use client';

import { memo, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type EventType = 'checkin' | 'progression' | 'measurement' | 'note';

interface CalendarEvent {
  date: string;
  type: EventType;
  clientName: string;
}

interface CoachCalendarProps {
  events: CalendarEvent[];
}

// No emoji-as-icons (design rule): events are identified by their color dot + label.
const EVENT_META: Record<EventType, { color: string; label: string }> = {
  checkin: { color: 'var(--status-success-fg)', label: 'Check-in' },
  progression: { color: 'var(--action-primary)', label: 'Progression' },
  measurement: { color: 'var(--status-info-fg)', label: 'Measurement' },
  note: { color: 'var(--data-fat)', label: 'Note' },
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default memo(function CoachCalendar({ events }: CoachCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = ev.date.slice(0, 10); // YYYY-MM-DD
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = getFirstDayOffset(year, month);

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
    setSelectedDay(null);
  }, [setMonth, setYear, setSelectedDay]);

  const nextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
    setSelectedDay(null);
  }, [setMonth, setYear, setSelectedDay]);

  const selectedEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDate.get(selectedDay) ?? [];
  }, [selectedDay, eventsByDate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          aria-label="Previous month"
          onClick={prevMonth}
          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <h3 className="text-[var(--content-primary)] text-sm font-semibold">{monthLabel}</h3>
        <button
          type="button"
          aria-label="Next month"
          onClick={nextMonth}
          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-[var(--content-muted)] text-xs text-center font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = formatDateKey(year, month, day);
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDay;

          // Collect unique event types for dots
          const uniqueTypes = [...new Set(dayEvents.map((e) => e.type))];

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(dateKey === selectedDay ? null : dateKey)}
              className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                isSelected
                  ? 'bg-[var(--action-primary)]/20 border border-[var(--action-primary)]/40'
                  : isToday
                    ? 'bg-[var(--action-primary)]/10 border border-[var(--action-primary)]/20'
                    : 'hover:bg-[var(--surface-hover)] border border-transparent'
              }`}
            >
              <span
                className={`text-xs font-medium ${
                  isToday ? 'text-[var(--action-primary)]' : isSelected ? 'text-[var(--content-primary)]' : 'text-[var(--content-secondary)]'
                }`}
              >
                {day}
              </span>
              {uniqueTypes.length > 0 && (
                <div className="flex gap-0.5">
                  {uniqueTypes.slice(0, 3).map((type) => (
                    <div
                      key={type}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: EVENT_META[type].color }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <AnimatePresence>
        {selectedDay && selectedEvents.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
              <p className="text-[var(--content-muted)] text-xs font-medium uppercase tracking-wider">
                {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              {selectedEvents.map((ev, idx) => {
                const meta = EVENT_META[ev.type];
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.2 }}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-[var(--surface-hover)]"
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}20` }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    </div>
                    <span className="text-[var(--content-secondary)] text-xs flex-1 truncate">{ev.clientName}</span>
                    <span className="text-[var(--content-muted)] text-xs flex-shrink-0">{meta.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-[var(--border-subtle)]">
        {Object.entries(EVENT_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="text-[var(--content-muted)] text-xs">{meta.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
});
