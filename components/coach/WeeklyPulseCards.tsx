'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, ClipboardCheck, AlertTriangle } from 'lucide-react';

interface PulseStats {
  totalClients: number;
  avgCompliance: number;
  /** Habit check-ins this week (from habit_checkins — NOT food logs). */
  checkinsThisWeek: number;
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
    color: 'var(--action-primary)',
    suffix: '',
    explain: 'All clients currently assigned to you.',
  },
  {
    key: 'avgCompliance' as const,
    label: 'Avg Compliance',
    icon: TrendingUp,
    color: 'var(--status-success-fg)',
    suffix: '%',
    explain: 'Average habit-cycle completion across clients with an active habit (current streak ÷ cycle length).',
  },
  {
    key: 'checkinsThisWeek' as const,
    label: 'Check-ins',
    icon: ClipboardCheck,
    color: 'var(--status-info-fg)',
    suffix: '',
    explain: 'Total habit check-ins from all your clients this week.',
  },
  {
    key: 'needsAttention' as const,
    label: 'Need Attention',
    icon: AlertTriangle,
    color: 'var(--status-danger-fg)',
    suffix: '',
    explain: 'Clients flagged red or with no check-in for 3+ days.',
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
            className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col items-center gap-2"
            title={card.explain}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${card.color}15` }}
            >
              <Icon size={18} style={{ color: card.color }} />
            </div>
            <span className="text-[var(--content-primary)] text-xl font-bold tabular-nums">
              <AnimatedCount value={stats[card.key]} suffix={card.suffix} />
            </span>
            <span className="text-[var(--content-muted)] text-xs uppercase tracking-wider font-medium">
              {card.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
});
