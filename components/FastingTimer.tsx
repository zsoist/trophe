'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Moon, Sun, Timer } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';

interface FastingTimerProps {
  todayLog: FoodLogEntry[];
}

function formatTime12(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function FastingTimer({ todayLog }: FastingTimerProps) {
  const [now, setNow] = useState(new Date());

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const mealWindow = useMemo(() => {
    if (todayLog.length === 0) return null;

    const times = todayLog
      .map((entry) => {
        const d = new Date(entry.created_at);
        return d.getHours() + d.getMinutes() / 60;
      })
      .sort((a, b) => a - b);

    const firstMeal = times[0];
    const lastMeal = times[times.length - 1];
    const eatingDuration = lastMeal - firstMeal;

    return { firstMeal, lastMeal, eatingDuration };
  }, [todayLog]);

  const currentHour = now.getHours() + now.getMinutes() / 60;

  const fastingInfo = useMemo(() => {
    if (!mealWindow) return null;

    const isFasting = currentHour > mealWindow.lastMeal + 0.5; // 30min buffer after last meal
    if (!isFasting) return { isFasting: false, duration: 0 };

    const fastingSince = mealWindow.lastMeal;
    const fastingDuration = currentHour - fastingSince;

    // Projected fasting end: assume next meal at same time as today's first
    const projectedEnd = mealWindow.firstMeal + 24;
    const totalFast = projectedEnd - fastingSince;
    const remaining = projectedEnd - currentHour;

    return {
      isFasting: true,
      duration: fastingDuration,
      totalProjected: totalFast,
      remaining: remaining > 0 ? remaining : 0,
    };
  }, [mealWindow, currentHour]);

  // No meals yet
  if (!mealWindow) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass p-4 mb-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center">
            <Timer size={14} className="text-stone-500" />
          </div>
          <div>
            <p className="text-stone-300 text-sm font-medium">Start your eating window</p>
            <p className="text-stone-500 text-xs">Log your first meal to begin tracking</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const eatingPct = (mealWindow.eatingDuration / 24) * 100;
  const eatingStart = (mealWindow.firstMeal / 24) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass p-4 mb-4"
    >
      {/* Eating window */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sun size={12} className="text-[#D4A853]" />
          <span className="text-stone-400 text-xs">Eating</span>
        </div>
        <span className="text-stone-300 text-xs">
          {formatTime12(mealWindow.firstMeal)} → {formatTime12(mealWindow.lastMeal)}
          <span className="text-[#D4A853] font-medium ml-1.5">
            {formatDuration(mealWindow.eatingDuration)}
          </span>
        </span>
      </div>

      {/* Fasting window */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Moon size={12} className="text-purple-400" />
          <span className="text-stone-400 text-xs">Fasting</span>
        </div>
        <span className="text-stone-300 text-xs">
          {formatTime12(mealWindow.lastMeal)} → {formatTime12(mealWindow.firstMeal)}
          <span className="text-purple-400 font-medium ml-1.5">
            {formatDuration(24 - mealWindow.eatingDuration)}
          </span>
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-4 rounded-full bg-purple-900/20 border border-white/5 overflow-hidden mb-2">
        {/* Eating window */}
        <motion.div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${eatingStart}%`,
            width: `${eatingPct}%`,
            background: 'linear-gradient(90deg, rgba(212,168,83,0.5), rgba(212,168,83,0.3))',
          }}
          initial={{ scaleX: 0, transformOrigin: 'left' }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6 }}
        />
        {/* Current time marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/60 rounded-full"
          style={{ left: `${(currentHour / 24) * 100}%` }}
        />
      </div>

      {/* Hour labels */}
      <div className="flex justify-between text-[8px] text-stone-600 mb-2">
        <span>12AM</span>
        <span>6AM</span>
        <span>12PM</span>
        <span>6PM</span>
        <span>12AM</span>
      </div>

      {/* Live fasting countdown */}
      {fastingInfo?.isFasting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-2 border-t border-white/5 pt-2"
        >
          <Moon size={10} className="text-purple-400" />
          <span className="text-purple-400 text-xs font-medium">
            Fasting for {formatDuration(fastingInfo.duration)}
          </span>
          {(fastingInfo.remaining ?? 0) > 0 && (
            <span className="text-stone-500 text-[10px]">
              ({formatDuration(fastingInfo.remaining ?? 0)} to go)
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
