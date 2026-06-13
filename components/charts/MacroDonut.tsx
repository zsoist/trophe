'use client';

import { motion } from 'framer-motion';

interface MacroDonutProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

export default function MacroDonut({
  calories,
  protein,
  carbs,
  fat,
  targetProtein,
  targetCarbs,
  targetFat,
}: MacroDonutProps) {
  const total = protein + carbs + fat;
  const targetTotal = targetProtein + targetCarbs + targetFat;

  // Percentages
  const proteinPct = total > 0 ? (protein / total) * 100 : 0;
  const carbsPct = total > 0 ? (carbs / total) * 100 : 0;
  const fatPct = total > 0 ? (fat / total) * 100 : 0;

  // Target percentages
  const tProteinPct = targetTotal > 0 ? (targetProtein / targetTotal) * 100 : 33;
  const tCarbsPct = targetTotal > 0 ? (targetCarbs / targetTotal) * 100 : 34;
  const tFatPct = targetTotal > 0 ? (targetFat / targetTotal) * 100 : 33;

  // SVG donut params
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 72;
  const targetR = 80;

  function describeArc(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): string {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  function polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleDeg: number
  ) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(rad),
      y: centerY + radius * Math.sin(rad),
    };
  }

  // Colors
  const colors = {
    protein: '#3b82f6',
    carbs: '#f59e0b',
    fat: '#f43f5e',
  };

  // Actual arcs
  const proteinEnd = (proteinPct / 100) * 360;
  const carbsEnd = proteinEnd + (carbsPct / 100) * 360;
  const fatEnd = carbsEnd + (fatPct / 100) * 360;

  // Target arcs
  const tProteinEnd = (tProteinPct / 100) * 360;
  const tCarbsEnd = tProteinEnd + (tCarbsPct / 100) * 360;
  const tFatEnd = tCarbsEnd + (tFatPct / 100) * 360;

  const macros = [
    { label: 'Protein', grams: protein, pct: proteinPct, color: colors.protein, target: targetProtein },
    { label: 'Carbs', grams: carbs, pct: carbsPct, color: colors.carbs, target: targetCarbs },
    { label: 'Fat', grams: fat, pct: fatPct, color: colors.fat, target: targetFat },
  ];

  // Avoid rendering arcs with 0 degrees
  const safeArc = (start: number, end: number, r: number) => {
    const diff = end - start;
    if (diff < 0.5) return null;
    // Cap at 359.9 to avoid full-circle rendering issues
    const safeEnd = diff >= 360 ? start + 359.9 : end;
    return describeArc(cx, cy, r, start, safeEnd);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={14} />

          {/* Target distribution (faded outer ring) */}
          {targetTotal > 0 && (
            <>
              {safeArc(0, tProteinEnd, targetR) && (
                <path
                  d={safeArc(0, tProteinEnd, targetR)!}
                  fill="none"
                  stroke={colors.protein}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.2}
                />
              )}
              {safeArc(tProteinEnd, tCarbsEnd, targetR) && (
                <path
                  d={safeArc(tProteinEnd, tCarbsEnd, targetR)!}
                  fill="none"
                  stroke={colors.carbs}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.2}
                />
              )}
              {safeArc(tCarbsEnd, tFatEnd, targetR) && (
                <path
                  d={safeArc(tCarbsEnd, tFatEnd, targetR)!}
                  fill="none"
                  stroke={colors.fat}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.2}
                />
              )}
            </>
          )}

          {/* Actual distribution (inner donut) */}
          {total > 0 && (
            <>
              {safeArc(0, proteinEnd, outerR) && (
                <motion.path
                  d={safeArc(0, proteinEnd, outerR)!}
                  fill="none"
                  stroke={colors.protein}
                  strokeWidth={14}
                  strokeLinecap="butt"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                />
              )}
              {safeArc(proteinEnd, carbsEnd, outerR) && (
                <motion.path
                  d={safeArc(proteinEnd, carbsEnd, outerR)!}
                  fill="none"
                  stroke={colors.carbs}
                  strokeWidth={14}
                  strokeLinecap="butt"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              )}
              {safeArc(carbsEnd, fatEnd, outerR) && (
                <motion.path
                  d={safeArc(carbsEnd, fatEnd, outerR)!}
                  fill="none"
                  stroke={colors.fat}
                  strokeWidth={14}
                  strokeLinecap="butt"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                />
              )}
            </>
          )}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-stone-100">{Math.round(calories)}</span>
          <span className="text-[10px] text-stone-500 uppercase tracking-wider">kcal</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {macros.map((m) => (
          <div key={m.label} className="text-center">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: m.color }}
              />
              <span className="text-[11px] text-stone-400">{m.label}</span>
            </div>
            <div className="text-xs text-stone-200 font-semibold">
              {Math.round(m.grams)}g
              <span className="text-stone-500 font-normal ml-1">
                ({Math.round(m.pct)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
