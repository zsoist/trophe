'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { localDateStr } from '../lib/dates';

interface DateNavigatorProps {
  selectedDate: string; // ISO date string YYYY-MM-DD
  onDateChange: (date: string) => void;
  onOpenCalendar: () => void;
}

function formatDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const toISO = localDateStr;

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

function isToday(dateStr: string): boolean {
  return dateStr === toISO(new Date());
}

export default function DateNavigator({
  selectedDate,
  onDateChange,
  onOpenCalendar,
}: DateNavigatorProps) {
  const [direction, setDirection] = useState(0);
  const today = isToday(selectedDate);

  const goBack = useCallback(() => {
    setDirection(-1);
    onDateChange(addDays(selectedDate, -1));
  }, [selectedDate, onDateChange]);

  const goForward = useCallback(() => {
    if (today) return;
    setDirection(1);
    onDateChange(addDays(selectedDate, 1));
  }, [selectedDate, onDateChange, today]);

  const goToToday = useCallback(() => {
    setDirection(1);
    onDateChange(toISO(new Date()));
  }, [onDateChange]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 50;
      if (info.offset.x > threshold) {
        goBack();
      } else if (info.offset.x < -threshold) {
        goForward();
      }
    },
    [goBack, goForward]
  );

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 40 : -40,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -40 : 40,
      opacity: 0,
    }),
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      className="glass flex items-center justify-between px-3 py-2.5 select-none"
    >
      {/* Left arrow */}
      <button
        onClick={goBack}
        className="p-1.5 text-stone-400 hover:text-stone-200 active:scale-90 transition-all rounded-lg hover:bg-white/[0.04]"
        aria-label="Previous day"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Date display */}
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
        <button
          onClick={onOpenCalendar}
          className="p-1 text-stone-500 hover:text-[#D4A853] transition-colors"
          aria-label="Open calendar"
        >
          <Calendar size={15} />
        </button>

        <div className="relative h-6 flex items-center overflow-hidden min-w-[120px] justify-center">
          <AnimatePresence mode="popLayout" custom={direction}>
            <motion.span
              key={selectedDate}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="text-stone-200 text-sm font-medium whitespace-nowrap"
            >
              {formatDate(selectedDate)}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Today chip */}
        <AnimatePresence>
          {!today && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={goToToday}
              className="text-[10px] font-semibold text-[#D4A853] bg-[#D4A853]/10 border border-[#D4A853]/20 rounded-full px-2 py-0.5 hover:bg-[#D4A853]/20 transition-colors whitespace-nowrap"
            >
              Today
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Right arrow */}
      <button
        onClick={goForward}
        disabled={today}
        className={`p-1.5 rounded-lg transition-all ${
          today
            ? 'text-stone-700 cursor-not-allowed'
            : 'text-stone-400 hover:text-stone-200 active:scale-90 hover:bg-white/[0.04]'
        }`}
        aria-label="Next day"
      >
        <ChevronRight size={18} />
      </button>
    </motion.div>
  );
}
