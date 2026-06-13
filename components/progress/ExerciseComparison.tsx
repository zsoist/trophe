'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { WorkoutSet, WorkoutSession } from '@/lib/types';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface SessionSummary {
  date: string;
  sets: number;
  bestWeight: number;
  totalReps: number;
  volume: number; // weight * reps summed
}

interface ExerciseComparisonProps {
  exerciseId: string;
  userId: string;
}

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

export default function ExerciseComparison({ exerciseId, userId }: ExerciseComparisonProps) {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);

  const loadComparison = useCallback(async () => {
    setLoading(true);
    try {
      // Get sessions for this user that contain this exercise
      const { data: sets } = await supabase
        .from('workout_sets')
        .select('*, session:workout_sessions!inner(*)')
        .eq('exercise_id', exerciseId)
        .eq('session.user_id', userId)
        .eq('is_warmup', false)
        .order('session.session_date', { ascending: false, referencedTable: 'workout_sessions' });

      if (!sets || sets.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      // Group by session
      const sessionMap = new Map<string, { date: string; sets: (WorkoutSet & { session: WorkoutSession })[] }>();

      sets.forEach((s: WorkoutSet & { session: WorkoutSession }) => {
        const sid = s.session_id;
        if (!sessionMap.has(sid)) {
          sessionMap.set(sid, { date: s.session.session_date, sets: [] });
        }
        sessionMap.get(sid)!.sets.push(s);
      });

      // Build summaries (last 5)
      const allSummaries: SessionSummary[] = Array.from(sessionMap.values())
        .map(({ date, sets: sessionSets }) => {
          const bestWeight = Math.max(0, ...sessionSets.map((s) => s.weight_kg || 0));
          const totalReps = sessionSets.reduce((acc, s) => acc + (s.reps || 0), 0);
          const volume = sessionSets.reduce(
            (acc, s) => acc + (s.weight_kg || 0) * (s.reps || 0),
            0
          );
          return {
            date,
            sets: sessionSets.length,
            bestWeight,
            totalReps,
            volume,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      setSummaries(allSummaries);
    } catch (err) {
      console.error('Error loading exercise comparison:', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseId, userId]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  // ── Trend indicator ──

  function renderTrend(current: number, previous: number | undefined) {
    if (previous === undefined) return null;
    if (current > previous) {
      return <TrendingUp size={12} className="text-green-400" />;
    }
    if (current < previous) {
      return <TrendingDown size={12} className="text-red-400" />;
    }
    return <Minus size={12} className="text-stone-600" />;
  }

  function cellColor(current: number, previous: number | undefined): string {
    if (previous === undefined) return '';
    if (current > previous) return 'text-green-400';
    if (current < previous) return 'text-red-400';
    return '';
  }

  // ── Mini line chart for best weight ──

  const weightChart = useMemo(() => {
    if (summaries.length < 2) return null;

    const reversed = [...summaries].reverse();
    const weights = reversed.map((s) => s.bestWeight);
    const maxW = Math.max(1, ...weights);
    const minW = Math.min(...weights);
    const range = maxW - minW || 1;

    const width = 200;
    const height = 48;
    const padding = 4;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = weights.map((w, i) => ({
      x: padding + (i / (weights.length - 1)) * chartW,
      y: padding + chartH - ((w - minW) / range) * chartH,
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[200px]">
        <path
          d={pathD}
          fill="none"
          stroke="#D4A853"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#D4A853" />
        ))}
      </svg>
    );
  }, [summaries]);

  // ── Render ──

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-8 bg-stone-800/50 rounded" />
        <div className="h-8 bg-stone-800/50 rounded" />
        <div className="h-8 bg-stone-800/50 rounded" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <p className="text-stone-600 text-sm text-center py-4">
        No sessions found for this exercise
      </p>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Comparison Table */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-stone-500 border-b border-white/5">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-center py-2 px-2 font-medium">Sets</th>
              <th className="text-center py-2 px-2 font-medium">Best Wt</th>
              <th className="text-center py-2 px-2 font-medium">Total Reps</th>
              <th className="text-center py-2 px-2 font-medium">Volume</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s, i) => {
              const prev = summaries[i + 1]; // previous session (older)
              return (
                <tr
                  key={s.date}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-2 text-stone-300 whitespace-nowrap">{s.date}</td>
                  <td className="py-2.5 px-2 text-center text-stone-300">{s.sets}</td>
                  <td
                    className={`py-2.5 px-2 text-center font-medium ${cellColor(
                      s.bestWeight,
                      prev?.bestWeight
                    )} text-stone-300`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {s.bestWeight}kg
                      {renderTrend(s.bestWeight, prev?.bestWeight)}
                    </span>
                  </td>
                  <td
                    className={`py-2.5 px-2 text-center ${cellColor(
                      s.totalReps,
                      prev?.totalReps
                    )} text-stone-300`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {s.totalReps}
                      {renderTrend(s.totalReps, prev?.totalReps)}
                    </span>
                  </td>
                  <td
                    className={`py-2.5 px-2 text-center ${cellColor(
                      s.volume,
                      prev?.volume
                    )} text-stone-300`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {s.volume.toLocaleString()}
                      {renderTrend(s.volume, prev?.volume)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mini weight trend line */}
      {weightChart && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] text-stone-600 mb-1">Best Weight Trend</p>
          {weightChart}
        </div>
      )}
    </motion.div>
  );
}
