'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface PlateauDetectorProps {
  detected: boolean;
  daysSinceChange: number;
  currentWeight: number;
  targetWeight: number;
}

export default memo(function PlateauDetector({
  detected,
  daysSinceChange,
  currentWeight,
  targetWeight,
}: PlateauDetectorProps) {
  if (!detected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <path d="M4 8l3 3 5-6" stroke="var(--status-success-fg)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-[var(--content-secondary)] text-xs font-medium">Metrics are moving</p>
            <p className="text-[var(--content-muted)] text-xs">No stabilization phase right now</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const diff = Math.round((currentWeight - targetWeight) * 10) / 10;

  // Stabilization, not "plateau" — per coach guidance (Michael): nutrition goals
  // aren't fixed (weight / blood markers / habits all shift), and a flat stretch
  // is often intentional. Neutral framing, not an alarm.
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--status-warning-bg)] rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        {/* Equilibrium / flat-line icon */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--status-warning-bg)' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <path d="M3 12h18" stroke="var(--action-primary)" strokeWidth={2} strokeLinecap="round" />
            <circle cx={7} cy={12} r={1.5} fill="var(--action-primary)" />
            <circle cx={12} cy={12} r={1.5} fill="var(--action-primary)" />
            <circle cx={17} cy={12} r={1.5} fill="var(--action-primary)" />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--action-primary)' }}>
              Stabilization phase
            </h3>
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--status-warning-bg)', color: 'var(--action-primary)' }}>
              {daysSinceChange}d
            </span>
          </div>

          <p className="text-[var(--content-secondary)] text-xs leading-relaxed mb-2">
            Weight has held at {currentWeight}kg for {daysSinceChange} days.
            {diff > 0
              ? ` ${diff}kg from the ${targetWeight}kg reference.`
              : ` ${Math.abs(diff)}kg past the ${targetWeight}kg reference.`}
          </p>

          <div className="text-[var(--content-muted)] text-xs leading-relaxed">
            A flat stretch can be intentional (maintenance / recovery) or a cue to adjust —
            read it against this client&apos;s current goal, which may not be weight at all.
          </div>
        </div>
      </div>
    </motion.div>
  );
});
