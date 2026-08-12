'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from '@/components/ui';

type Severity = 'info' | 'warning' | 'positive';

interface Signal {
  icon: IconName;
  text: string;
  severity: Severity;
}

interface BehavioralSignalsProps {
  signals: Signal[];
}

const SEVERITY_STYLES: Record<Severity, { border: string; bg: string }> = {
  warning: { border: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)' },
  positive: { border: 'var(--status-success-fg)', bg: 'var(--status-success-bg)' },
  info: { border: 'var(--status-info-fg)', bg: 'var(--status-info-bg)' },
};

export default memo(function BehavioralSignals({ signals }: BehavioralSignalsProps) {
  const visible = signals.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-3">
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
              <Icon name={signal.icon} size={14} className="flex-shrink-0 mt-0.5" style={{ color: style.border }} aria-hidden />
              <span className="text-[var(--content-secondary)] text-xs leading-relaxed">
                {signal.text}
              </span>
            </motion.div>
          );
        })}
      </div>

      {signals.length === 0 && (
        <p className="text-[var(--content-muted)] text-xs text-center py-4">
          No signals detected
        </p>
      )}
    </motion.div>
  );
});
