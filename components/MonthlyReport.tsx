'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, TrendingUp, TrendingDown, Minus, Award, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
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

interface PeriodStats {
  daysLogged: number;
  daysTotal: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  consistency: number;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  prevAvgCalories: number | null;
  prevConsistency: number | null;
  // Additional insightful fields
  daysHitProtein: number;
  daysHitCalories: number;
  totalCalories: number;
  totalProtein: number;
  label: string; // e.g. "This week", "May 2026"
}

type Period = 'week' | 'month' | 'custom';

function dayScore(cals: number, protein: number, targetCals: number, targetProtein: number): number {
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

function gradeInsight(grade: string, consistency: number, daysHitProtein: number, daysLogged: number): string {
  if (daysLogged === 0) return 'Start logging to see your grade here.';
  const pctProtein = daysLogged > 0 ? Math.round((daysHitProtein / daysLogged) * 100) : 0;
  switch (grade) {
    case 'A': return `Outstanding consistency — you hit protein on ${pctProtein}% of days. Keep it up!`;
    case 'B': return `Solid work. ${consistency}% logging rate — push protein to 90%+ on logged days.`;
    case 'C': return `Room to grow. ${pctProtein}% protein days logged. Focus on consistency first.`;
    case 'D': return `Tracking gaps are hurting your grade. Even partial logs count — start there.`;
    default: return `Every streak starts somewhere. Log tomorrow and build from there.`;
  }
}

function getPeriodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const now = new Date();
  if (period === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    return {
      from: localDateStr(weekAgo),
      to: localDateStr(now),
      label: 'Last 7 days',
    };
  }
  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: localDateStr(firstDay),
      to: localDateStr(lastDay),
      label: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
    };
  }
  // custom
  return {
    from: customFrom || localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: customTo || localDateStr(now),
    label: `${customFrom} → ${customTo}`,
  };
}

