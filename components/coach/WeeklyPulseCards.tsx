'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, UtensilsCrossed, AlertTriangle } from 'lucide-react';

interface PulseStats {
  totalClients: number;
  avgCompliance: number;
  mealsThisWeek: number;
  needsAttention: number;
}

interface WeeklyPulseCardsProps {
  stats: PulseStats;
}

function AnimatedCount({
  value,
  suffix = '',
  duration = 800,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return (
    <span>
      {Math.round(display)}
      {suffix}
    </span>
  );
}

const CARDS = [
  {
    key: 'totalClients' as const,
    label: 'Total Clients',
    icon: Users,
    color: '#D4A853',
    suffix: '',
  },
  {
    key: 'avgCompliance' as const,
    label: 'Avg Compliance',
    icon: TrendingUp,
    color: '#4ade80',
    suffix: '%',
  },
  {
    key: 'mealsThisWeek' as const,
    label: 'Meals Logged',
    icon: UtensilsCrossed,
    color: '#60a5fa',
    suffix: '',
  },
  {
    key: 'needsAttention' as const,
    label: 'Need Attention',
    icon: AlertTriangle,
    color: '#f87171',
    suffix: '',
  },
];

export default memo(function WeeklyPulseCards({ stats }: WeeklyPulseCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CARDS.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 flex flex-col items-center gap-2"
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${card.color}15` }}
            >
              <Icon size={18} style={{ color: card.color }} />
            </div>
            <span className="text-stone-200 text-xl font-bold tabular-nums">
              <AnimatedCount value={stats[card.key]} suffix={card.suffix} />
            </span>
            <span className="text-stone-500 text-[10px] uppercase tracking-wider font-medium">
              {card.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
});
