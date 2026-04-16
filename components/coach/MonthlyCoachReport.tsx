'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Monthly Coach Report (Wave 4)
// Auto-generated monthly summary with gold accents
// ═══════════════════════════════════════════════

interface MonthlyReport {
  month: string;
  clientsManaged: number;
  avgAdherence: number;
  habitsProgressed: number;
  notesWritten: number;
  mealsTracked: number;
  topImprover: string;
}

interface MonthlyCoachReportProps {
  report: MonthlyReport;
}

function Counter({ value, suffix = '', delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 1000;
    const start = performance.now() + delay;

    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(eased * value);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, delay]);

  return <span>{Math.round(display)}{suffix}</span>;
}

const STAT_CONFIG: ReadonlyArray<{
  key: keyof MonthlyReport;
  label: string;
  icon: string;
  delay: number;
  suffix?: string;
}> = [
  { key: 'clientsManaged', label: 'Clients', icon: '👥', delay: 200 },
  { key: 'avgAdherence', label: 'Avg Adherence', icon: '📊', delay: 300, suffix: '%' },
  { key: 'habitsProgressed', label: 'Habits Progressed', icon: '📈', delay: 400 },
  { key: 'notesWritten', label: 'Notes Written', icon: '📝', delay: 500 },
  { key: 'mealsTracked', label: 'Meals Tracked', icon: '🍽️', delay: 600 },
];

export default function MonthlyCoachReport({ report }: MonthlyCoachReportProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(160deg, rgba(28,25,23,0.98) 0%, rgba(212,168,83,0.06) 50%, rgba(28,25,23,0.95) 100%)',
        border: '1px solid rgba(212,168,83,0.12)',
      }}
    >
      {/* Grain texture */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 p-6">
        {/* Header */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#D4A853]/50 mb-1">
            Monthly Report
          </p>
          <h3
            className="text-2xl font-black"
            style={{
              background: 'linear-gradient(135deg, #D4A853, #fbbf24, #D4A853)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {report.month}
          </h3>
          <p className="text-xs text-stone-500 mt-1">Coach Performance Summary</p>
        </motion.div>

        {/* Gold separator */}
        <motion.div
          className="h-[1px] mb-5"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.3), transparent)' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {STAT_CONFIG.map((stat, i) => {
            const value = report[stat.key as keyof MonthlyReport] as number;
            return (
              <motion.div
                key={stat.key}
                className="py-3 px-4 rounded-xl text-center"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stat.delay / 1000 }}
              >
                <span className="text-lg mb-1 block">{stat.icon}</span>
                <div className="text-xl font-bold text-stone-100">
                  <Counter value={value} suffix={stat.suffix ?? ''} delay={stat.delay} />
                </div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
                  {stat.label}
                </div>
              </motion.div>
            );
          })}

          {/* Top improver (special cell) */}
          <motion.div
            className="py-3 px-4 rounded-xl text-center"
            style={{
              background: 'rgba(212,168,83,0.06)',
              border: '1px solid rgba(212,168,83,0.15)',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <span className="text-lg mb-1 block">⭐</span>
            <div className="text-sm font-bold text-[#D4A853] truncate">
              {report.topImprover}
            </div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
              Top Improver
            </div>
          </motion.div>
        </div>

        {/* Adherence bar */}
        <motion.div
          className="mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-stone-400">Average Adherence</span>
            <span className="text-xs font-semibold text-[#D4A853]">{report.avgAdherence}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{
                background: report.avgAdherence >= 80
                  ? 'linear-gradient(90deg, #D4A853, #fbbf24)'
                  : report.avgAdherence >= 50
                  ? 'linear-gradient(90deg, #D4A853, #d4a85380)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${report.avgAdherence}%` }}
              transition={{ delay: 0.6, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </motion.div>

        {/* Coach of the Month badge */}
        {report.avgAdherence >= 80 && report.clientsManaged >= 3 && (
          <motion.div
            className="flex items-center justify-center gap-2 py-3 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(212,168,83,0.12) 0%, rgba(212,168,83,0.04) 100%)',
              border: '1px solid rgba(212,168,83,0.2)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 200 }}
          >
            <span className="text-lg">🏅</span>
            <span
              className="text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, #D4A853, #fbbf24)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Coach of the Month
            </span>
          </motion.div>
        )}

        {/* Branding */}
        <motion.p
          className="text-center text-[9px] text-stone-600 mt-4 tracking-wider"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          TROPHE
        </motion.p>
      </div>
    </motion.div>
  );
}
