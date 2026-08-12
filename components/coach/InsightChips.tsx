'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type InsightType = 'positive' | 'warning' | 'info';

interface Insight {
  emoji: string;
  text: string;
  type: InsightType;
}

interface InsightChipsProps {
  insights: Insight[];
}

const TYPE_STYLES: Record<InsightType, { bg: string; text: string; border: string }> = {
  positive: {
    bg: 'var(--status-success-bg)',
    text: 'var(--status-success-fg)',
    border: 'var(--status-success-bg)',
  },
  warning: {
    bg: 'var(--status-warning-bg)',
    text: 'var(--status-warning-fg)',
    border: 'var(--status-warning-bg)',
  },
  info: {
    bg: 'var(--status-info-bg)',
    text: 'var(--status-info-fg)',
    border: 'var(--status-info-bg)',
  },
};

export default memo(function InsightChips({ insights }: InsightChipsProps) {
  if (insights.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
      {insights.map((insight, i) => {
        const style = TYPE_STYLES[insight.type];
        return (
          <motion.span
            key={`${insight.text}-${i}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.25 }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
            style={{
              backgroundColor: style.bg,
              border: `1px solid ${style.border}`,
              color: style.text,
              fontSize: '10px',
              lineHeight: '16px',
            }}
          >
            <span>{insight.emoji}</span>
            <span>{insight.text}</span>
          </motion.span>
        );
      })}
    </div>
  );
});
