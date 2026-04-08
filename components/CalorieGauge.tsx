'use client';

import { motion } from 'framer-motion';

interface CalorieGaugeProps {
  consumed: number;
  target: number;
}

// F15: Speedometer-style calorie gauge
export default function CalorieGauge({ consumed, target }: CalorieGaugeProps) {
  if (target === 0) return null;

  const pct = Math.min(consumed / target, 2); // cap at 200%
  const angle = -135 + pct * 270; // sweep from -135° to 135°
  const r = 60;
  const cx = 70;
  const cy = 70;

  // Arc path for the background track
  const trackStart = polarToCartesian(cx, cy, r, -135);
  const trackEnd = polarToCartesian(cx, cy, r, 135);
  const trackPath = `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

  // Arc path for the filled portion
  const fillEnd = polarToCartesian(cx, cy, r, Math.min(angle, 135));
  const largeArc = pct > 0.5 ? 1 : 0;
  const fillPath = `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`;

  // Color zones
  const color = pct > 1.2 ? '#ef4444' // red (over)
    : pct > 1.0 ? '#f59e0b' // amber (slightly over)
    : pct > 0.8 ? '#22c55e' // green (on target)
    : pct > 0.5 ? '#D4A853' // gold (getting there)
    : '#78716c'; // stone (low)

  const remaining = Math.max(0, target - consumed);

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="90" viewBox="0 0 140 90">
        {/* Background track */}
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />

        {/* Zone indicators (subtle) */}
        {[0.5, 0.8, 1.0, 1.2].map(z => {
          const zAngle = -135 + z * 270;
          const p = polarToCartesian(cx, cy, r + 6, zAngle);
          return <circle key={z} cx={p.x} cy={p.y} r={1.5} fill="rgba(255,255,255,0.1)" />;
        })}

        {/* Filled arc */}
        <motion.path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />

        {/* Needle */}
        <motion.line
          x1={cx}
          y1={cy}
          x2={fillEnd.x}
          y2={fillEnd.y}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.8 }}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill={color} />

        {/* Center text */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-stone-100 text-lg font-bold" fontSize="18">
          {Math.round(consumed)}
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" className="fill-stone-500" fontSize="9">
          / {target} kcal
        </text>
      </svg>
      <p className="text-xs mt-1" style={{ color }}>
        {remaining > 0 ? `${Math.round(remaining)} kcal remaining` : `${Math.round(consumed - target)} over target`}
      </p>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}
