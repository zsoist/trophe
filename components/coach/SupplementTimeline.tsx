'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface Supplement {
  name: string;
  timing: string;
  dose: string;
}

interface SupplementTimelineProps {
  supplements: Supplement[];
}

type TimingSlot = 'morning' | 'pre-workout' | 'post-workout' | 'with-meals' | 'evening';

const TIMING_META: Record<TimingSlot, { label: string; color: string; time: string }> = {
  morning: { label: 'Morning', color: '#fbbf24', time: '7:00 AM' },
  'pre-workout': { label: 'Pre-Workout', color: '#60a5fa', time: '10:00 AM' },
  'post-workout': { label: 'Post-Workout', color: '#4ade80', time: '12:00 PM' },
  'with-meals': { label: 'With Meals', color: '#D4A853', time: '1:00 PM' },
  evening: { label: 'Evening', color: '#a78bfa', time: '9:00 PM' },
};

const TIMING_ORDER: TimingSlot[] = ['morning', 'pre-workout', 'post-workout', 'with-meals', 'evening'];

function normalizeTiming(raw: string): TimingSlot {
  const lower = raw.toLowerCase().replace(/[\s_]+/g, '-');
  if (lower in TIMING_META) return lower as TimingSlot;
  if (lower.includes('morning') || lower.includes('am')) return 'morning';
  if (lower.includes('pre')) return 'pre-workout';
  if (lower.includes('post')) return 'post-workout';
  if (lower.includes('meal') || lower.includes('food')) return 'with-meals';
  return 'evening';
}

export default memo(function SupplementTimeline({ supplements }: SupplementTimelineProps) {
  // Group by timing slot
  const grouped = new Map<TimingSlot, Supplement[]>();
  for (const s of supplements) {
    const slot = normalizeTiming(s.timing);
    if (!grouped.has(slot)) grouped.set(slot, []);
    grouped.get(slot)!.push(s);
  }

  // Only show slots that have supplements, in order
  const activeSlots = TIMING_ORDER.filter((slot) => grouped.has(slot));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-200 text-sm font-semibold mb-4">Supplement Timeline</h3>

      <div className="relative pl-4">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.08]" />

        <div className="space-y-4">
          {activeSlots.map((slot, idx) => {
            const meta = TIMING_META[slot];
            const items = grouped.get(slot) ?? [];
            return (
              <motion.div
                key={slot}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08, duration: 0.3 }}
                className="relative"
              >
                {/* Dot */}
                <div
                  className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-stone-950"
                  style={{ backgroundColor: meta.color }}
                />

                {/* Content */}
                <div className="ml-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-stone-400 text-[10px] font-medium">{meta.time}</span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${meta.color}20`,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  {items.map((item, i) => (
                    <div
                      key={`${slot}-${i}`}
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-white/[0.02] mb-1"
                    >
                      <span className="text-stone-300 text-xs">{item.name}</span>
                      <span className="text-stone-500 text-[10px]">{item.dose}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
});
