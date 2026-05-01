'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localDateStr } from '../lib/dates';

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
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayTotals[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const days: DayTotals[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setDate(day.getDate() - i);
        days.push({
          date: localDateStr(day),
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
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">{t('general.loading')}</div>
      </div>
    );
  }

  const activeDays = dayData;
  const totalDays = 7;

  const macros: MacroBar[] = [
    {
      label: t('general.calories'),
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
      label: t('general.protein'),
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
      label: t('general.carbs'),
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
      label: t('general.fat'),
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
      {/* Accordion header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Target size={14} /> {t('analytics.weekly_adherence')}
        </h3>
        <div className="flex items-center gap-2">
          {activeDays.length > 0 && (
            <span className={`text-xs font-bold ${scoreColor(overallScore)}`}>{overallScore}%</span>
          )}
          {expanded ? <ChevronUp size={14} className="text-stone-500" /> : <ChevronDown size={14} className="text-stone-500" />}
        </div>
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
            {/* Explanatory subtitle */}
            <p className="text-[10px] mb-3" style={{ color: 'var(--t5, #57534e)' }}>
              {t('adherence.subtitle')}
            </p>

            {activeDays.length === 0 ? (
              /* Empty state — still show targets so user knows what they're working toward */
              <div>
                <div
                  className="rounded-xl p-3 mb-3 text-center"
                  style={{ background: 'var(--line, rgba(255,255,255,0.04))', border: '1px solid var(--line-2)' }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--t3)' }}>{t('adherence.no_data')}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--t5)' }}>{t('adherence.log_meals')}</p>
                </div>
                {/* Show targets anyway */}
                <div className="space-y-2">
                  {macros.map((macro) => (
                    <div key={macro.key} className="flex items-center justify-between text-xs py-1"
                      style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: macro.color }} />
                        <span style={{ color: 'var(--t2)' }}>{macro.label}</span>
                      </div>
                      <span style={{ color: 'var(--t4)' }}>
                        {t('adherence.target_label')}:{' '}
                        <strong style={{ color: 'var(--t2)' }}>{macro.targetValue}{macro.unit}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Score ring + days info */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
                      <circle cx="24" cy="24" r="20" fill="none" stroke="var(--line-2,rgba(255,255,255,0.08))" strokeWidth="4" />
                      <motion.circle
                        cx="24" cy="24" r="20" fill="none"
                        stroke={overallScore >= 80 ? '#65D387' : overallScore >= 60 ? '#D4A853' : '#E87A6E'}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 20}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - overallScore / 100) }}
                        transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-sm font-black ${scoreColor(overallScore)}`}>{overallScore}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-semibold" style={{ color: 'var(--t2)' }}>
                      {overallScore >= 80 ? t('adherence.excellent') : overallScore >= 60 ? t('adherence.good') : t('adherence.improve')}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--t4)' }}>
                      {t('adherence.days_logged', { n: activeDays.length, total: totalDays })}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {Array.from({ length: totalDays }, (_, i) => (
                        <div
                          key={i}
                          className="flex-1 h-1.5 rounded-full"
                          style={{ background: i < activeDays.length ? '#D4A853' : 'var(--line-2, rgba(255,255,255,0.08))' }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Per-macro bars */}
                <div className="space-y-3">
                  {macros.map((macro, i) => (
                    <div key={macro.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: macro.color }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--t2)' }}>{macro.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
                            {t('adherence.on_target', { n: macro.daysOnTarget, total: activeDays.length })}
                          </span>
                          <span className={`text-[11px] font-bold ${scoreColor(macro.adherence)}`}>
                            {macro.adherence}%
                          </span>
                        </div>
                      </div>
                      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--line-2, rgba(255,255,255,0.06))' }}>
                        <motion.div
                          className="absolute left-0 top-0 h-full rounded-full"
                          style={{ backgroundColor: macro.color, opacity: 0.8 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, macro.adherence)}%` }}
                          transition={{ duration: 0.7, delay: 0.1 + i * 0.09, ease: 'easeOut' }}
                        />
                      </div>
                      <p className="text-[9px] mt-0.5" style={{ color: 'var(--t5)' }}>
                        {t('adherence.avg_target', { avg: macro.avgValue, unit: macro.unit, target: macro.targetValue })}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
