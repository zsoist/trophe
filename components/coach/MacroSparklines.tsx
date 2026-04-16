'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface SparklinePoint {
  date: string;
  value: number;
}

interface MacroSparklinesProps {
  data: SparklinePoint[];
  color?: string;
}

export default memo(function MacroSparklines({
  data,
  color = '#D4A853',
}: MacroSparklinesProps) {
  if (data.length < 2) return null;

  const w = 60;
  const h = 20;
  const pad = 2;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((d.value - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <motion.svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="inline-block"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      {data.length > 0 && (() => {
        const lastX = pad + ((data.length - 1) / (data.length - 1)) * (w - pad * 2);
        const lastY =
          h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
        return <circle cx={lastX} cy={lastY} r={1.5} fill={color} />;
      })()}
    </motion.svg>
  );
});
