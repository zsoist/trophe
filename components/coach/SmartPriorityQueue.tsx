'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Star, Clock, TrendingDown } from 'lucide-react';

interface PriorityClient {
  id: string;
  name: string;
  daysSinceActivity: number;
  readyForProgression: boolean;
  lowProtein: boolean;
  streakDays: number;
}

interface SmartPriorityQueueProps {
  clients: PriorityClient[];
}

interface ScoredClient extends PriorityClient {
  urgencyScore: number;
  badges: Array<{ icon: 'warning' | 'star' | 'clock' | 'protein'; label: string }>;
}

function computeUrgency(client: PriorityClient): ScoredClient {
  let score = 0;
  const badges: ScoredClient['badges'] = [];

  // Inactive clients are highest priority
  if (client.daysSinceActivity >= 7) {
    score += 100;
    badges.push({ icon: 'clock', label: `${client.daysSinceActivity}d inactive` });
  } else if (client.daysSinceActivity >= 3) {
    score += 50;
    badges.push({ icon: 'clock', label: `${client.daysSinceActivity}d inactive` });
  }

  // Low protein is a nutritional concern
  if (client.lowProtein) {
    score += 40;
    badges.push({ icon: 'protein', label: 'Low protein' });
  }

  // Ready for progression is a positive action item
  if (client.readyForProgression) {
    score += 30;
    badges.push({ icon: 'star', label: 'Ready to progress' });
  }

  // Long streaks lower urgency (client is doing well)
  if (client.streakDays >= 7) {
    score -= 10;
  }

  return { ...client, urgencyScore: score, badges };
}

const BADGE_STYLES = {
  warning: { Icon: AlertTriangle, color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  star: { Icon: Star, color: '#D4A853', bg: 'rgba(212, 168, 83, 0.15)' },
  clock: { Icon: Clock, color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)' },
  protein: { Icon: TrendingDown, color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
};

export default memo(function SmartPriorityQueue({ clients }: SmartPriorityQueueProps) {
  const scored = useMemo(() => {
    return clients.map(computeUrgency).sort((a, b) => b.urgencyScore - a.urgencyScore);
  }, [clients]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Priority Queue
      </h3>

      <div className="space-y-2">
        {scored.length === 0 && (
          <p className="text-stone-500 text-xs text-center py-6">No clients in queue</p>
        )}

        {scored.map((client, i) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
          >
            {/* Rank */}
            <span className="text-stone-600 text-[10px] font-mono w-5 text-center flex-shrink-0">
              #{i + 1}
            </span>

            {/* Urgency bar */}
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{
                backgroundColor:
                  client.urgencyScore >= 80
                    ? '#f87171'
                    : client.urgencyScore >= 40
                      ? '#D4A853'
                      : '#4ade80',
              }}
            />

            {/* Name & streak */}
            <div className="flex-1 min-w-0">
              <p className="text-stone-200 text-sm font-medium truncate">{client.name}</p>
              {client.streakDays > 0 && (
                <p className="text-stone-500 text-[10px]">
                  {client.streakDays}d streak
                </p>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {client.badges.map((badge, bi) => {
                const style = BADGE_STYLES[badge.icon];
                const BadgeIcon = style.Icon;
                return (
                  <div
                    key={bi}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: style.bg }}
                    title={badge.label}
                  >
                    <BadgeIcon size={10} style={{ color: style.color }} />
                    <span className="text-[9px] hidden sm:inline" style={{ color: style.color }}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
});
