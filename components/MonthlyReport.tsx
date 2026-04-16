'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, TrendingUp, TrendingDown, Minus, Award, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '../lib/dates';

interface MonthlyReportProps {
  userId: string;
  targets: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

interface MonthStats {
  daysLogged: number;
  daysInMonth: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  consistency: number; // percentage of days logged
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  // Comparison to previous month
  prevAvgCalories: number | null;
  prevConsistency: number | null;
}

function dayScore(
  cals: number,
  protein: number,
  targetCals: number,
  targetProtein: number
): number {
  const calRatio = targetCals > 0 ? cals / targetCals : 0;
  const proRatio = targetProtein > 0 ? protein / targetProtein : 0;
  const calScore = calRatio >= 0.85 && calRatio <= 1.15 ? 100 : Math.max(0, 100 - Math.abs(1 - calRatio) * 150);
  const proScore = proRatio >= 0.85 ? Math.min(100, proRatio * 100) : proRatio * 100;
  return Math.round((calScore + proScore) / 2);
}

function getGrade(adherence: number, consistency: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  const score = adherence * 0.6 + consistency * 0.4;
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-400';
    case 'B': return 'text-[#D4A853]';
    case 'C': return 'text-orange-400';
    case 'D': return 'text-red-400';
    default: return 'text-red-500';
  }
}

function gradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-500/10 border-green-500/20';
    case 'B': return 'bg-[#D4A853]/10 border-[#D4A853]/20';
    case 'C': return 'bg-orange-500/10 border-orange-500/20';
    default: return 'bg-red-500/10 border-red-500/20';
  }
}

