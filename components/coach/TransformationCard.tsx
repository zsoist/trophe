'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Transformation Card (Wave 4)
// Shareable client progress card with gold gradient
// ═══════════════════════════════════════════════

interface TransformationClient {
  name: string;
  startDate: string;
  startWeight: number;
  currentWeight: number;
  habitsCompleted: number;
  mealsLogged: number;
  daysCoached: number;
}

interface TransformationCardProps {
  client: TransformationClient;
}

function AnimatedCounter({ value, suffix = '', decimals = 0, delay = 0 }: {
  value: number;
  suffix?: string;
  decimals?: number;
  delay?: number;
}) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now() + delay;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(eased * value);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, delay]);

  return (
    <span>
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}{suffix}
    </span>
  );
}

export default function TransformationCard({ client }: TransformationCardProps) {
  const [copied, setCopied] = useState(false);
  const weightDiff = client.startWeight - client.currentWeight;
  const isLoss = weightDiff > 0;

  const handleShare = useCallback(async () => {
    const text = `${client.name} — ${Math.abs(weightDiff).toFixed(1)}kg ${isLoss ? 'lost' : 'gained'} in ${client.daysCoached} days | ${client.habitsCompleted} habits completed | ${client.mealsLogged} meals logged | Coached with Trophe`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [client, weightDiff, isLoss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.15) 0%, rgba(28,25,23,0.95) 40%, rgba(28,25,23,0.98) 100%)',
        border: '1px solid rgba(212,168,83,0.2)',
      }}
    >
      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Gold accent line at top */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, transparent, #D4A853, transparent)' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      />

      {/* Header */}
      <div className="relative z-10 mb-5">
        <motion.p
          className="text-[10px] uppercase tracking-[0.2em] text-[#D4A853]/60 mb-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Client Transformation
        </motion.p>
        <motion.h3
          className="text-2xl font-bold text-stone-100"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          {client.name}
        </motion.h3>
        <motion.p
          className="text-xs text-stone-500 mt-0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Since {new Date(client.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </motion.p>
      </div>

      {/* Big weight change */}
      <motion.div
        className="relative z-10 text-center py-4 mb-5"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
      >
        <div className="text-5xl font-black text-[#D4A853]">
          <AnimatedCounter value={Math.abs(weightDiff)} decimals={1} delay={600} />
          <span className="text-2xl font-semibold ml-1">kg</span>
        </div>
        <p className="text-sm text-stone-400 mt-1">
          {isLoss ? 'Lost' : 'Gained'} &middot; {client.startWeight}kg &rarr; {client.currentWeight}kg
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="relative z-10 grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Days', value: client.daysCoached, delay: 700 },
          { label: 'Habits', value: client.habitsCompleted, delay: 800 },
          { label: 'Meals', value: client.mealsLogged, delay: 900 },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            className="text-center py-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stat.delay / 1000 }}
          >
            <div className="text-xl font-bold text-stone-100">
              <AnimatedCounter value={stat.value} delay={stat.delay} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 mt-0.5">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Share button */}
      <motion.button
        onClick={handleShare}
        className="relative z-10 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300"
        style={{
          background: copied
            ? 'rgba(34,197,94,0.15)'
            : 'linear-gradient(135deg, rgba(212,168,83,0.2) 0%, rgba(212,168,83,0.08) 100%)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(212,168,83,0.25)'}`,
          color: copied ? '#22c55e' : '#D4A853',
        }}
        whileTap={{ scale: 0.97 }}
      >
        {copied ? 'Copied to clipboard!' : 'Share Progress'}
      </motion.button>

      {/* Trophe branding */}
      <motion.p
        className="relative z-10 text-center text-[9px] text-stone-600 mt-3 tracking-wider"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        TROPHE
      </motion.p>
    </motion.div>
  );
}
