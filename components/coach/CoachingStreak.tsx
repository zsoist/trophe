'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface CoachingStreakProps {
  streakDays: number;
}

export default memo(function CoachingStreak({ streakDays }: CoachingStreakProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(streakDays);
      return;
    }
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
  }, [reduceMotion, streakDays]);

  const tier = streakDays >= 30 ? 'legendary' : streakDays >= 14 ? 'strong' : streakDays >= 7 ? 'solid' : 'building';

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={reduceMotion ? false : { opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, type: 'spring', stiffness: 200 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4 flex items-center gap-4 relative overflow-hidden"
      title="Consecutive days at least one of your clients logged a check-in — your coaching consistency. Resets when a day passes with no client activity."
    >
      {/* Background glow for high streaks */}
      {tier === 'solid' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 50%, var(--status-warning-bg) 0%, transparent 60%)',
          }}
        />
      )}
      {tier === 'strong' && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={reduceMotion ? false : undefined}
          animate={reduceMotion ? false : { opacity: [0.05, 0.12, 0.05] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(circle at 30% 50%, var(--status-warning-bg) 0%, transparent 60%)',
          }}
        />
      )}
      {tier === 'legendary' && (
        <>
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={reduceMotion ? false : undefined}
            animate={reduceMotion ? false : { opacity: [0.08, 0.2, 0.08] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            style={{
              background: 'radial-gradient(circle at 30% 50%, var(--status-warning-bg) 0%, transparent 60%)',
            }}
          />
          {/* Sparkle particles */}
          {[0, 1, 2].map((n) => (
            <motion.div
              key={n}
              className="absolute w-1 h-1 rounded-full pointer-events-none"
              style={{ backgroundColor: 'var(--action-primary)' }}
              initial={reduceMotion ? false : { left: `${25 + n * 8}%`, top: '50%' }}
              animate={reduceMotion ? false : {
                x: [0, (n - 1) * 20, 0],
                y: [0, -15 - n * 5, 0],
                opacity: [0, 1, 0],
                scale: [0, 1.2, 0],
              }}
              transition={reduceMotion ? { duration: 0 } : {
                duration: 2,
                delay: n * 0.6,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut',
              }}
            />
          ))}
        </>
      )}

      {/* Flame icon */}
      <div className="relative z-10">
        <motion.span
          className="text-3xl block"
          initial={reduceMotion ? false : undefined}
          animate={!reduceMotion && (tier === 'strong' || tier === 'legendary')
              ? { scale: [1, 1.1, 1], rotate: [0, 3, -3, 0] }
              : false
          }
          transition={!reduceMotion && (tier === 'strong' || tier === 'legendary')
              ? { duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
              : { duration: 0 }
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
              color: tier === 'building' ? 'var(--data-neutral)' : 'var(--action-primary)',
            }}
          >
            {display}
          </span>
          <span className="text-[var(--content-secondary)] text-sm">days</span>
        </div>
        <p className="text-[var(--content-muted)] text-xs uppercase tracking-wider font-medium">
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
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              backgroundColor:
                streakDays >= milestone ? 'var(--status-warning-bg)' : 'var(--border-subtle)',
              color: streakDays >= milestone ? 'var(--action-primary)' : 'var(--data-neutral)',
              border: `1px solid ${
                streakDays >= milestone ? 'var(--status-warning-border)' : 'var(--border-subtle)'
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
