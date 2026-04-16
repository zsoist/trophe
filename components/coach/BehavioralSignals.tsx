'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type Severity = 'info' | 'warning' | 'positive';

interface Signal {
  emoji: string;
  text: string;
  severity: Severity;
}

interface BehavioralSignalsProps {
  signals: Signal[];
}

const SEVERITY_STYLES: Record<Severity, { border: string; bg: string }> = {
  warning: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.06)' },
  positive: { border: '#4ade80', bg: 'rgba(74, 222, 128, 0.06)' },
  info: { border: '#60a5fa', bg: 'rgba(96, 165, 250, 0.06)' },
};

export default memo(function BehavioralSignals({ signals }: BehavioralSignalsProps) {
  const visible = signals.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Behavioral Signals
      </h3>

      <div className="flex flex-col gap-2">
        {visible.map((signal, i) => {
          const style = SEVERITY_STYLES[signal.severity];
          return (
            <motion.div
              key={`${signal.text}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
              style={{
                backgroundColor: style.bg,
                borderLeft: `3px solid ${style.border}`,
              }}
            >
              <span className="text-sm flex-shrink-0 mt-0.5">{signal.emoji}</span>
              <span className="text-stone-300 text-xs leading-relaxed">
                {signal.text}
              </span>
            </motion.div>
          );
        })}
      </div>

      {signals.length === 0 && (
        <p className="text-stone-500 text-xs text-center py-4">
          No signals detected
        </p>
      )}
    </motion.div>
  );
});
