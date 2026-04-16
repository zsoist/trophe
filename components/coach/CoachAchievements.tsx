'use client';

import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════
// τροφή — Coach Achievements Badge Grid (Wave 4)
// Gold glow unlocked badges with staggered reveal
// ═══════════════════════════════════════════════

interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

interface CoachAchievementsProps {
  achievements?: Achievement[];
}

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first-client', name: 'First Client', emoji: '🎯', description: 'Onboard your first client', unlocked: false },
  { id: '10-notes', name: '10 Notes', emoji: '📝', description: 'Write 10 coaching notes', unlocked: false },
  { id: '7-day-streak', name: '7-Day Streak', emoji: '🔥', description: 'Log in 7 consecutive days', unlocked: false },
  { id: 'first-progression', name: 'First Progression', emoji: '💪', description: 'Progress a client habit', unlocked: false },
  { id: 'all-on-track', name: 'All On Track', emoji: '📊', description: 'All clients compliant in a day', unlocked: false },
  { id: '5-habits', name: '5 Habits Assigned', emoji: '🎓', description: 'Assign 5 different habits', unlocked: false },
  { id: '30-day-streak', name: '30-Day Streak', emoji: '🏆', description: 'Log in 30 consecutive days', unlocked: false },
  { id: '10-clients', name: '10 Clients', emoji: '👑', description: 'Manage 10 active clients', unlocked: false },
  { id: '100-meals', name: '100 Meals Tracked', emoji: '🌟', description: 'Clients log 100 total meals', unlocked: false },
  { id: 'perfect-week', name: 'Perfect Week', emoji: '💎', description: 'All clients hit all targets for a week', unlocked: false },
];

export default function CoachAchievements({ achievements }: CoachAchievementsProps) {
  const badges = achievements ?? DEFAULT_ACHIEVEMENTS;
  const unlockedCount = badges.filter((a) => a.unlocked).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-stone-100">Achievements</h3>
          <p className="text-xs text-stone-500">
            {unlockedCount}/{badges.length} unlocked
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{
            background: 'rgba(212,168,83,0.12)',
            color: '#D4A853',
            border: '1px solid rgba(212,168,83,0.2)',
          }}
        >
          Level {Math.floor(unlockedCount / 3) + 1}
        </div>
      </div>

      {/* Badge grid */}
      <div className="grid grid-cols-3 gap-3">
        {badges.map((badge, i) => (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, scale: 0.6, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: i * 0.06,
              duration: 0.4,
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
            whileHover={badge.unlocked ? { scale: 1.08, y: -2 } : undefined}
            className="relative flex flex-col items-center py-4 px-2 rounded-xl text-center transition-shadow duration-300"
            style={{
              background: badge.unlocked
                ? 'rgba(212,168,83,0.06)'
                : 'rgba(255,255,255,0.02)',
              border: badge.unlocked
                ? '1px solid rgba(212,168,83,0.2)'
                : '1px solid rgba(255,255,255,0.04)',
              boxShadow: badge.unlocked
                ? '0 0 20px rgba(212,168,83,0.08)'
                : 'none',
              filter: badge.unlocked ? 'none' : 'grayscale(1)',
            }}
          >
            {/* Lock overlay for locked badges */}
            {!badge.unlocked && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10">
                <span className="text-lg opacity-40">🔒</span>
              </div>
            )}

            {/* Emoji */}
            <motion.span
              className="text-2xl mb-1.5"
              style={{ opacity: badge.unlocked ? 1 : 0.25 }}
              whileHover={badge.unlocked ? { rotate: [0, -10, 10, 0] } : undefined}
              transition={{ duration: 0.4 }}
            >
              {badge.emoji}
            </motion.span>

            {/* Name */}
            <span
              className="text-[10px] font-semibold leading-tight"
              style={{
                color: badge.unlocked ? '#D4A853' : 'rgba(168,162,158,0.4)',
              }}
            >
              {badge.name}
            </span>

            {/* Unlocked date */}
            {badge.unlocked && badge.unlockedAt && (
              <span className="text-[8px] text-stone-600 mt-0.5">
                {new Date(badge.unlockedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}

            {/* Gold glow ring for unlocked */}
            {badge.unlocked && (
              <motion.div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  boxShadow: '0 0 15px rgba(212,168,83,0.12), inset 0 0 15px rgba(212,168,83,0.04)',
                }}
                animate={{
                  boxShadow: [
                    '0 0 15px rgba(212,168,83,0.12), inset 0 0 15px rgba(212,168,83,0.04)',
                    '0 0 25px rgba(212,168,83,0.18), inset 0 0 20px rgba(212,168,83,0.06)',
                    '0 0 15px rgba(212,168,83,0.12), inset 0 0 15px rgba(212,168,83,0.04)',
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
