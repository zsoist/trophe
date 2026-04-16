'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface RecoveryScoreProps {
  sleepScore: number;
  moodScore: number;
  trainingLoad: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function getRecoveryColor(score: number): string {
  if (score >= 70) return '#4ade80'; // green - recovered
  if (score >= 40) return '#D4A853'; // gold - moderate
  return '#f87171'; // red - overreached
}

function getRecoveryLabel(score: number): string {
  if (score >= 70) return 'Recovered';
  if (score >= 40) return 'Moderate';
  return 'Overreached';
}

const GAUGE_RADIUS = 60;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = Math.PI * GAUGE_RADIUS; // Semi-circle

export default memo(function RecoveryScore({
  sleepScore,
  moodScore,
  trainingLoad,
}: RecoveryScoreProps) {
  const [animated, setAnimated] = useState(false);

  // Composite score: sleep 40%, mood 30%, inverse training load 30%
  const inverseLoad = 100 - clamp(trainingLoad, 0, 100);
  const overall = Math.round(
    clamp(sleepScore, 0, 100) * 0.4 +
      clamp(moodScore, 0, 100) * 0.3 +
      inverseLoad * 0.3
  );

  const color = getRecoveryColor(overall);
  const label = getRecoveryLabel(overall);
  const progress = overall / 100;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  const sections = [
    { label: 'Sleep', score: clamp(sleepScore, 0, 100), color: '#60a5fa' },
    { label: 'Mood', score: clamp(moodScore, 0, 100), color: '#a78bfa' },
    { label: 'Load', score: clamp(trainingLoad, 0, 100), color: '#fbbf24' },
  ];

  // SVG gauge: semi-circle from left to right (180 degrees)
  const cx = 70;
  const cy = 70;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-200 text-sm font-semibold mb-3">Recovery Score</h3>

      {/* SVG Gauge */}
      <div className="flex justify-center mb-3">
        <svg width="140" height="80" viewBox="0 0 140 80">
          {/* Background arc */}
          <path
            d={`M ${cx - GAUGE_RADIUS} ${cy} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${cx + GAUGE_RADIUS} ${cy}`}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />

          {/* Colored sections background: red, gold, green */}
          {[
            { start: 0, end: 0.4, c: '#f8717140' },
            { start: 0.4, end: 0.7, c: '#D4A85340' },
            { start: 0.7, end: 1, c: '#4ade8040' },
          ].map((seg) => {
            const startAngle = Math.PI + seg.start * Math.PI;
            const endAngle = Math.PI + seg.end * Math.PI;
            const x1 = cx + GAUGE_RADIUS * Math.cos(startAngle);
            const y1 = cy + GAUGE_RADIUS * Math.sin(startAngle);
            const x2 = cx + GAUGE_RADIUS * Math.cos(endAngle);
            const y2 = cy + GAUGE_RADIUS * Math.sin(endAngle);
            return (
              <path
                key={seg.start}
                d={`M ${x1} ${y1} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={seg.c}
                strokeWidth={STROKE_WIDTH}
              />
            );
          })}

          {/* Progress arc */}
          <motion.path
            d={`M ${cx - GAUGE_RADIUS} ${cy} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 ${cx + GAUGE_RADIUS} ${cy}`}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{
              strokeDashoffset: animated
                ? CIRCUMFERENCE * (1 - progress)
                : CIRCUMFERENCE,
            }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* Center text */}
          <text
            x={cx}
            y={cy - 12}
            textAnchor="middle"
            fill={color}
            fontSize="22"
            fontWeight="700"
          >
            {overall}
          </text>
          <text
            x={cx}
            y={cy - 0}
            textAnchor="middle"
            fill="rgb(168,162,158)"
            fontSize="9"
            fontWeight="500"
          >
            {label}
          </text>
        </svg>
      </div>

      {/* Section breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {sections.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-white/[0.02]"
          >
            <div className="relative w-8 h-8">
              <svg width="32" height="32" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="3"
                />
                <motion.circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke={s.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 12}
                  initial={{ strokeDashoffset: 2 * Math.PI * 12 }}
                  animate={{
                    strokeDashoffset: animated
                      ? 2 * Math.PI * 12 * (1 - s.score / 100)
                      : 2 * Math.PI * 12,
                  }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                  transform="rotate(-90 16 16)"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-stone-300">
                {s.score}
              </span>
            </div>
            <span className="text-stone-500 text-[9px] font-medium">{s.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
});
