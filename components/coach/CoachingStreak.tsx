'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface CoachingStreakProps {
  streakDays: number;
}

export default memo(function CoachingStreak({ streakDays }: CoachingStreakProps) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const startTime = performance.now();
    const duration = 800;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * streakDays));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [streakDays]);

  const tier = streakDays >= 30 ? 'legendary' : streakDays >= 14 ? 'strong' : streakDays >= 7 ? 'solid' : 'building';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 flex items-center gap-4 relative overflow-hidden"
    >
      {/* Background glow for high streaks */}
      {tier === 'solid' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 50%, rgba(212,168,83,0.08) 0%, transparent 60%)',
          }}
        />
      )}
      {tier === 'strong' && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: [0.05, 0.12, 0.05] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(circle at 30% 50%, rgba(212,168,83,0.15) 0%, transparent 60%)',
          }}
        />
      )}
      {tier === 'legendary' && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ opacity: [0.08, 0.2, 0.08] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: 'radial-gradient(circle at 30% 50%, rgba(212,168,83,0.2) 0%, transparent 60%)',
            }}
          />
          {/* Sparkle particles */}
          {[0, 1, 2].map((n) => (
            <motion.div
              key={n}
              className="absolute w-1 h-1 rounded-full pointer-events-none"
              style={{ backgroundColor: '#D4A853' }}
              animate={{
                x: [0, (n - 1) * 20, 0],
                y: [0, -15 - n * 5, 0],
                opacity: [0, 1, 0],
                scale: [0, 1.2, 0],
              }}
              transition={{
                duration: 2,
                delay: n * 0.6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              initial={{ left: `${25 + n * 8}%`, top: '50%' }}
            />
          ))}
        </>
      )}

      {/* Flame icon */}
      <div className="relative z-10">
        <motion.span
          className="text-3xl block"
          animate={
            tier === 'strong' || tier === 'legendary'
              ? { scale: [1, 1.1, 1], rotate: [0, 3, -3, 0] }
              : {}
          }
          transition={
            tier === 'strong' || tier === 'legendary'
              ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
              : {}
          }
        >
          {'\uD83D\uDD25'}
        </motion.span>
      </div>

      {/* Count and label */}
      <div className="relative z-10 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-2xl font-bold tabular-nums"
            style={{
              color: tier === 'building' ? '#a8a29e' : '#D4A853',
            }}
          >
            {display}
          </span>
          <span className="text-stone-400 text-sm">days</span>
        </div>
        <p className="text-stone-500 text-[10px] uppercase tracking-wider font-medium">
          {tier === 'legendary'
            ? 'Legendary streak!'
            : tier === 'strong'
              ? 'On fire!'
              : tier === 'solid'
                ? 'Solid streak'
                : 'Building momentum'}
        </p>
      </div>

      {/* Milestone markers */}
      <div className="relative z-10 flex gap-1">
        {[7, 14, 30].map((milestone) => (
          <div
            key={milestone}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              backgroundColor:
                streakDays >= milestone ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.04)',
              color: streakDays >= milestone ? '#D4A853' : '#57534e',
              border: `1px solid ${
                streakDays >= milestone ? 'rgba(212,168,83,0.3)' : 'rgba(255,255,255,0.06)'
              }`,
            }}
          >
            {milestone}
          </div>
        ))}
      </div>
    </motion.div>
  );
});
