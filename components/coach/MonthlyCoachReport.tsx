'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Users, BarChart3, TrendingUp, FileText, CheckCircle2, Star, Trophy } from 'lucide-react';

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
  /** Habit check-ins (from habit_checkins — was mislabeled "Meals Tracked"). */
  checkins: number;
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
  icon: LucideIcon;
  delay: number;
  suffix?: string;
}> = [
  { key: 'clientsManaged', label: 'Clients', icon: Users, delay: 200 },
  { key: 'avgAdherence', label: 'Avg Adherence', icon: BarChart3, delay: 300, suffix: '%' },
  { key: 'habitsProgressed', label: 'Habits Progressed', icon: TrendingUp, delay: 400 },
  { key: 'notesWritten', label: 'Notes Written', icon: FileText, delay: 500 },
  { key: 'checkins', label: 'Check-ins', icon: CheckCircle2, delay: 600 },
];

export default function MonthlyCoachReport({ report }: MonthlyCoachReportProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(160deg, var(--surface-overlay) 0%, var(--status-warning-bg) 50%, var(--surface-overlay) 100%)',
        border: '1px solid var(--status-warning-bg)',
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
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--action-primary)]/60 mb-1">
            Monthly Report
          </p>
          <h3
            className="text-2xl font-black"
            style={{
              background: 'linear-gradient(135deg, var(--action-primary), var(--status-warning-fg), var(--action-primary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {report.month}
          </h3>
          <p className="text-xs text-[var(--content-muted)] mt-1">Coach Performance Summary</p>
        </motion.div>

        {/* Gold separator */}
        <motion.div
          className="h-[1px] mb-5"
          style={{ background: 'linear-gradient(90deg, transparent, var(--status-warning-border), transparent)' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {STAT_CONFIG.map((stat) => {
            const value = report[stat.key as keyof MonthlyReport] as number;
            const StatIcon = stat.icon;
            return (
              <motion.div
                key={stat.key}
                className="py-3 px-4 rounded-xl text-center"
                style={{
                  background: 'var(--border-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stat.delay / 1000 }}
              >
                <StatIcon size={18} className="mb-1.5 mx-auto block" style={{ color: 'var(--action-primary)' }} aria-hidden />
                <div className="text-xl font-bold text-[var(--content-primary)]">
                  <Counter value={value} suffix={stat.suffix ?? ''} delay={stat.delay} />
                </div>
                <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider mt-0.5">
                  {stat.label}
                </div>
              </motion.div>
            );
          })}

          {/* Top improver (special cell) */}
          <motion.div
            className="py-3 px-4 rounded-xl text-center"
            style={{
              background: 'var(--status-warning-bg)',
              border: '1px solid var(--status-warning-bg)',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Star size={18} className="mb-1.5 mx-auto block" style={{ color: 'var(--action-primary)' }} aria-hidden />
            <div className="text-sm font-bold text-[var(--action-primary)] truncate">
              {report.topImprover}
            </div>
            <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider mt-0.5">
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
            <span className="text-xs text-[var(--content-secondary)]">Average Adherence</span>
            <span className="text-xs font-semibold text-[var(--action-primary)]">{report.avgAdherence}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{
                background: report.avgAdherence >= 80
                  ? 'linear-gradient(90deg, var(--action-primary), var(--status-warning-fg))'
                  : report.avgAdherence >= 50
                  ? 'linear-gradient(90deg, var(--action-primary), var(--status-warning-border))'
                  : 'linear-gradient(90deg, var(--status-danger-fg), var(--status-danger-fg))',
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
              background: 'linear-gradient(135deg, var(--status-warning-bg) 0%, var(--status-warning-bg) 100%)',
              border: '1px solid var(--status-warning-bg)',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 200 }}
          >
            <Trophy size={18} style={{ color: 'var(--action-primary)' }} aria-hidden />
            <span
              className="text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--action-primary), var(--status-warning-fg))',
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
          className="text-center text-xs text-[var(--content-muted)] mt-4 tracking-wider"
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
