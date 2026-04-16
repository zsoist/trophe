'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Streak Fire Celebration (Wave 4)
// Escalating celebrations at streak milestones
// ═══════════════════════════════════════════════

interface StreakFireAnimationProps {
  streakDays: number;
  clientName: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: string;
  delay: number;
}

function generateParticles(count: number): Particle[] {
  const colors = ['#D4A853', '#f59e0b', '#ef4444', '#fb923c', '#fbbf24', '#a8a29e'];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 300,
    y: -(Math.random() * 400 + 100),
    size: Math.random() * 8 + 3,
    rotation: Math.random() * 720 - 360,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.5,
  }));
}

function FlameIcon({ scale = 1 }: { scale?: number }) {
  return (
    <motion.svg
      width={40 * scale}
      height={50 * scale}
      viewBox="0 0 40 50"
      fill="none"
      animate={{
        scaleY: [1, 1.08, 1],
        scaleX: [1, 0.96, 1],
      }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <linearGradient id="flame-grad" x1="20" y1="50" x2="20" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="80%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
      </defs>
      <path
        d="M20 2C20 2 8 18 8 30C8 38 13 46 20 48C27 46 32 38 32 30C32 18 20 2 20 2Z"
        fill="url(#flame-grad)"
      />
      <path
        d="M20 18C20 18 14 26 14 32C14 36 17 40 20 42C23 40 26 36 26 32C26 26 20 18 20 18Z"
        fill="#fef3c7"
        opacity="0.7"
      />
    </motion.svg>
  );
}

export default function StreakFireAnimation({ streakDays, clientName }: StreakFireAnimationProps) {
  const [visible, setVisible] = useState(true);
  const [particles] = useState(() => generateParticles(streakDays >= 30 ? 30 : 0));

  const tier = streakDays >= 30 ? 'epic' : streakDays >= 14 ? 'big' : 'small';

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Backdrop glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: tier === 'epic'
                ? 'radial-gradient(circle at 50% 50%, rgba(212,168,83,0.15) 0%, transparent 60%)'
                : tier === 'big'
                ? 'radial-gradient(circle at 50% 50%, rgba(212,168,83,0.08) 0%, transparent 50%)'
                : 'transparent',
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1.5 }}
            transition={{ duration: 0.6 }}
          />

          {/* Particle burst for 30+ days */}
          {tier === 'epic' && particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-sm"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                rotate: 0,
                opacity: 1,
              }}
              animate={{
                x: p.x,
                y: p.y,
                scale: [0, 1.5, 0.8],
                rotate: p.rotation,
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                delay: p.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}

          {/* Content */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0.3, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {/* Flame(s) */}
            <div className="flex items-end gap-1 mb-3">
              {tier === 'epic' && <FlameIcon scale={0.7} />}
              <FlameIcon scale={tier === 'small' ? 0.8 : tier === 'big' ? 1.1 : 1.4} />
              {tier === 'epic' && <FlameIcon scale={0.7} />}
            </div>

            {/* Streak text */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div
                className="text-3xl font-black mb-1"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24, #D4A853, #f59e0b)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {streakDays}-Day Streak!
              </div>
              <p className="text-sm text-stone-400">
                {clientName} is on fire
              </p>
            </motion.div>

            {/* Tier label */}
            {tier !== 'small' && (
              <motion.div
                className="mt-3 px-4 py-1 rounded-full text-xs font-bold"
                style={{
                  background: tier === 'epic'
                    ? 'linear-gradient(135deg, rgba(212,168,83,0.3), rgba(245,158,11,0.2))'
                    : 'rgba(212,168,83,0.12)',
                  color: '#D4A853',
                  border: '1px solid rgba(212,168,83,0.3)',
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, type: 'spring' }}
              >
                {tier === 'epic' ? 'LEGENDARY' : 'ON FIRE'}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
