'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { HabitCategory } from '@/lib/types';

interface HabitRadarProps {
  userId: string | null;
}

const CATEGORIES: { key: HabitCategory; label: string }[] = [
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'movement', label: 'Movement' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'mindset', label: 'Mindset' },
  { key: 'recovery', label: 'Recovery' },
];

export default function HabitRadar({ userId }: HabitRadarProps) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      // Get all active and completed habits for this user with their category
      const { data: clientHabits } = await supabase
        .from('client_habits')
        .select('*, habit:habits(category, cycle_days)')
        .eq('client_id', userId)
        .in('status', ['active', 'completed']);

      if (!clientHabits || clientHabits.length === 0) {
        setHasData(false);
        setLoading(false);
        return;
      }

      // Get checkins from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const habitIds = clientHabits.map((ch) => ch.id);
      const { data: checkins } = await supabase
        .from('habit_checkins')
        .select('client_habit_id, completed')
        .in('client_habit_id', habitIds)
        .gte('checked_date', thirtyDaysAgo);

      // Calculate completion rate per category
      const categoryScores: Record<string, { completed: number; total: number }> = {};

      for (const ch of clientHabits) {
        const category = (ch.habit as { category?: string })?.category;
        if (!category) continue;

        if (!categoryScores[category]) {
          categoryScores[category] = { completed: 0, total: 0 };
        }

        const habitCheckins = (checkins || []).filter(
          (c) => c.client_habit_id === ch.id
        );
        categoryScores[category].total += habitCheckins.length;
        categoryScores[category].completed += habitCheckins.filter(
          (c) => c.completed
        ).length;
      }

      const finalScores: Record<string, number> = {};
      let anyNonZero = false;

      for (const cat of CATEGORIES) {
        const s = categoryScores[cat.key];
        if (s && s.total > 0) {
          finalScores[cat.key] = Math.round((s.completed / s.total) * 100);
          if (finalScores[cat.key] > 0) anyNonZero = true;
        } else {
          finalScores[cat.key] = 0;
        }
      }

      setScores(finalScores);
      setHasData(anyNonZero);
    } catch (err) {
      console.error('HabitRadar load error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // SVG radar chart params
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 90;
  const levels = 4; // concentric rings

  function getPoint(index: number, value: number): { x: number; y: number } {
    const angle = (index / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
    const r = (value / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function getPolygonPoints(values: number[]): string {
    return values
      .map((v, i) => {
        const pt = getPoint(i, v);
        return `${pt.x},${pt.y}`;
      })
      .join(' ');
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-5 mb-4"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
          Habit Balance
        </h3>
        <div className="text-center py-8 text-stone-500 text-sm animate-pulse">
          Loading...
        </div>
      </motion.div>
    );
  }

  const values = CATEGORIES.map((c) => scores[c.key] || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
        Habit Balance
      </h3>

      {!hasData ? (
        <div className="text-center py-8">
          <svg
            width={size}
            height={size}
            className="mx-auto opacity-30"
            viewBox={`0 0 ${size} ${size}`}
          >
            {/* Empty grid */}
            {Array.from({ length: levels }).map((_, l) => {
              const r = ((l + 1) / levels) * maxR;
              const pts = CATEGORIES.map((_, i) => {
                const angle = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
                return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
              }).join(' ');
              return (
                <polygon
                  key={l}
                  points={pts}
                  fill="none"
                  stroke="rgb(68, 64, 60)"
                  strokeWidth={0.5}
                />
              );
            })}
            {/* Axis lines */}
            {CATEGORIES.map((_, i) => {
              const pt = getPoint(i, 100);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={pt.x}
                  y2={pt.y}
                  stroke="rgb(68, 64, 60)"
                  strokeWidth={0.5}
                />
              );
            })}
          </svg>
          <p className="text-stone-500 text-sm mt-2">
            Complete habits to see your balance
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto"
          >
            {/* Concentric grid rings */}
            {Array.from({ length: levels }).map((_, l) => {
              const r = ((l + 1) / levels) * maxR;
              const pts = CATEGORIES.map((_, i) => {
                const angle = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
                return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
              }).join(' ');
              return (
                <polygon
                  key={l}
                  points={pts}
                  fill="none"
                  stroke="rgb(68, 64, 60)"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Axis lines */}
            {CATEGORIES.map((_, i) => {
              const pt = getPoint(i, 100);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={pt.x}
                  y2={pt.y}
                  stroke="rgb(68, 64, 60)"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Data polygon */}
            <motion.polygon
              points={getPolygonPoints(values)}
              fill="#D4A85330"
              stroke="#D4A853"
              strokeWidth={2}
              strokeLinejoin="round"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />

            {/* Data points */}
            {values.map((v, i) => {
              const pt = getPoint(i, v);
              return (
                <motion.circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.5}
                  fill="#D4A853"
                  stroke="#0a0a0a"
                  strokeWidth={2}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                />
              );
            })}

            {/* Labels */}
            {CATEGORIES.map((cat, i) => {
              const pt = getPoint(i, 120);
              return (
                <text
                  key={cat.key}
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#a8a29e"
                  fontSize={10}
                  fontWeight={500}
                >
                  {cat.label}
                </text>
              );
            })}
          </svg>

          {/* Score summary */}
          <div className="grid grid-cols-3 gap-2 mt-3 w-full">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                className="text-center p-2 rounded-lg bg-white/[0.02]"
              >
                <div
                  className="text-sm font-semibold"
                  style={{
                    color:
                      (scores[cat.key] || 0) >= 75
                        ? '#D4A853'
                        : (scores[cat.key] || 0) >= 50
                        ? '#a8a29e'
                        : '#78716c',
                  }}
                >
                  {scores[cat.key] || 0}%
                </div>
                <div className="text-[9px] text-stone-500 uppercase tracking-wider">
                  {cat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
