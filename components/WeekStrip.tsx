'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface WeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  weekData: { date: string; calories: number; entries: number }[];
}

function getDayLetter(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()];
}

function getDayNumber(dateStr: string): number {
  return parseInt(dateStr.split('-')[2], 10);
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

export default function WeekStrip({
  selectedDate,
  onSelectDate,
  weekData,
}: WeekStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find max calories for normalization
  const maxCal = Math.max(...weekData.map((d) => d.calories), 1);

  // Scroll selected day into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const idx = weekData.findIndex((d) => d.date === selectedDate);
    if (idx >= 0) {
      const child = scrollRef.current.children[idx] as HTMLElement | undefined;
      child?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedDate, weekData]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto scrollbar-none px-1 py-1"
    >
      {weekData.map((day, i) => {
        const selected = day.date === selectedDate;
        const today = isToday(day.date);
        const barHeight = day.calories > 0 ? Math.max(4, (day.calories / maxCal) * 16) : 0;

        return (
          <motion.button
            key={day.date}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelectDate(day.date)}
            className={`flex flex-col items-center justify-end gap-0.5 min-w-[38px] h-12 rounded-lg px-1 pt-1 pb-1 transition-all relative ${
              selected
                ? 'border border-[#D4A853]/50 bg-[#D4A853]/10'
                : 'border border-transparent hover:bg-white/[0.03]'
            }`}
          >
            {/* Day letter */}
            <span
              className={`text-[9px] font-medium leading-none ${
                selected ? 'text-[#D4A853]' : 'text-stone-500'
              }`}
            >
              {getDayLetter(day.date)}
            </span>

            {/* Day number */}
            <span
              className={`text-[11px] font-semibold leading-none ${
                selected ? 'text-stone-100' : 'text-stone-400'
              }`}
            >
              {getDayNumber(day.date)}
            </span>

            {/* Mini calorie bar */}
            <div className="w-3 flex items-end justify-center h-4">
              {barHeight > 0 && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: barHeight }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  className={`w-full rounded-sm ${
                    selected ? 'bg-[#D4A853]' : 'bg-stone-600'
                  }`}
                />
              )}
            </div>

            {/* Today dot */}
            {today && (
              <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#D4A853]" />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
