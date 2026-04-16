'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { HabitCheckin } from '@/lib/types';
import { localDateStr } from '../lib/dates';

interface ComplianceTrendProps {
  clientHabitId: string | null;
  startDate?: string;
  /** If provided, skip fetching and use these checkins directly */
  checkins?: HabitCheckin[];
}

export default function ComplianceTrend({ clientHabitId, startDate, checkins: externalCheckins }: ComplianceTrendProps) {
  const [fetchedCheckins, setFetchedCheckins] = useState<HabitCheckin[] | null>(externalCheckins ?? null);

  useEffect(() => {
    if (externalCheckins || !clientHabitId) {
      return;
    }

    async function fetchCheckins() {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
      const startStr = localDateStr(fourteenDaysAgo);

      const { data } = await supabase
        .from('habit_checkins')
        .select('*')
        .eq('client_habit_id', clientHabitId)
        .gte('checked_date', startStr)
        .order('checked_date', { ascending: true });

      setFetchedCheckins(data || []);
    }

    void fetchCheckins();
  }, [clientHabitId, externalCheckins]);

  const checkins = externalCheckins ?? fetchedCheckins ?? [];
  const loading = !externalCheckins && !!clientHabitId && fetchedCheckins === null;

  if (loading) return null;

  // Build 14-day grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completedDates = new Set(
    checkins.filter((c) => c.completed).map((c) => c.checked_date)
  );
  const missedDates = new Set(
    checkins.filter((c) => !c.completed).map((c) => c.checked_date)
  );

  const habitStart = startDate ? new Date(startDate) : null;
  if (habitStart) habitStart.setHours(0, 0, 0, 0);

  const days: { date: string; status: 'completed' | 'missed' | 'empty' }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);

    if (completedDates.has(dateStr)) {
      days.push({ date: dateStr, status: 'completed' });
    } else if (missedDates.has(dateStr)) {
      days.push({ date: dateStr, status: 'missed' });
    } else if (d > today || (habitStart && d < habitStart)) {
      days.push({ date: dateStr, status: 'empty' });
    } else {
      // Day within habit range with no checkin = missed
      days.push({ date: dateStr, status: habitStart && d >= habitStart ? 'missed' : 'empty' });
    }
  }

  const completedCount = days.filter((d) => d.status === 'completed').length;
  const activeDays = days.filter((d) => d.status !== 'empty').length;
  const pct = activeDays > 0 ? Math.round((completedCount / activeDays) * 100) : 0;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {days.map((day, i) => (
          <motion.div
            key={day.date}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.03, duration: 0.2 }}
            className={`aspect-square rounded-md w-full ${
              day.status === 'completed'
                ? 'bg-green-500/30 border border-green-500/40'
                : day.status === 'missed'
                ? 'bg-red-500/20 border border-red-500/30'
                : 'bg-white/[0.03] border border-white/5'
            }`}
            title={`${day.date}: ${day.status}`}
          />
        ))}
      </div>
      <p className="text-xs text-stone-500 text-center">
        <span className="text-stone-300 font-medium">{completedCount}/{activeDays || 14}</span> days ({pct}%)
      </p>
    </div>
  );
}
