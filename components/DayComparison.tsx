'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FoodLogEntry } from '@/lib/types';
import { calculateMealScore } from '@/lib/meal-score';

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
    const today = new Date().toISOString().split('T')[0];
    if (d === today) return 'Today';
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const DiffBadge = ({ a, b }: { a: number; b: number }) => {
    if (b === 0) return null;
    const diff = ((a - b) / b * 100);
    if (Math.abs(diff) < 1) return null;
    return (
      <span className={`text-[9px] ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
        {diff > 0 ? '+' : ''}{Math.round(diff)}%
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full max-w-md bg-stone-900 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-stone-100 font-semibold text-sm">Day Comparison</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-stone-500 text-sm text-center py-8">Loading...</p>
        ) : (
          <>
            {/* Date headers */}
            <div className="grid grid-cols-[1fr_24px_1fr] gap-2 mb-3">
              <div className="text-center">
                <p className="text-stone-300 text-xs font-medium">{formatDate(currentDate)}</p>
                {current.score && (
                  <span className={`text-[10px] ${current.score.color}`}>{current.score.label} ({current.score.score})</span>
                )}
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight size={12} className="text-stone-600" />
              </div>
              <div className="text-center">
                <p className="text-stone-300 text-xs font-medium">{formatDate(compareDate)}</p>
                {compare.score && (
                  <span className={`text-[10px] ${compare.score.color}`}>{compare.score.label} ({compare.score.score})</span>
                )}
              </div>
            </div>

            {/* Macro comparison */}
            {[
              { label: 'Calories', a: current.calories, b: compare.calories, unit: 'kcal', color: 'gold-text' },
              { label: 'Protein', a: current.protein, b: compare.protein, unit: 'g', color: 'text-red-400' },
              { label: 'Carbs', a: current.carbs, b: compare.carbs, unit: 'g', color: 'text-blue-400' },
              { label: 'Fat', a: current.fat, b: compare.fat, unit: 'g', color: 'text-purple-400' },
              { label: 'Fiber', a: current.fiber, b: compare.fiber, unit: 'g', color: 'text-green-400' },
              { label: 'Items', a: current.items, b: compare.items, unit: '', color: 'text-stone-300' },
            ].map(row => (
              <div key={row.label} className="grid grid-cols-[1fr_80px_1fr] gap-2 py-1.5 border-b border-white/[0.05]">
                <p className={`text-sm text-right font-medium ${row.color}`}>
                  {Math.round(row.a)}{row.unit}
                </p>
                <div className="text-center">
                  <p className="text-[10px] text-stone-600">{row.label}</p>
                  <DiffBadge a={row.a} b={row.b} />
                </div>
                <p className={`text-sm font-medium ${row.color}`}>
                  {Math.round(row.b)}{row.unit}
                </p>
              </div>
            ))}

            {/* Food lists */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <p className="text-[10px] text-stone-500 mb-1">Foods ({current.items})</p>
                {currentLog.slice(0, 8).map((e, i) => (
                  <p key={i} className="text-[10px] text-stone-400 truncate">{e.food_name}</p>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-stone-500 mb-1">Foods ({compare.items})</p>
                {compareLog.slice(0, 8).map((e, i) => (
                  <p key={i} className="text-[10px] text-stone-400 truncate">{e.food_name}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
