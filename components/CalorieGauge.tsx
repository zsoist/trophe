'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface CalorieGaugeProps {
  consumed: number;
  target: number;
}

export default memo(function CalorieGauge({ consumed, target }: CalorieGaugeProps) {
  if (target === 0) return null;

  const pct = Math.min(consumed / target, 2);
  const r = 54;
  const cx = 75;
  const cy = 75;
  const strokeWidth = 10;

  // Arc spans 270° (from 135° to 405° / -225° to 45°)
  // Using stroke-dasharray on a circle is simpler and animates well
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * (270 / 360); // 270° arc
  const fillLength = arcLength * Math.min(pct, 1);
  const gapLength = circumference - arcLength;

  // Color based on percentage
  const color = pct > 1.2 ? '#ef4444'
    : pct > 1.0 ? '#f59e0b'
    : pct > 0.8 ? '#22c55e'
    : pct > 0.5 ? '#D4A853'
    : '#78716c';

  const remaining = target - consumed;

  // Zone tick marks at 50%, 80%, 100%, 120%
  const ticks = [0.5, 0.8, 1.0, 1.2].map(z => {
    const angle = 135 + z * 270; // start at 135° (bottom-left)
    const rad = (angle * Math.PI) / 180;
    const inner = r - strokeWidth / 2 - 2;
    const outer = r + strokeWidth / 2 + 2;
    return {
      z,
      x1: cx + inner * Math.cos(rad),
      y1: cy + inner * Math.sin(rad),
      x2: cx + outer * Math.cos(rad),
      y2: cy + outer * Math.sin(rad),
    };
  });

  // Needle endpoint
  const needleAngle = 135 + Math.min(pct, 1.3) * 270;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = cx + (r - 15) * Math.cos(needleRad);
  const needleY = cy + (r - 15) * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center">
      <svg width="150" height="110" viewBox="0 0 150 110">
        {/* Background track — 270° arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={-circumference * (135 / 360)}
          transform={`rotate(0 ${cx} ${cy})`}
        />

        {/* Tick marks */}
        {ticks.map(tick => (
          <line
            key={tick.z}
            x1={tick.x1} y1={tick.y1}
            x2={tick.x2} y2={tick.y2}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        ))}

        {/* Filled arc — animated */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeDashoffset={-circumference * (135 / 360)}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${fillLength} ${circumference - fillLength}` }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />

        {/* Needle */}
        <motion.line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 1 }}
        />
        <circle cx={cx} cy={cy} r="4" fill={color} />
        <circle cx={cx} cy={cy} r="2" fill="#1a1a1a" />

        {/* Center text */}
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle" fill="#f5f5f4" fontSize="20" fontWeight="bold">
          {Math.round(consumed)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle" fill="#78716c" fontSize="9">
          / {target} kcal
        </text>

        {/* Labels at start/end of arc */}
        <text x="18" y="95" fill="#57534e" fontSize="8">0</text>
        <text x="125" y="95" fill="#57534e" fontSize="8">{target * 2 > 4000 ? '4k' : target * 2}</text>
      </svg>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xs -mt-1"
        style={{ color }}
      >
        {remaining > 0
          ? `${Math.round(remaining)} kcal remaining`
          : `${Math.round(Math.abs(remaining))} over target`
        }
      </motion.p>
    </div>
  );
});
