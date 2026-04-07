'use client';

import { motion } from 'framer-motion';

interface StreakBadgesProps {
  bestStreak: number;
}

const MILESTONES = [
  { days: 3, emoji: '🔥', label: 'Getting Started', color: 'border-orange-500/30 bg-orange-500/10 text-orange-400' },
  { days: 7, emoji: '⭐', label: 'One Week Strong', color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' },
  { days: 14, emoji: '💎', label: 'Habit Master', color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
  { days: 30, emoji: '🏆', label: 'Monthly Champion', color: 'border-[#D4A853]/30 bg-[#D4A853]/10 text-[#D4A853]' },
  { days: 60, emoji: '👑', label: 'Unstoppable', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
];

export default function StreakBadges({ bestStreak }: StreakBadgesProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {MILESTONES.map((m, i) => {
        const earned = bestStreak >= m.days;
        return (
          <motion.div
            key={m.days}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${
              earned
                ? m.color
                : 'border-stone-800 bg-stone-900/50 text-stone-600'
            }`}
          >
            <span className={earned ? '' : 'grayscale opacity-40'}>{m.emoji}</span>
            {earned ? (
              <span>{m.label}</span>
            ) : (
              <span>{m.days}d</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
