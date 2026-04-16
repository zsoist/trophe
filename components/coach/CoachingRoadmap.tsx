'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type HabitStatus = 'completed' | 'active' | 'upcoming';

interface Habit {
  name: string;
  emoji: string;
  status: HabitStatus;
}

interface CoachingRoadmapProps {
  habits: Habit[];
}

const STATUS_STYLES: Record<HabitStatus, {
  ring: string;
  bg: string;
  text: string;
  lineColor: string;
}> = {
  completed: {
    ring: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.15)',
    text: 'text-green-400',
    lineColor: '#4ade80',
  },
  active: {
    ring: '#D4A853',
    bg: 'rgba(212, 168, 83, 0.15)',
    text: 'text-[#D4A853]',
    lineColor: '#D4A853',
  },
  upcoming: {
    ring: '#57534e',
    bg: 'rgba(87, 83, 78, 0.15)',
    text: 'text-stone-500',
    lineColor: '#57534e',
  },
};

export default memo(function CoachingRoadmap({ habits }: CoachingRoadmapProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
        Coaching Roadmap
      </h3>

      <div className="flex items-start overflow-x-auto pb-2 gap-0">
        {habits.map((habit, i) => {
          const style = STATUS_STYLES[habit.status];
          const isLast = i === habits.length - 1;

          return (
            <motion.div
              key={`${habit.name}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className="flex items-start flex-shrink-0"
            >
              <div className="flex flex-col items-center min-w-[72px]">
                {/* Circle node */}
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center border-2"
                    style={{
                      borderColor: style.ring,
                      backgroundColor: style.bg,
                    }}
                  >
                    {habit.status === 'completed' ? (
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                        <path
                          d="M4 8l3 3 5-6"
                          stroke="#4ade80"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="text-base">{habit.emoji}</span>
                    )}
                  </div>

                  {/* Pulse ring for active */}
                  {habit.status === 'active' && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-[#D4A853]"
                      animate={{
                        scale: [1, 1.4],
                        opacity: [0.6, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className={`mt-2 text-[10px] text-center leading-tight max-w-[64px] ${style.text}`}
                >
                  {habit.name}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className="h-0.5 w-6 mt-5 flex-shrink-0"
                  style={{
                    backgroundColor:
                      habit.status === 'upcoming'
                        ? 'transparent'
                        : style.lineColor,
                    backgroundImage:
                      habit.status === 'upcoming'
                        ? `repeating-linear-gradient(90deg, #57534e 0px, #57534e 4px, transparent 4px, transparent 8px)`
                        : undefined,
                    backgroundSize: habit.status === 'upcoming' ? '8px 2px' : undefined,
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {habits.length === 0 && (
        <p className="text-stone-500 text-xs text-center py-4">
          No habits assigned yet
        </p>
      )}
    </motion.div>
  );
});
