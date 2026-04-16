'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface MacroSet {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  water: number;
}

interface ClientData {
  name: string;
  macros: MacroSet;
  targets: MacroSet;
}

interface ClientComparisonProps {
  clientA: ClientData;
  clientB: ClientData;
}

const AXES = ['protein', 'carbs', 'fat', 'fiber', 'water'] as const;
const AXIS_LABELS = ['Protein', 'Carbs', 'Fat', 'Fiber', 'Water'];

const COLOR_A = '#D4A853'; // gold
const COLOR_B = '#60a5fa'; // blue

export default memo(function ClientComparison({ clientA, clientB }: ClientComparisonProps) {
  const cx = 100;
  const cy = 100;
  const maxR = 70;
  const n = AXES.length;

  function getRatio(macros: MacroSet, targets: MacroSet, axis: typeof AXES[number]): number {
    const target = targets[axis];
    if (target <= 0) return 0;
    return Math.min(macros[axis] / target, 1.5);
  }

  function getPoint(index: number, ratio: number): { x: number; y: number } {
    const angle = (index / n) * 2 * Math.PI - Math.PI / 2;
    const r = ratio * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function buildPath(macros: MacroSet, targets: MacroSet): string {
    return AXES
      .map((axis, i) => {
        const ratio = getRatio(macros, targets, axis);
        const p = getPoint(i, ratio);
        return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(' ') + ' Z';
  }

  const pathA = buildPath(clientA.macros, clientA.targets);
  const pathB = buildPath(clientB.macros, clientB.targets);

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-2 text-center">
        Client Comparison
      </h3>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: COLOR_A }} />
          <span className="text-[10px] font-medium" style={{ color: COLOR_A }}>
            {clientA.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: COLOR_B }} />
          <span className="text-[10px] font-medium" style={{ color: COLOR_B }}>
            {clientB.name}
          </span>
        </div>
      </div>

      <svg width="200" height="200" viewBox="0 0 200 200" className="mx-auto block">
        {/* Grid rings */}
        {rings.map((r) => {
          const pts = Array.from({ length: n }, (_, i) => getPoint(i, r));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
          return (
            <path
              key={r}
              d={path}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const p = getPoint(i, 1.15);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Target polygon (100% ring, dashed) */}
        {(() => {
          const pts = Array.from({ length: n }, (_, i) => getPoint(i, 1));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
          return <path d={path} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />;
        })()}

        {/* Client A polygon */}
        <motion.path
          d={pathA}
          fill={`${COLOR_A}15`}
          stroke={COLOR_A}
          strokeWidth="1.5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Client B polygon */}
        <motion.path
          d={pathB}
          fill={`${COLOR_B}15`}
          stroke={COLOR_B}
          strokeWidth="1.5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Data points A */}
        {AXES.map((axis, i) => {
          const ratio = getRatio(clientA.macros, clientA.targets, axis);
          const p = getPoint(i, ratio);
          return (
            <motion.circle
              key={`a-${i}`}
              cx={p.x}
              cy={p.y}
              r="3"
              fill={COLOR_A}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 + i * 0.08 }}
            />
          );
        })}

        {/* Data points B */}
        {AXES.map((axis, i) => {
          const ratio = getRatio(clientB.macros, clientB.targets, axis);
          const p = getPoint(i, ratio);
          return (
            <motion.circle
              key={`b-${i}`}
              cx={p.x}
              cy={p.y}
              r="3"
              fill={COLOR_B}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.08 }}
            />
          );
        })}

        {/* Labels */}
        {AXES.map((_, i) => {
          const p = getPoint(i, 1.4);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-stone-500"
              fontSize="9"
            >
              {AXIS_LABELS[i]}
            </text>
          );
        })}
      </svg>

      {/* Numeric comparison table */}
      <div className="mt-3 grid grid-cols-3 gap-x-2 text-[10px]">
        <div className="text-right font-medium" style={{ color: COLOR_A }}>
          {clientA.name}
        </div>
        <div className="text-center text-stone-500 font-semibold">vs</div>
        <div className="text-left font-medium" style={{ color: COLOR_B }}>
          {clientB.name}
        </div>

        {AXES.map((axis, i) => (
          <div key={axis} className="contents">
            <div className="text-right tabular-nums" style={{ color: COLOR_A }}>
              {Math.round(clientA.macros[axis])}
              {axis === 'water' ? 'ml' : 'g'}
            </div>
            <div className="text-center text-stone-600">{AXIS_LABELS[i]}</div>
            <div className="text-left tabular-nums" style={{ color: COLOR_B }}>
              {Math.round(clientB.macros[axis])}
              {axis === 'water' ? 'ml' : 'g'}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
});
