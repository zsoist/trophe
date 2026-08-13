'use client';

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FoodLogEntry } from '@/lib/types';
import { calculateMealScore } from '@/lib/food/meal-score';
import { localToday } from '@/lib/utils/dates';
import { MACRO_COLORS } from '@/lib/macro-colors';

interface DayComparisonProps {
  userId: string;
  currentDate: string;
  currentLog: FoodLogEntry[];
  compareDate: string;
  onClose: () => void;
}

// F6: Day comparison drawer — side-by-side view of two days
export default function DayComparison({ userId, currentDate, currentLog, compareDate, onClose }: DayComparisonProps) {
  const [compareLog, setCompareLog] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('food_log')
        .select('*')
        .eq('user_id', userId)
        .eq('logged_date', compareDate)
        .order('created_at', { ascending: true });
      if (data) setCompareLog(data);
      setLoading(false);
    };
    load();
  }, [userId, compareDate]);

  const summarize = (entries: FoodLogEntry[]) => ({
    calories: entries.reduce((s, e) => s + (e.calories ?? 0), 0),
    protein: entries.reduce((s, e) => s + (e.protein_g ?? 0), 0),
    carbs: entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0),
    fat: entries.reduce((s, e) => s + (e.fat_g ?? 0), 0),
    fiber: entries.reduce((s, e) => s + (e.fiber_g ?? 0), 0),
    items: entries.length,
    score: calculateMealScore(entries),
  });

  const current = summarize(currentLog);
  const compare = summarize(compareLog);

  const formatDate = (d: string) => {
    const today = localToday();
    if (d === today) return 'Today';
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const DiffBadge = ({ a, b }: { a: number; b: number }) => {
    if (b === 0) return null;
    const diff = ((a - b) / b * 100);
    if (Math.abs(diff) < 1) return null;
    return (
      <span className={`text-xs ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
        {diff > 0 ? '+' : ''}{Math.round(diff)}%
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reducedMotion ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.15 }}
      className="fixed inset-0 z-50 bg-[var(--surface-overlay)] flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25 }}
        role="dialog"
        aria-modal="true"
        aria-label="Day comparison"
        className="w-full max-w-md bg-[var(--surface-1)] rounded-t-2xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[var(--content-primary)] font-semibold text-sm">Day Comparison</h2>
          <button onClick={onClose} aria-label="Close day comparison" className="min-h-11 min-w-11 text-[var(--content-muted)] hover:text-[var(--content-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--content-muted)] text-sm text-center py-8">Loading...</p>
        ) : (
          <>
            {/* Date headers */}
            <div className="grid grid-cols-[1fr_24px_1fr] gap-2 mb-3">
              <div className="text-center">
                <p className="text-[var(--content-secondary)] text-xs font-medium">{formatDate(currentDate)}</p>
                {current.score && (
                  <span className={`text-xs ${current.score.color}`}>{current.score.label} ({current.score.score})</span>
                )}
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight size={12} className="text-[var(--content-muted)]" />
              </div>
              <div className="text-center">
                <p className="text-[var(--content-secondary)] text-xs font-medium">{formatDate(compareDate)}</p>
                {compare.score && (
                  <span className={`text-xs ${compare.score.color}`}>{compare.score.label} ({compare.score.score})</span>
                )}
              </div>
            </div>

            {/* Macro comparison */}
            {[
              { label: 'Calories', a: current.calories, b: compare.calories, unit: 'kcal', color: MACRO_COLORS.calories },
              { label: 'Protein', a: current.protein, b: compare.protein, unit: 'g', color: MACRO_COLORS.protein },
              { label: 'Carbs', a: current.carbs, b: compare.carbs, unit: 'g', color: MACRO_COLORS.carbs },
              { label: 'Fat', a: current.fat, b: compare.fat, unit: 'g', color: MACRO_COLORS.fat },
              { label: 'Fiber', a: current.fiber, b: compare.fiber, unit: 'g', color: MACRO_COLORS.fiber },
              { label: 'Items', a: current.items, b: compare.items, unit: '', color: 'var(--content-primary)' },
            ].map(row => (
              <div key={row.label} className="grid grid-cols-[1fr_80px_1fr] gap-2 py-1.5 border-b border-[var(--border-subtle)]">
                <p className="text-sm text-right font-medium" style={{ color: row.color }}>
                  {Math.round(row.a)}{row.unit}
                </p>
                <div className="text-center">
                  <p className="text-xs text-[var(--content-muted)]">{row.label}</p>
                  <DiffBadge a={row.a} b={row.b} />
                </div>
                <p className="text-sm font-medium" style={{ color: row.color }}>
                  {Math.round(row.b)}{row.unit}
                </p>
              </div>
            ))}

            {/* Food lists */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <p className="text-xs text-[var(--content-muted)] mb-1">Foods ({current.items})</p>
                {currentLog.slice(0, 8).map((e, i) => (
                  <p key={i} className="text-xs text-[var(--content-secondary)] truncate">{e.food_name}</p>
                ))}
              </div>
              <div>
                <p className="text-xs text-[var(--content-muted)] mb-1">Foods ({compare.items})</p>
                {compareLog.slice(0, 8).map((e, i) => (
                  <p key={i} className="text-xs text-[var(--content-secondary)] truncate">{e.food_name}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
