'use client';

import { memo, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface HeatmapEntry {
  date: string;
  count: number;
}

interface ClientFoodHeatmapProps {
  data: HeatmapEntry[];
}

function getIntensityColor(count: number): string {
  if (count === 0) return 'rgba(87, 83, 78, 0.3)';
  if (count === 1) return 'rgba(212, 168, 83, 0.2)';
  if (count === 2) return 'rgba(212, 168, 83, 0.35)';
  if (count === 3) return 'rgba(212, 168, 83, 0.5)';
  if (count === 4) return 'rgba(212, 168, 83, 0.7)';
  return '#D4A853';
}

export default memo(function ClientFoodHeatmap({ data }: ClientFoodHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const grid = useMemo(() => {
    const map = new Map(data.map((d) => [d.date, d.count]));
    const today = new Date();
    const cells: Array<{ date: string; count: number; weekDay: number; weekIdx: number }> = [];

    for (let weekIdx = 7; weekIdx >= 0; weekIdx--) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const d = new Date(today);
        d.setDate(d.getDate() - (weekIdx * 7 + (6 - dayIdx)));
        const dateStr = d.toISOString().split('T')[0];
        cells.push({
          date: dateStr,
          count: map.get(dateStr) ?? 0,
          weekDay: dayIdx,
          weekIdx: 7 - weekIdx,
        });
      }
    }
    return cells;
  }, [data]);

  const cellSize = 14;
  const gap = 3;
  const weeksCount = 8;
  const daysCount = 7;
  const svgW = weeksCount * (cellSize + gap) + 20;
  const svgH = daysCount * (cellSize + gap) + 4;

  const dayLabels = ['M', '', 'W', '', 'F', '', 'S'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Food Logging Activity
      </h3>

      <div className="relative overflow-x-auto">
        <svg width={svgW} height={svgH} className="mx-auto">
          {/* Day labels */}
          {dayLabels.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={i * (cellSize + gap) + cellSize / 2 + 3}
                fill="#78716c"
                fontSize={8}
                fontFamily="monospace"
              >
                {label}
              </text>
            ) : null,
          )}

          {/* Grid cells */}
          {grid.map((cell, i) => {
            const x = 16 + cell.weekIdx * (cellSize + gap);
            const y = cell.weekDay * (cellSize + gap);
            return (
              <motion.rect
                key={cell.date}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={getIntensityColor(cell.count)}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.003, duration: 0.2 }}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setHoveredCell({ date: cell.date, count: cell.count, x: rect.x, y: rect.y });
                }}
                onMouseLeave={() => setHoveredCell(null)}
              />
            );
          })}
        </svg>

        {/* Tooltip (positioned via portal-less absolute) */}
        {hoveredCell && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: hoveredCell.x - 20, top: hoveredCell.y - 36 }}
          >
            <div className="bg-stone-900 border border-white/10 rounded-md px-2 py-1 shadow-xl">
              <p className="text-stone-300 text-[9px] font-medium">
                {hoveredCell.count} meal{hoveredCell.count !== 1 ? 's' : ''}
              </p>
              <p className="text-stone-500 text-[8px]">{hoveredCell.date}</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-stone-600 text-[9px]">Less</span>
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <div
            key={v}
            className="w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: getIntensityColor(v) }}
          />
        ))}
        <span className="text-stone-600 text-[9px]">More</span>
      </div>
    </motion.div>
  );
});