export default function MonthlyReport({ userId, targets }: MonthlyReportProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  // Custom date range
  const todayStr = localDateStr(new Date());
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return localDateStr(d);
  });
  const [customTo, setCustomTo] = useState(todayStr);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function loadData() {
      if (!userId) return;

      const { from, to, label } = getPeriodRange(period, customFrom, customTo);

      // Previous period for comparison (same duration)
      const fromD = new Date(from + 'T12:00:00');
      const toD = new Date(to + 'T12:00:00');
      const durationMs = toD.getTime() - fromD.getTime();
      const prevFromD = new Date(fromD.getTime() - durationMs - 86400000);
      const prevToD = new Date(fromD.getTime() - 86400000);

      const [currentRes, prevRes] = await Promise.all([
        supabase
          .from('food_log')
          .select('logged_date, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', userId)
          .gte('logged_date', from)
          .lte('logged_date', to),
        supabase
          .from('food_log')
          .select('logged_date, calories, protein_g')
          .eq('user_id', userId)
          .gte('logged_date', localDateStr(prevFromD))
          .lte('logged_date', localDateStr(prevToD)),
      ]);

      if (cancelled) return;

      // Build per-day map
      const dateMap: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
      for (const entry of currentRes.data ?? []) {
        const date = entry.logged_date;
        if (!dateMap[date]) dateMap[date] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        dateMap[date].calories += entry.calories ?? 0;
        dateMap[date].protein += entry.protein_g ?? 0;
        dateMap[date].carbs += entry.carbs_g ?? 0;
        dateMap[date].fat += entry.fat_g ?? 0;
      }

      const loggedDates = Object.entries(dateMap).filter(([, t]) => t.calories > 0);
      const daysLogged = loggedDates.length;

      // Count calendar days in range
      const diffDays = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
      const daysSoFar = Math.min(diffDays, Math.round((new Date().getTime() - fromD.getTime()) / 86400000) + 1);
      const consistency = daysSoFar > 0 ? Math.round((daysLogged / Math.max(daysSoFar, 1)) * 100) : 0;

      const totalCalories = loggedDates.reduce((s, [, t]) => s + t.calories, 0);
      const totalProtein = loggedDates.reduce((s, [, t]) => s + t.protein, 0);
      const avgCalories = daysLogged > 0 ? Math.round(totalCalories / daysLogged) : 0;
      const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;
      const avgCarbs = daysLogged > 0 ? Math.round(loggedDates.reduce((s, [, t]) => s + t.carbs, 0) / daysLogged) : 0;
      const avgFat = daysLogged > 0 ? Math.round(loggedDates.reduce((s, [, t]) => s + t.fat, 0) / daysLogged) : 0;

      const daysHitProtein = loggedDates.filter(([, t]) => targets.protein_g > 0 && t.protein >= targets.protein_g * 0.9).length;
      const daysHitCalories = loggedDates.filter(([, t]) => targets.calories > 0 && t.calories >= targets.calories * 0.85 && t.calories <= targets.calories * 1.15).length;

      let bestDay: { date: string; score: number } | null = null;
      let worstDay: { date: string; score: number } | null = null;
      for (const [date, t] of loggedDates) {
        const score = dayScore(t.calories, t.protein, targets.calories, targets.protein_g);
        if (!bestDay || score > bestDay.score) bestDay = { date, score };
        if (!worstDay || score < worstDay.score) worstDay = { date, score };
      }

      const adherenceScores = loggedDates.map(([, t]) => dayScore(t.calories, t.protein, targets.calories, targets.protein_g));
      const avgAdherence = adherenceScores.length > 0 ? Math.round(adherenceScores.reduce((s, v) => s + v, 0) / adherenceScores.length) : 0;

      // Previous period comparison
      const prevMap: Record<string, number> = {};
      const prevProteinMap: Record<string, number> = {};
      for (const entry of prevRes.data ?? []) {
        prevMap[entry.logged_date] = (prevMap[entry.logged_date] ?? 0) + (entry.calories ?? 0);
        prevProteinMap[entry.logged_date] = (prevProteinMap[entry.logged_date] ?? 0) + (entry.protein_g ?? 0);
      }
      const prevLogged = Object.values(prevMap).filter(v => v > 0);
      const prevAvgCalories = prevLogged.length > 0 ? Math.round(prevLogged.reduce((s, v) => s + v, 0) / prevLogged.length) : null;
      const prevDays = Math.round(durationMs / 86400000) + 1;
      const prevConsistency = prevDays > 0 ? Math.round((prevLogged.length / prevDays) * 100) : null;

      setStats({
        daysLogged, daysTotal: diffDays, avgCalories, avgProtein, avgCarbs, avgFat,
        consistency, bestDay, worstDay,
        grade: getGrade(avgAdherence, consistency),
        prevAvgCalories, prevConsistency,
        daysHitProtein, daysHitCalories,
        totalCalories: Math.round(totalCalories), totalProtein: Math.round(totalProtein),
        label,
      });
      setLoading(false);
    }

    void loadData();
    return () => { cancelled = true; };
  }, [userId, targets, period, customFrom, customTo]);

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'week', label: '7 days' },
    { key: 'month', label: 'Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <FileText size={14} /> {t('analytics.report')}
          {stats && <span className="text-stone-500 font-normal normal-case tracking-normal">{stats.label}</span>}
        </h3>
        {expanded ? <ChevronUp size={14} className="text-stone-500" /> : <ChevronDown size={14} className="text-stone-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Period selector tabs */}
            <div className="flex gap-1.5 mb-4">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    period === p.key
                      ? 'bg-[#D4A853]/15 text-[#D4A853] border border-[#D4A853]/30'
                      : 'border border-[var(--line)] text-[var(--t4)] hover:text-[var(--t2)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date pickers */}
            <AnimatePresence>
              {period === 'custom' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex gap-2 mb-4 overflow-hidden"
                >
                  <div className="flex-1">
                    <label className="text-[10px] text-[var(--t5)] uppercase tracking-wider block mb-1">From</label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-2)] border border-[var(--line)] text-[var(--t2)] focus:outline-none focus:border-[#D4A853]/50"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-[var(--t5)] uppercase tracking-wider block mb-1">To</label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      max={todayStr}
                      onChange={e => setCustomTo(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-xs bg-[var(--bg-2)] border border-[var(--line)] text-[var(--t2)] focus:outline-none focus:border-[#D4A853]/50"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading */}
            {loading && (
              <div className="text-[var(--t5)] text-sm text-center py-6 animate-pulse">Loading report...</div>
            )}

            {/* No data */}
            {!loading && (!stats || stats.daysLogged === 0) && (
              <p className="text-[var(--t5)] text-sm text-center py-4">No data logged in this period</p>
            )}

            {/* Stats */}
            {!loading && stats && stats.daysLogged > 0 && (
              <>
                {/* Grade + insight */}
                <div className="flex gap-4 items-start mb-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 12, delay: 0.2 }}
                    className={`w-16 h-16 flex-shrink-0 rounded-2xl border flex items-center justify-center ${gradeBg(stats.grade)}`}
                  >
                    <span className={`text-3xl font-black ${gradeColor(stats.grade)}`}>{stats.grade}</span>
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--t2)] text-sm font-semibold mb-1">
                      {stats.consistency}% consistency
                    </p>
                    <p className="text-[var(--t4)] text-[11px] leading-relaxed">
                      {gradeInsight(stats.grade, stats.consistency, stats.daysHitProtein, stats.daysLogged)}
                    </p>
                  </div>
                </div>

                {/* Hit-rate bar */}
                <div className="space-y-2 mb-4">
                  <HitBar
                    label="Logged days"
                    value={stats.daysLogged}
                    total={stats.daysTotal}
                    color="var(--gold-300,#D4A853)"
                    format={`${stats.daysLogged} / ${stats.daysTotal} days`}
                  />
                  <HitBar
                    label="Protein days"
                    value={stats.daysHitProtein}
                    total={stats.daysLogged}
                    color="#4ade80"
                    format={`${stats.daysHitProtein} / ${stats.daysLogged} days ≥90%`}
                  />
                  <HitBar
                    label="Calorie target"
                    value={stats.daysHitCalories}
                    total={stats.daysLogged}
                    color="#60a5fa"
                    format={`${stats.daysHitCalories} / ${stats.daysLogged} days on-target`}
                  />
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <MetricCard
                    label="Avg Calories"
                    value={`${stats.avgCalories}`}
                    sub="kcal/day"
                    trend={renderTrendIcon(stats.avgCalories, stats.prevAvgCalories)}
                    explain={targets.calories > 0 ? `Target: ${targets.calories} kcal` : undefined}
                  />
                  <MetricCard
                    label="Avg Protein"
                    value={`${stats.avgProtein}g`}
                    sub={targets.protein_g > 0 ? `/ ${targets.protein_g}g` : 'per day'}
                    explain={targets.protein_g > 0 ? `${Math.round((stats.avgProtein / targets.protein_g) * 100)}% of target` : undefined}
                  />
                  <MetricCard
                    label="Avg Carbs"
                    value={`${stats.avgCarbs}g`}
                    sub="per day"
                    explain={targets.carbs_g > 0 ? `Target: ${targets.carbs_g}g` : undefined}
                  />
                  <MetricCard
                    label="Avg Fat"
                    value={`${stats.avgFat}g`}
                    sub="per day"
                    explain={targets.fat_g > 0 ? `Target: ${targets.fat_g}g` : undefined}
                  />
                </div>

                {/* Best / Worst day */}
                {(stats.bestDay || stats.worstDay) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {stats.bestDay && (
                      <MetricCard
                        label="Best day"
                        value={formatDateShort(stats.bestDay.date)}
                        sub={`${stats.bestDay.score} pts`}
                        icon={<Award size={10} className="text-green-400" />}
                        explain="Closest to all targets"
                      />
                    )}
                    {stats.worstDay && (
                      <MetricCard
                        label="Worst day"
                        value={formatDateShort(stats.worstDay.date)}
                        sub={`${stats.worstDay.score} pts`}
                        explain="Furthest from targets"
                      />
                    )}
                  </div>
                )}

                {/* Trend vs previous period */}
                {stats.prevConsistency !== null && (
                  <div className="mt-3 p-3 rounded-xl border border-[var(--line)] bg-[var(--bg-1)]">
                    <p className="text-[10px] text-[var(--t5)] uppercase tracking-wider mb-1.5">vs. previous period</p>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--t3)] text-xs flex items-center gap-1">
                        Consistency {renderTrendIcon(stats.consistency, stats.prevConsistency)}
                        <span className={stats.consistency >= stats.prevConsistency ? 'text-green-400' : 'text-red-400'}>
                          {stats.consistency > stats.prevConsistency ? '+' : ''}{stats.consistency - stats.prevConsistency}%
                        </span>
                      </span>
                      {stats.prevAvgCalories !== null && (
                        <span className="text-[var(--t3)] text-xs flex items-center gap-1">
                          Calories {renderTrendIcon(stats.avgCalories, stats.prevAvgCalories)}
                          <span className={Math.abs(stats.avgCalories - stats.prevAvgCalories) < 50 ? 'text-[var(--t4)]' : stats.avgCalories > stats.prevAvgCalories ? 'text-orange-400' : 'text-green-400'}>
                            {stats.avgCalories > stats.prevAvgCalories ? '+' : ''}{stats.avgCalories - stats.prevAvgCalories} kcal
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HitBar({ label, value, total, color, format }: { label: string; value: number; total: number; color: string; format: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[var(--t4)]">{label}</span>
        <span className="text-[10px] text-[var(--t3)]">{format}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--line-2)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function renderTrendIcon(current: number, prev: number | null) {
  if (prev === null) return null;
  const diff = current - prev;
  if (Math.abs(diff) < 3) return <Minus size={10} className="text-stone-500" />;
  if (diff > 0) return <TrendingUp size={10} className="text-green-400" />;
  return <TrendingDown size={10} className="text-red-400" />;
}

function MetricCard({ label, value, sub, icon, trend, explain }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; trend?: React.ReactNode; explain?: string;
}) {
  return (
    <div className="glass-elevated p-3 rounded-xl">
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <span className="text-[var(--t5)] text-[10px] uppercase tracking-wider">{label}</span>
        {trend && <span className="ml-auto">{trend}</span>}
      </div>
      <p className="text-[var(--t1)] text-base font-bold leading-tight">
        {value}
        {sub && <span className="text-[var(--t5)] text-xs font-normal ml-1">{sub}</span>}
      </p>
      {explain && <p className="text-[var(--t5)] text-[10px] mt-0.5">{explain}</p>}
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
