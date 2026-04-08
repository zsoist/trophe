'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Utensils } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';

interface FastingTimerProps {
  todayLog: FoodLogEntry[];
}

function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function FastingTimer({ todayLog }: FastingTimerProps) {
  const window = useMemo(() => {
    if (todayLog.length === 0) return null;

    const times = todayLog
      .map(e => {
        const d = new Date(e.created_at);
        return d.getHours() + d.getMinutes() / 60;
      })
      .sort((a, b) => a - b);

    const first = times[0];
    const last = times[times.length - 1];
    const duration = last - first;
    const meals = new Set(todayLog.map(e => e.meal_type)).size;

    return { first, last, duration, meals };
  }, [todayLog]);

  if (!window) return null;
  if (window.duration < 0.1) return null; // only 1 meal, no window yet

  const durationH = Math.floor(window.duration);
  const durationM = Math.round((window.duration - durationH) * 60);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Utensils size={12} className="gold-text" />
        <span className="text-stone-300 text-xs font-medium">Eating Window</span>
      </div>

      {/* Simple visual bar */}
      <div className="relative h-5 bg-white/[0.03] rounded-full overflow-hidden mb-2">
        {/* 24h scale, eating window highlighted */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(window.duration / 16) * 100}%` }}
          transition={{ duration: 0.6 }}
          className="absolute h-full bg-[#D4A853]/20 rounded-full"
          style={{ left: `${((window.first - 6) / 16) * 100}%` }}
        />
        {/* Start/end markers */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#D4A853]"
          style={{ left: `${((window.first - 6) / 16) * 100}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#D4A853]"
          style={{ left: `${((window.last - 6) / 16) * 100}%` }}
        />
      </div>

      {/* Times */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-stone-400">
          First meal: <span className="text-stone-200">{formatTime(window.first)}</span>
        </span>
        <span className="gold-text font-bold">
          {durationH}h {durationM}m window
        </span>
        <span className="text-stone-400">
          Last: <span className="text-stone-200">{formatTime(window.last)}</span>
        </span>
      </div>
    </motion.div>
  );
}