export default function MonthlyReport({ userId, targets }: MonthlyReportProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MonthStats | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const firstDay = localDateStr(new Date(year, month, 1));
      const lastDay = localDateStr(new Date(year, month + 1, 0));
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysSoFar = now.getDate();

      const prevFirst = localDateStr(new Date(year, month - 1, 1));
      const prevLast = localDateStr(new Date(year, month, 0));
      const prevDaysInMonth = new Date(year, month, 0).getDate();

      const [currentRes, prevRes] = await Promise.all([
        supabase
          .from('food_log')
          .select('logged_date, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', userId)
          .gte('logged_date', firstDay)
          .lte('logged_date', lastDay),
        supabase
          .from('food_log')
          .select('logged_date, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', userId)
          .gte('logged_date', prevFirst)
          .lte('logged_date', prevLast),
      ]);

      if (cancelled) return;

      const dateMap: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
      for (const entry of currentRes.data ?? []) {
        const date = entry.logged_date;
        if (!dateMap[date]) {
          dateMap[date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        }
        dateMap[date].calories += entry.calories ?? 0;
        dateMap[date].protein += entry.protein_g ?? 0;
        dateMap[date].carbs += entry.carbs_g ?? 0;
        dateMap[date].fat += entry.fat_g ?? 0;
      }

      const loggedDates = Object.entries(dateMap).filter(([, totals]) => totals.calories > 0);
      const daysLogged = loggedDates.length;
      const consistency = daysSoFar > 0 ? Math.round((daysLogged / daysSoFar) * 100) : 0;

      const avgCalories = daysLogged > 0 ? Math.round(loggedDates.reduce((sum, [, totals]) => sum + totals.calories, 0) / daysLogged) : 0;
      const avgProtein = daysLogged > 0 ? Math.round(loggedDates.reduce((sum, [, totals]) => sum + totals.protein, 0) / daysLogged) : 0;
      const avgCarbs = daysLogged > 0 ? Math.round(loggedDates.reduce((sum, [, totals]) => sum + totals.carbs, 0) / daysLogged) : 0;
      const avgFat = daysLogged > 0 ? Math.round(loggedDates.reduce((sum, [, totals]) => sum + totals.fat, 0) / daysLogged) : 0;

      let bestDay: { date: string; score: number } | null = null;
      let worstDay: { date: string; score: number } | null = null;

      for (const [date, totals] of loggedDates) {
        const score = dayScore(totals.calories, totals.protein, targets.calories, targets.protein_g);
        if (!bestDay || score > bestDay.score) bestDay = { date, score };
        if (!worstDay || score < worstDay.score) worstDay = { date, score };
      }

      const adherenceScores = loggedDates.map(([, totals]) =>
        dayScore(totals.calories, totals.protein, targets.calories, targets.protein_g)
      );
      const avgAdherence = adherenceScores.length > 0
        ? Math.round(adherenceScores.reduce((sum, value) => sum + value, 0) / adherenceScores.length)
        : 0;

      const prevDateMap: Record<string, number> = {};
      for (const entry of prevRes.data ?? []) {
        prevDateMap[entry.logged_date] = (prevDateMap[entry.logged_date] ?? 0) + (entry.calories ?? 0);
      }
      const prevLogged = Object.values(prevDateMap).filter((value) => value > 0);
      const prevAvgCalories = prevLogged.length > 0 ? Math.round(prevLogged.reduce((sum, value) => sum + value, 0) / prevLogged.length) : null;
      const prevConsistency = prevDaysInMonth > 0 ? Math.round((prevLogged.length / prevDaysInMonth) * 100) : null;

      setStats({
        daysLogged,
        daysInMonth,
        avgCalories,
        avgProtein,
        avgCarbs,
        avgFat,
        consistency,
        bestDay,
        worstDay,
        grade: getGrade(avgAdherence, consistency),
        prevAvgCalories,
        prevConsistency,
      });
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
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">Loading report...</div>
      </div>
    );
  }

  if (!stats || stats.daysLogged === 0) {
    return (
      <div className="glass p-5 mb-4">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
          <FileText size={14} /> Monthly Report
        </h3>
        <p className="text-stone-500 text-sm text-center py-4">No data this month yet</p>
      </div>
    );
  }

  const monthName = new Date().toLocaleString('en', { month: 'long' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <FileText size={14} /> Monthly Report
        </h3>
        <span className="text-stone-500 text-xs">{monthName}</span>
      </div>

      {/* Grade */}
      <div className="flex items-center justify-center mb-4">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, delay: 0.2 }}
          className={`w-20 h-20 rounded-2xl border flex items-center justify-center ${gradeBg(stats.grade)}`}
        >
          <span className={`text-4xl font-black ${gradeColor(stats.grade)}`}>{stats.grade}</span>
        </motion.div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard
          label="Days Logged"
          value={`${stats.daysLogged}`}
          sub={`of ${stats.daysInMonth}`}
          icon={<Calendar size={10} className="text-stone-500" />}
        />
        <MetricCard
          label="Consistency"
          value={`${stats.consistency}%`}
          trend={renderTrendIcon(stats.consistency, stats.prevConsistency)}
        />
        <MetricCard
          label="Avg Calories"
          value={`${stats.avgCalories}`}
          sub="kcal"
          trend={renderTrendIcon(stats.avgCalories, stats.prevAvgCalories)}
        />
        <MetricCard
          label="Avg Protein"
          value={`${stats.avgProtein}g`}
          sub={`/ ${targets.protein_g}g`}
        />
        <MetricCard
          label="Best Day"
          value={stats.bestDay ? formatDateShort(stats.bestDay.date) : '-'}
          sub={stats.bestDay ? `${stats.bestDay.score}pts` : ''}
          icon={<Award size={10} className="text-green-400" />}
        />
        <MetricCard
          label="Worst Day"
          value={stats.worstDay ? formatDateShort(stats.worstDay.date) : '-'}
          sub={stats.worstDay ? `${stats.worstDay.score}pts` : ''}
        />
      </div>
    </motion.div>
  );
}

function renderTrendIcon(current: number, prev: number | null) {
  if (prev === null) return null;
  const diff = current - prev;
  if (Math.abs(diff) < 3) return <Minus size={10} className="text-stone-500" />;
  if (diff > 0) return <TrendingUp size={10} className="text-green-400" />;
  return <TrendingDown size={10} className="text-red-400" />;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  trend?: React.ReactNode;
}) {
  return (
    <div className="glass-elevated p-3 rounded-xl">
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <span className="text-stone-500 text-[10px] uppercase tracking-wider">{label}</span>
        {trend && <span className="ml-auto">{trend}</span>}
      </div>
      <p className="text-stone-200 text-lg font-bold leading-tight">
        {value}
        {sub && <span className="text-stone-500 text-xs font-normal ml-1">{sub}</span>}
      </p>
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
