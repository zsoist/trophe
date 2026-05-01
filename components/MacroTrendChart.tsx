'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { localDateStr } from '../lib/dates';

interface DayAggregate {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface MacroTrendChartProps {
  userId: string;
  days?: number;
}

type MacroKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';

const LINES: { key: MacroKey; label: string; color: string; axis: 'left' | 'right' }[] = [
  { key: 'calories', label: 'Calories', color: '#D4A853', axis: 'left' },
  { key: 'protein_g', label: 'Protein', color: '#f87171', axis: 'right' },
  { key: 'carbs_g', label: 'Carbs', color: '#60a5fa', axis: 'right' },
  { key: 'fat_g', label: 'Fat', color: '#a78bfa', axis: 'right' },
];

const VB_W = 400;
const VB_H = 200;
const PAD = { top: 16, right: 42, bottom: 28, left: 42 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

export default function MacroTrendChart({ userId, days = 30 }: MacroTrendChartProps) {
  const { t } = useI18n();
  const [data, setData] = useState<DayAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<Record<MacroKey, boolean>>({
    calories: true,
    protein_g: true,
    carbs_g: true,
    fat_g: true,
  });
  const [expanded, setExpanded] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [targetCalories, setTargetCalories] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (days - 1));

      const startStr = localDateStr(startDate);
      const endStr = localDateStr(endDate);

      const [logResult, profileResult] = await Promise.all([
        supabase
          .from('food_log')
          .select('logged_date, calories, protein_g, carbs_g, fat_g')
          .eq('user_id', userId)
          .gte('logged_date', startStr)
          .lte('logged_date', endStr),
        supabase
          .from('client_profiles')
          .select('target_calories')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (profileResult.data?.target_calories) {
        setTargetCalories(profileResult.data.target_calories);
      }

      const dayMap = new Map<string, DayAggregate>();
      for (let i = 0; i < days; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        const dateStr = localDateStr(day);
        dayMap.set(dateStr, { date: dateStr, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }

      if (logResult.data) {
        for (const entry of logResult.data) {
          const day = dayMap.get(entry.logged_date);
          if (day) {
            day.calories += entry.calories ?? 0;
            day.protein_g += entry.protein_g ?? 0;
            day.carbs_g += entry.carbs_g ?? 0;
            day.fat_g += entry.fat_g ?? 0;
          }
        }
      }

      setData(Array.from(dayMap.values()));
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  const toggle = (key: MacroKey) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-8 animate-pulse">
          Loading trend data...
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  // Scales
  const calMax = Math.max(...data.map((d) => d.calories), targetCalories ?? 0, 1) * 1.15;
  const macroMax =
    Math.max(
      ...data.map((d) => Math.max(d.protein_g, d.carbs_g, d.fat_g)),
      1
    ) * 1.15;

  function xForIdx(i: number): number {
    return PAD.left + (i / Math.max(data.length - 1, 1)) * PLOT_W;
  }

  function yForValue(val: number, axis: 'left' | 'right'): number {
    const max = axis === 'left' ? calMax : macroMax;
    return PAD.top + PLOT_H - (val / max) * PLOT_H;
  }

  function buildPath(key: MacroKey, axis: 'left' | 'right'): string {
    return data
      .map((d, i) => {
        const x = xForIdx(i);
        const y = yForValue(d[key], axis);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // Y-axis ticks
  const calTicks = [0, Math.round(calMax * 0.33), Math.round(calMax * 0.66), Math.round(calMax)];
  const macroTicks = [0, Math.round(macroMax * 0.33), Math.round(macroMax * 0.66), Math.round(macroMax)];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="glass p-5 mb-4"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <TrendingUp size={14} /> {t('analytics.trends')} · {days}d
        </h3>
        {expanded ? (
          <ChevronUp size={14} className="text-stone-500" />
        ) : (
          <ChevronDown size={14} className="text-stone-500" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Toggle buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              {LINES.map((line) => (
                <button
                  key={line.key}
                  onClick={() => toggle(line.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                    visible[line.key]
                      ? 'border-white/10 bg-white/5'
                      : 'border-white/5 bg-transparent opacity-40'
                  }`}
                  style={{ color: line.color }}
                >
                  {line.label}
                </button>
              ))}
            </div>

            {/* SVG Chart */}
            <div className="flex justify-center">
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="w-full max-w-full overflow-visible"
                onMouseLeave={() => setHoverIdx(null)}
                onTouchEnd={() => setHoverIdx(null)}
              >
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((pct) => (
                  <line
                    key={pct}
                    x1={PAD.left}
                    y1={PAD.top + PLOT_H * (1 - pct)}
                    x2={VB_W - PAD.right}
                    y2={PAD.top + PLOT_H * (1 - pct)}
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth={0.5}
                  />
                ))}

                {/* Left Y-axis (calories) */}
                {visible.calories &&
                  calTicks.map((tick) => (
                    <text
                      key={`cal-${tick}`}
                      x={PAD.left - 4}
                      y={yForValue(tick, 'left') + 3}
                      textAnchor="end"
                      fill="#D4A853"
                      fontSize={7}
                      opacity={0.5}
                    >
                      {tick}
                    </text>
                  ))}

                {/* Right Y-axis (macros) */}
                {(visible.protein_g || visible.carbs_g || visible.fat_g) &&
                  macroTicks.map((tick) => (
                    <text
                      key={`macro-${tick}`}
                      x={VB_W - PAD.right + 4}
                      y={yForValue(tick, 'right') + 3}
                      textAnchor="start"
                      fill="#78716c"
                      fontSize={7}
                      opacity={0.5}
                    >
                      {tick}g
                    </text>
                  ))}

                {/* X-axis labels (every 5th day) */}
                {data.map((d, i) => {
                  if (i % 5 !== 0 && i !== data.length - 1) return null;
                  return (
                    <text
                      key={d.date}
                      x={xForIdx(i)}
                      y={VB_H - 4}
                      textAnchor="middle"
                      fill="#78716c"
                      fontSize={7}
                    >
                      {formatDate(d.date)}
                    </text>
                  );
                })}

                {/* Target calories dashed line */}
                {targetCalories && visible.calories && (
                  <line
                    x1={PAD.left}
                    y1={yForValue(targetCalories, 'left')}
                    x2={VB_W - PAD.right}
                    y2={yForValue(targetCalories, 'left')}
                    stroke="#D4A853"
                    strokeWidth={0.8}
                    strokeDasharray="4 3"
                    opacity={0.4}
                  />
                )}

                {/* Data lines */}
                {LINES.map((line) => {
                  if (!visible[line.key]) return null;
                  const path = buildPath(line.key, line.axis);
                  return (
                    <motion.path
                      key={line.key}
                      d={path}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.2, ease: 'easeInOut' }}
                    />
                  );
                })}

                {/* Hover detection zones */}
                {data.map((_, i) => {
                  const x = xForIdx(i);
                  const colW = PLOT_W / data.length;
                  return (
                    <rect
                      key={`hover-${i}`}
                      x={x - colW / 2}
                      y={PAD.top}
                      width={colW}
                      height={PLOT_H}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(i)}
                      onTouchStart={() => setHoverIdx(i)}
                    />
                  );
                })}

                {/* Hover vertical line and dots */}
                {hoverIdx !== null && (
                  <>
                    <line
                      x1={xForIdx(hoverIdx)}
                      y1={PAD.top}
                      x2={xForIdx(hoverIdx)}
                      y2={PAD.top + PLOT_H}
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth={0.5}
                    />
                    {LINES.map((line) => {
                      if (!visible[line.key]) return null;
                      const val = data[hoverIdx][line.key];
                      const y = yForValue(val, line.axis);
                      const x = xForIdx(hoverIdx);
                      return (
                        <g key={`dot-${line.key}`}>
                          <circle cx={x} cy={y} r={3} fill={line.color} />
                          <text
                            x={x}
                            y={y - 6}
                            textAnchor="middle"
                            fill={line.color}
                            fontSize={7}
                            fontWeight={600}
                          >
                            {Math.round(val)}
                            {line.key !== 'calories' ? 'g' : ''}
                          </text>
                        </g>
                      );
                    })}
                  </>
                )}
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
