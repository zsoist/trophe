'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Moon, Sun } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';

interface EatingWindowTrackerProps {
  todayLog: FoodLogEntry[];
  historicalWindows?: { date: string; startHour: number; endHour: number }[];
}

function formatTime(hours: number): string {
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

export default function EatingWindowTracker({
  todayLog,
  historicalWindows,
}: EatingWindowTrackerProps) {
  const [now, setNow] = useState(new Date());

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayWindow = useMemo(() => {
    if (todayLog.length === 0) return null;

    const times = todayLog
      .map((entry) => {
        const d = new Date(entry.created_at);
        return d.getHours() + d.getMinutes() / 60;
      })
      .sort((a, b) => a - b);

    return {
      startHour: times[0],
      endHour: times[times.length - 1],
      duration: times[times.length - 1] - times[0],
    };
  }, [todayLog]);

  const avgWindow = useMemo(() => {
    if (!historicalWindows || historicalWindows.length === 0) return null;
    const totalDuration = historicalWindows.reduce(
      (sum, w) => sum + (w.endHour - w.startHour),
      0
    );
    return totalDuration / historicalWindows.length;
  }, [historicalWindows]);

  // Fasting timer
  const fastingInfo = useMemo(() => {
    if (!todayWindow) return null;
    const currentHour = now.getHours() + now.getMinutes() / 60;
    // If current time is after last meal, we're fasting
    if (currentHour > todayWindow.endHour) {
      const fastingSince = todayWindow.endHour;
      const fastingHours = currentHour - fastingSince;
      return { isFasting: true, hours: fastingHours };
    }
    return { isFasting: false, hours: 0 };
  }, [todayWindow, now]);

  const currentHour = now.getHours() + now.getMinutes() / 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
        <Clock size={14} /> Eating Window
      </h3>

      {todayWindow ? (
        <>
          {/* Window summary */}
          <div className="text-center mb-3">
            <p className="text-stone-200 text-sm font-medium">
              {formatTime(todayWindow.startHour)}{' '}
              <span className="text-stone-500 mx-1">&rarr;</span>{' '}
              {formatTime(todayWindow.endHour)}
            </p>
            <p className="gold-text text-lg font-bold">{formatDuration(todayWindow.duration)}</p>
          </div>

          {/* 24h timeline bar */}
          <div className="relative mb-3">
            {/* Hour markers */}
            <div className="flex justify-between text-[8px] text-stone-600 mb-1 px-0.5">
              <span>12AM</span>
              <span>6AM</span>
              <span>12PM</span>
              <span>6PM</span>
              <span>12AM</span>
            </div>

            {/* Track */}
            <div className="relative h-5 rounded-full bg-white/[0.03] border border-white/5 overflow-hidden">
              {/* Eating window */}
              <motion.div
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: `${(todayWindow.startHour / 24) * 100}%`,
                  width: `${(todayWindow.duration / 24) * 100}%`,
                  background: 'linear-gradient(90deg, rgba(212,168,83,0.6), rgba(212,168,83,0.3))',
                }}
                initial={{ scaleX: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />

              {/* Current time marker */}
              <div
                className="absolute top-0 h-full w-px bg-white/40"
                style={{ left: `${(currentHour / 24) * 100}%` }}
              />
            </div>

            {/* Icons */}
            <div className="flex justify-between mt-1 px-1">
              <Moon size={10} className="text-stone-600" />
              <Sun size={10} className="text-stone-500" />
              <Moon size={10} className="text-stone-600" />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-xs border-t border-white/5 pt-3">
            {/* Avg window */}
            {avgWindow !== null && (
              <div className="text-stone-400">
                Avg window:{' '}
                <span className="text-stone-300 font-medium">{formatDuration(avgWindow)}</span>
              </div>
            )}

            {/* Fasting timer */}
            {fastingInfo?.isFasting && (
              <div className="text-stone-400 flex items-center gap-1.5">
                <Moon size={10} className="text-purple-400" />
                Fasting:{' '}
                <span className="text-purple-400 font-medium">
                  {formatDuration(fastingInfo.hours)}
                </span>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-stone-500 text-sm text-center py-3">
          No meals logged today yet
        </p>
      )}
    </motion.div>
  );
}
