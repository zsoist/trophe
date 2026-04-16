'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '../lib/dates';

interface DayCell {
  date: string;
  calories: number;
  entries: number;
  col: number;
  row: number;
}

interface CalorieHeatmapProps {
  userId: string;
  weeks?: number;
}

const CELL_SIZE = 12;
const GAP = 2;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getIntensity(calories: number): string {
  if (calories === 0) return 'rgba(255, 255, 255, 0.04)';
  if (calories < 500) return 'rgba(212, 168, 83, 0.15)';
  if (calories < 1000) return 'rgba(212, 168, 83, 0.30)';
  if (calories < 1500) return 'rgba(212, 168, 83, 0.50)';
  if (calories < 2000) return 'rgba(212, 168, 83, 0.70)';
  return 'rgba(212, 168, 83, 0.90)';
}

export default function CalorieHeatmap({ userId, weeks = 8 }: CalorieHeatmapProps) {
  const [cells, setCells] = useState<DayCell[]>([]);
  const [months, setMonths] = useState<{ label: string; col: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<DayCell | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!userId) return;

      const endDate = new Date();
      const totalDays = weeks * 7;
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - totalDays + 1);

      const startStr = localDateStr(startDate);
      const endStr = localDateStr(endDate);

      const { data } = await supabase
        .from('food_log')
        .select('logged_date, calories')
        .eq('user_id', userId)
        .gte('logged_date', startStr)
        .lte('logged_date', endStr);

      if (cancelled) return;

      const dayMap = new Map<string, { calories: number; entries: number }>();
      if (data) {
        for (const entry of data) {
          const existing = dayMap.get(entry.logged_date) || { calories: 0, entries: 0 };
          existing.calories += entry.calories ?? 0;
          existing.entries += 1;
          dayMap.set(entry.logged_date, existing);
        }
      }

      const gridCells: DayCell[] = [];
      const monthLabels: { label: string; col: number }[] = [];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let lastMonth = -1;

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        if (d > endDate) break;

        const dateStr = localDateStr(d);
        const jsDay = d.getDay();
        const row = jsDay === 0 ? 6 : jsDay - 1;
        const col = Math.floor(i / 7);

        const agg = dayMap.get(dateStr) || { calories: 0, entries: 0 };
        gridCells.push({ date: dateStr, calories: agg.calories, entries: agg.entries, col, row });

        const month = d.getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ label: monthNames[month], col });
          lastMonth = month;
        }
      }

      setCells(gridCells);
      setMonths(monthLabels);
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, weeks]);

  if (loading) {
    return (
      <div className="glass p-5 mb-4">
        <div className="text-stone-500 text-sm text-center py-6 animate-pulse">
          Loading activity...
        </div>
      </div>
    );
  }

  const labelOffset = 24;
  const svgWidth = labelOffset + weeks * (CELL_SIZE + GAP);
  const monthBarHeight = 14;
  const svgHeight = monthBarHeight + 7 * (CELL_SIZE + GAP);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <Grid3X3 size={14} /> Activity
      </h3>

      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="overflow-visible"
        >
          {/* Month labels */}
          {months.map((m, i) => (
            <text
              key={`month-${i}`}
              x={labelOffset + m.col * (CELL_SIZE + GAP)}
              y={10}
              fill="#78716c"
              fontSize={8}
            >
              {m.label}
            </text>
          ))}

          {/* Day labels */}
          {[0, 2, 4].map((row) => (
            <text
              key={`day-${row}`}
              x={0}
              y={monthBarHeight + row * (CELL_SIZE + GAP) + CELL_SIZE - 2}
              fill="#57534e"
              fontSize={7}
            >
              {DAY_LABELS[row]}
            </text>
          ))}

          {/* Cells */}
          {cells.map((cell, i) => (
            <motion.rect
              key={cell.date}
              x={labelOffset + cell.col * (CELL_SIZE + GAP)}
              y={monthBarHeight + cell.row * (CELL_SIZE + GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={getIntensity(cell.calories)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.003, duration: 0.3 }}
              className="cursor-pointer"
              onMouseEnter={() => setTooltip(cell)}
              onMouseLeave={() => setTooltip(null)}
              onTouchStart={() => setTooltip(cell)}
              onTouchEnd={() => setTooltip(null)}
            />
          ))}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect
                x={labelOffset + tooltip.col * (CELL_SIZE + GAP) - 30}
                y={monthBarHeight + tooltip.row * (CELL_SIZE + GAP) - 28}
                width={80}
                height={22}
                rx={4}
                fill="rgba(28, 25, 23, 0.95)"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.5}
              />
              <text
                x={labelOffset + tooltip.col * (CELL_SIZE + GAP) + 10}
                y={monthBarHeight + tooltip.row * (CELL_SIZE + GAP) - 14}
                textAnchor="middle"
                fill="#d6d3d1"
                fontSize={8}
              >
                {tooltip.date} &middot; {Math.round(tooltip.calories)} kcal &middot; {tooltip.entries} entries
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-3 text-stone-500 text-[10px]">
        <span>Less</span>
        {[0, 500, 1000, 1500, 2000].map((cal) => (
          <div
            key={cal}
            className="w-[10px] h-[10px] rounded-sm"
            style={{ backgroundColor: getIntensity(cal) }}
          />
        ))}
        <span>More</span>
      </div>
    </motion.div>
  );
}
