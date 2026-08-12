'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Client Health Score Badge (Wave 4)
// Animated SVG ring with 0-100 score
// ═══════════════════════════════════════════════

interface ClientHealthScoreProps {
  score: number;
  label?: string;
}

const SIZE = 100;
const STROKE_WIDTH = 8;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getScoreColor(score: number): string {
  if (score > 80) return 'var(--status-success-fg)';
  if (score >= 50) return 'var(--action-primary)';
  return 'var(--status-danger-fg)';
}

function getScoreGlow(score: number): string {
  if (score > 80) return 'var(--status-success-bg)';
  if (score >= 50) return 'var(--status-warning-bg)';
  return 'var(--status-danger-bg)';
}

export default function ClientHealthScore({ score, label }: ClientHealthScoreProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const frameRef = useRef<number>(0);
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clampedScore);
  const glow = getScoreGlow(clampedScore);
  const dashOffset = CIRCUMFERENCE - (clampedScore / 100) * CIRCUMFERENCE;

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * clampedScore));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [clampedScore]);

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Background ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={STROKE_WIDTH}
          />

          {/* Score ring */}
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            style={{
              filter: `drop-shadow(0 0 6px ${glow})`,
            }}
          />
        </svg>

        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-2xl font-black"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {displayScore}
          </motion.span>
        </div>
      </div>

      {/* Label */}
      {label && (
        <motion.span
          className="text-xs text-[var(--content-secondary)] mt-1.5 text-center"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {label}
        </motion.span>
      )}
    </motion.div>
  );
}
