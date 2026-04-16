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
        className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <path d="M4 8l3 3 5-6" stroke="#4ade80" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-stone-300 text-xs font-medium">No plateau detected</p>
            <p className="text-stone-500 text-[10px]">Weight is trending as expected</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const diff = Math.round((currentWeight - targetWeight) * 10) / 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-amber-500/20 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        {/* Flat line icon */}
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <path
              d="M3 16l4-2 4 0 4 0 4-1 2 0"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={7} cy={14} r={1.5} fill="#f59e0b" />
            <circle cx={11} cy={14} r={1.5} fill="#f59e0b" />
            <circle cx={15} cy={14} r={1.5} fill="#f59e0b" />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-amber-400 text-xs font-semibold uppercase tracking-wider">
              Plateau Detected
            </h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {daysSinceChange}d
            </span>
          </div>

          <p className="text-stone-400 text-xs leading-relaxed mb-2">
            Weight has been stable at {currentWeight}kg for {daysSinceChange} days.
            {diff > 0
              ? ` Still ${diff}kg above target of ${targetWeight}kg.`
              : ` ${Math.abs(diff)}kg below target of ${targetWeight}kg.`}
          </p>

          <div className="text-stone-500 text-[10px] leading-relaxed">
            Consider: calorie cycling, increasing NEAT, adjusting training stimulus,
            or scheduling a refeed.
          </div>
        </div>
      </div>
    </motion.div>
  );
});
