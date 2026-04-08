'use client';

import { motion } from 'framer-motion';

interface MacroRadarProps {
  current: { protein: number; carbs: number; fat: number; fiber: number; water: number };
  targets: { protein: number; carbs: number; fat: number; fiber: number; water: number };
}

// F18: Macro balance radar chart — 5 axes
export default function MacroRadar({ current, targets }: MacroRadarProps) {
  const axes = [
    { label: 'Protein', value: targets.protein > 0 ? current.protein / targets.protein : 0, color: '#f87171' },
    { label: 'Carbs', value: targets.carbs > 0 ? current.carbs / targets.carbs : 0, color: '#60a5fa' },
    { label: 'Fat', value: targets.fat > 0 ? current.fat / targets.fat : 0, color: '#a78bfa' },
    { label: 'Fiber', value: targets.fiber > 0 ? current.fiber / targets.fiber : 0, color: '#4ade80' },
    { label: 'Water', value: targets.water > 0 ? current.water / targets.water : 0, color: '#38bdf8' },
  ];

  const cx = 80;
  const cy = 80;
  const maxR = 55;
  const n = axes.length;

  const getPoint = (index: number, ratio: number) => {
    const angle = (index / n) * 2 * Math.PI - Math.PI / 2;
    const r = Math.min(ratio, 1.5) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Target polygon (100%)
  const targetPoints = axes.map((_, i) => getPoint(i, 1));
  const targetPath = targetPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Current polygon
  const currentPoints = axes.map((a, i) => getPoint(i, a.value));
  const currentPath = currentPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className="glass p-4">
      <p className="text-stone-300 text-xs font-medium mb-2 text-center">Nutrient Balance</p>
      <svg width="160" height="160" viewBox="0 0 160 160" className="mx-auto">
        {/* Grid rings */}
        {rings.map(r => {
          const pts = Array.from({ length: n }, (_, i) => getPoint(i, r));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
          return <path key={r} d={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />;
        })}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const p = getPoint(i, 1.15);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />;
        })}

        {/* Target polygon */}
        <path d={targetPath} fill="none" stroke="rgba(212,168,83,0.3)" strokeWidth="1" strokeDasharray="3 3" />

        {/* Current polygon */}
        <motion.path
          d={currentPath}
          fill="rgba(212,168,83,0.15)"
          stroke="#D4A853"
          strokeWidth="1.5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Data points */}
        {currentPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={axes[i].color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3 + i * 0.1 }}
          />
        ))}

        {/* Labels */}
        {axes.map((a, i) => {
          const p = getPoint(i, 1.35);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-stone-500"
              fontSize="8"
            >
              {a.label}
            </text>
          );
        })}

        {/* Percentage labels on points */}
        {axes.map((a, i) => {
          const p = getPoint(i, Math.min(a.value, 1.5) + 0.15);
          return (
            <text
              key={`pct-${i}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="7"
              style={{ fill: a.color }}
            >
              {Math.round(a.value * 100)}%
            </text>
          );
        })}
      </svg>
    </div>
  );
}
