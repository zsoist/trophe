'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Flame } from 'lucide-react';
import { localDateStr } from '../lib/dates';

interface StreakFreezeProps {
  streak: number;
  hasLoggedToday: boolean;
}

// F40: Streak freeze — preserve streak if you miss one day per week
export default function StreakFreeze({ streak, hasLoggedToday }: StreakFreezeProps) {
  const [freezeAvailable, setFreezeAvailable] = useState(() => getInitialFreezeAvailable());

  const useFreeze = () => {
    const week = getWeekKey();
    localStorage.setItem(`trophe_freeze_${week}`, 'true');
    setFreezeAvailable(false);
  };

  // Only show if: streak > 3, not logged today, freeze available
  if (streak < 3 || hasLoggedToday || !freezeAvailable) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-blue-400" />
          <div>
            <p className="text-xs text-blue-300 font-medium">Protect your {streak}-day streak?</p>
            <p className="text-[10px] text-stone-500">1 freeze available per week</p>
          </div>
        </div>
        <button
          onClick={useFreeze}
          className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/30 transition-colors flex items-center gap-1"
        >
          <Flame size={12} />
          Use Freeze
        </button>
      </div>
    </motion.div>
  );
}

function getWeekKey(): string {
  const d = new Date();
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - d.getDay());
  return localDateStr(startOfWeek);
}

function getInitialFreezeAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return !window.localStorage.getItem(`trophe_freeze_${getWeekKey()}`);
}
