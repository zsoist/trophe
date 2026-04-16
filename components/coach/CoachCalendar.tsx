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

const EVENT_META: Record<EventType, { color: string; label: string; emoji: string }> = {
  checkin: { color: '#4ade80', label: 'Check-in', emoji: '\u2705' },
  progression: { color: '#D4A853', label: 'Progression', emoji: '\uD83D\uDE80' },
  measurement: { color: '#60a5fa', label: 'Measurement', emoji: '\uD83D\uDCCF' },
  note: { color: '#a78bfa', label: 'Note', emoji: '\uD83D\uDCDD' },
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
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-stone-400 hover:text-stone-200"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="text-stone-200 text-sm font-semibold">{monthLabel}</h3>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-stone-400 hover:text-stone-200"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-stone-600 text-[10px] text-center font-medium py-1">
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
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                isSelected
                  ? 'bg-[#D4A853]/20 border border-[#D4A853]/40'
                  : isToday
                    ? 'bg-[#D4A853]/10 border border-[#D4A853]/20'
                    : 'hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <span
                className={`text-[11px] font-medium ${
                  isToday ? 'text-[#D4A853]' : isSelected ? 'text-stone-100' : 'text-stone-400'
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
            <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
              <p className="text-stone-500 text-[10px] font-medium uppercase tracking-wider">
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
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02]"
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}20` }}
                    >
                      {meta.emoji}
                    </div>
                    <span className="text-stone-300 text-xs flex-1 truncate">{ev.clientName}</span>
                    <span className="text-stone-600 text-[10px] flex-shrink-0">{meta.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
        {Object.entries(EVENT_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="text-stone-600 text-[9px]">{meta.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
});
