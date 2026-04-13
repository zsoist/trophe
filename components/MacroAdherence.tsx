'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface MacroAdherenceProps {
  userId: string;
  targets: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

interface DayTotals {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface MacroBar {
  label: string;
  key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';
  color: string;
  unit: string;
  daysOnTarget: number;
  adherence: number;
  avgValue: number;
  targetValue: number;
}

function adherenceScore(actual: number, target: number): number {
  if (target === 0) return 0;
  const ratio = actual / target;
  // Score: 100% when within 10% of target, linear falloff
  if (ratio >= 0.9 && ratio <= 1.1) return 100;
  if (ratio < 0.9) return Math.max(0, Math.round((ratio / 0.9) * 100));
  return Math.max(0, Math.round(((2.1 - ratio) / 1.1) * 100));
}

export default function MacroAdherence({ userId, targets }: MacroAdherenceProps) {
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayTotals[]>([]);
  const [overallScore, setOverallScore] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const days: DayTotals[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setDate(day.getDate() - i);
        days.push({
          date: day.toISOString().split('T')[0],
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
        });
      }

      const { data } = await supabase
        .from('food_log')
        .select('logged_date, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', userId)
        .gte('logged_date', days[0].date)
        .lte('logged_date', days[6].date);

      if (cancelled) return;

      if (data) {
        for (const entry of data) {
          const matchingDay = days.find((day) => day.date === entry.logged_date);
          if (matchingDay) {
            matchingDay.calories += entry.calories ?? 0;
            matchingDay.protein_g += entry.protein_g ?? 0;
            matchingDay.carbs_g += entry.carbs_g ?? 0;
            matchingDay.fat_g += entry.fat_g ?? 0;
          }
        }
      }

      const activeDays = days.filter((day) => day.calories > 0);
      setDayData(activeDays);

      if (activeDays.length > 0) {
        const scores = activeDays.map((day) => {
          const calScore = adherenceScore(day.calories, targets.calories);
          const proScore = adherenceScore(day.protein_g, targets.protein_g);
          const carbScore = adherenceScore(day.carbs_g, targets.carbs_g);
          const fatScore = adherenceScore(day.fat_g, targets.fat_g);
          return (calScore + proScore + carbScore + fatScore) / 4;
        });
        setOverallScore(Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
      }

      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, targets]);

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">Loading adherence...</div>
      </div>
    );
  }

  const activeDays = dayData;
  const totalDays = 7;

  const macros: MacroBar[] = [
    {
      label: 'Calories',
      key: 'calories',
      color: '#D4A853',
      unit: 'kcal',
      daysOnTarget: activeDays.filter((d) => adherenceScore(d.calories, targets.calories) >= 80).length,
      adherence: activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + adherenceScore(d.calories, targets.calories), 0) / activeDays.length)
        : 0,
      avgValue: activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.calories, 0) / activeDays.length) : 0,
      targetValue: targets.calories,
    },
    {
      label: 'Protein',
      key: 'protein_g',
      color: '#ef4444',
      unit: 'g',
      daysOnTarget: activeDays.filter((d) => adherenceScore(d.protein_g, targets.protein_g) >= 80).length,
      adherence: activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + adherenceScore(d.protein_g, targets.protein_g), 0) / activeDays.length)
        : 0,
      avgValue: activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.protein_g, 0) / activeDays.length) : 0,
      targetValue: targets.protein_g,
    },
    {
      label: 'Carbs',
      key: 'carbs_g',
      color: '#3b82f6',
      unit: 'g',
      daysOnTarget: activeDays.filter((d) => adherenceScore(d.carbs_g, targets.carbs_g) >= 80).length,
      adherence: activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + adherenceScore(d.carbs_g, targets.carbs_g), 0) / activeDays.length)
        : 0,
      avgValue: activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.carbs_g, 0) / activeDays.length) : 0,
      targetValue: targets.carbs_g,
    },
    {
      label: 'Fat',
      key: 'fat_g',
      color: '#a855f7',
      unit: 'g',
      daysOnTarget: activeDays.filter((d) => adherenceScore(d.fat_g, targets.fat_g) >= 80).length,
      adherence: activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + adherenceScore(d.fat_g, targets.fat_g), 0) / activeDays.length)
        : 0,
      avgValue: activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.fat_g, 0) / activeDays.length) : 0,
      targetValue: targets.fat_g,
    },
  ];

  function scoreColor(score: number): string {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-[#D4A853]';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <Target size={14} /> Weekly Adherence
      </h3>

      {/* Overall score */}
      <div className="text-center mb-4">
        <motion.p
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15, delay: 0.2 }}
          className={`text-4xl font-bold ${scoreColor(overallScore)}`}
        >
          {overallScore}%
        </motion.p>
        <p className="text-stone-500 text-xs mt-1">
          {activeDays.length} of {totalDays} days logged
        </p>
      </div>

      {/* Per-macro bars */}
      <div className="space-y-3">
        {macros.map((macro, i) => (
          <div key={macro.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-stone-300 text-xs font-medium">{macro.label}</span>
              <span className="text-stone-400 text-[10px]">
                {macro.daysOnTarget}/{activeDays.length} days on target
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ backgroundColor: macro.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, macro.adherence)}%` }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.08 }}
              />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-stone-600 text-[9px]">
                avg {macro.avgValue}{macro.unit} / {macro.targetValue}{macro.unit}
              </span>
              <span className={`text-[10px] font-medium ${scoreColor(macro.adherence)}`}>
                {macro.adherence}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
