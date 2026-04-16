'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type ActivityType = 'food' | 'habit' | 'workout' | 'checkin';

interface Activity {
  id: string;
  clientName: string;
  action: string;
  detail: string;
  timestamp: string;
  type: ActivityType;
}

interface CoachActivityFeedProps {
  activities: Activity[];
}

const TYPE_META: Record<ActivityType, { emoji: string; color: string }> = {
  food: { emoji: '\uD83C\uDF7D\uFE0F', color: 'rgba(212, 168, 83, 0.2)' },
  habit: { emoji: '\uD83D\uDD25', color: 'rgba(248, 113, 113, 0.2)' },
  workout: { emoji: '\uD83D\uDCAA', color: 'rgba(96, 165, 250, 0.2)' },
  checkin: { emoji: '\u2705', color: 'rgba(74, 222, 128, 0.2)' },
};

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default memo(function CoachActivityFeed({ activities }: CoachActivityFeedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Recent Activity
      </h3>

      <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1">
        {activities.length === 0 && (
          <p className="text-stone-500 text-xs text-center py-6">No recent activity</p>
        )}

        {activities.map((activity, i) => {
          const meta = TYPE_META[activity.type];
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                style={{ backgroundColor: meta.color }}
              >
                {meta.emoji}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-stone-200 text-xs leading-relaxed">
                  <span className="font-semibold text-[#D4A853]">{activity.clientName}</span>{' '}
                  {activity.action}
                </p>
                <p className="text-stone-500 text-[10px] truncate">{activity.detail}</p>
              </div>

              <span className="text-stone-600 text-[10px] flex-shrink-0 mt-0.5">
                {timeAgo(activity.timestamp)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
});
