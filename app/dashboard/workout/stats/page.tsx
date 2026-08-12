'use client';

import { useCallback, useEffect, useState, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Trophy,
  TrendingUp,
  ArrowLeft,
  ChevronDown,
  Clock,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import ExerciseComparison from '@/components/progress/ExerciseComparison';
import type { WorkoutSet, WorkoutSession, Exercise, MuscleGroup } from '@/lib/types';
import { localDateStr, localWeekStart } from '@/lib/utils/dates';

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const muscleColors: Record<string, string> = {
  chest: 'var(--data-protein)',
  back: 'var(--data-carbs)',
  shoulders: 'var(--data-calories)',
  biceps: 'var(--data-fat)',
  triceps: 'var(--data-fat)',
  forearms: 'var(--data-fat)',
  quads: 'var(--data-fiber)',
  hamstrings: 'var(--data-fiber)',
  glutes: 'var(--data-fiber)',
  calves: 'var(--data-fiber)',
  core: 'var(--data-neutral)',
  full_body: 'var(--action-primary)',
  cardio: 'var(--data-sugar)',
};

const muscleLabels: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  full_body: 'Full Body',
  cardio: 'Cardio',
};

// ─── Glass accordion section (same pattern as the Progress page) ───
function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass" style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer', background: 'transparent', border: 'none',
        }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">{title}</h2>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex' }}>
          <ChevronDown size={14} className="text-[var(--content-muted)]" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function daysSince(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface PRRecord {
  exercise_name: string;
  weight_kg: number;
  reps: number | null;
  date: string;
}

interface MuscleFrequency {
  muscle: string;
  lastTrained: string | null;
  daysSince: number;
}

interface WeeklyVolume {
  weekStart: string;
  totalSets: number;
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function WorkoutStatsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<(WorkoutSet & { exercise: Exercise; session: WorkoutSession })[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      // Fetch all sessions for this user from last 8 weeks
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gte('session_date', localDateStr(eightWeeksAgo))
        .order('session_date', { ascending: false });

      if (!sessions || sessions.length === 0) {
        setLoading(false);
        return;
      }

      const sessionIds = sessions.map((s: WorkoutSession) => s.id);

      const { data: workoutSets } = await supabase
        .from('workout_sets')
        .select('*, exercise:exercises(*)')
        .in('session_id', sessionIds);

      if (workoutSets) {
        const enriched = workoutSets.map((ws: WorkoutSet & { exercise: Exercise }) => {
          const session = sessions.find((s: WorkoutSession) => s.id === ws.session_id)!;
          return { ...ws, session };
        });
        setSets(enriched);
      }
    } catch (err) {
      console.error('Error loading workout stats:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Computed Data ──

  const thisWeekStart = useMemo(() => localWeekStart(new Date()), []);

  // Weekly volume by muscle group (this week)
  const weeklyVolumeByMuscle = useMemo(() => {
    const volumeMap: Record<string, number> = {};
    sets.forEach((s) => {
      if (s.session.session_date >= thisWeekStart && !s.is_warmup) {
        const muscle = s.exercise?.muscle_group || 'full_body';
        volumeMap[muscle] = (volumeMap[muscle] || 0) + 1;
      }
    });

    return Object.entries(volumeMap)
      .map(([muscle, count]) => ({ muscle, sets: count }))
      .sort((a, b) => b.sets - a.sets);
  }, [sets, thisWeekStart]);

  const maxSets = useMemo(() => {
    return Math.max(1, ...weeklyVolumeByMuscle.map((v) => v.sets));
  }, [weeklyVolumeByMuscle]);

  // Muscle frequency (last trained)
  const muscleFrequency = useMemo((): MuscleFrequency[] => {
    const lastTrained: Record<string, string> = {};
    sets.forEach((s) => {
      const muscle = s.exercise?.muscle_group;
      if (!muscle) return;
      const date = s.session.session_date;
      if (!lastTrained[muscle] || date > lastTrained[muscle]) {
        lastTrained[muscle] = date;
      }
    });

    const allMuscles: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
    return allMuscles.map((m) => ({
      muscle: m,
      lastTrained: lastTrained[m] || null,
      daysSince: lastTrained[m] ? daysSince(lastTrained[m]) : 999,
    }));
  }, [sets]);

  // Personal Records
  const personalRecords = useMemo((): PRRecord[] => {
    return sets
      .filter((s) => s.is_pr)
      .map((s) => ({
        exercise_name: s.exercise?.name || 'Unknown',
        weight_kg: s.weight_kg || 0,
        reps: s.reps,
        date: s.session.session_date,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [sets]);

  // Weekly volume trend (last 8 weeks)
  const weeklyTrend = useMemo((): WeeklyVolume[] => {
    const weekMap: Record<string, number> = {};
    sets.forEach((s) => {
      if (!s.is_warmup) {
        const ws = localWeekStart(new Date(`${s.session.session_date}T12:00:00`));
        weekMap[ws] = (weekMap[ws] || 0) + 1;
      }
    });

    const weeks: WeeklyVolume[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const ws = localWeekStart(d);
      weeks.push({ weekStart: ws, totalSets: weekMap[ws] || 0 });
    }
    return weeks;
  }, [sets]);

  const maxWeeklySets = useMemo(() => Math.max(1, ...weeklyTrend.map((w) => w.totalSets)), [weeklyTrend]);

  // Unique exercises for the comparison picker
  const uniqueExercises = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    sets.forEach((s) => {
      if (s.exercise && !map.has(s.exercise.id)) {
        map.set(s.exercise.id, { id: s.exercise.id, name: s.exercise.name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sets]);

  // ── SVG Charts ──

  function renderVolumeBars() {
    if (weeklyVolumeByMuscle.length === 0) {
      return (
        <div className="text-center py-8 text-[var(--content-muted)] text-sm">
          No sets logged this week
        </div>
      );
    }

    const barHeight = 32;
    const gap = 8;
    const svgHeight = weeklyVolumeByMuscle.length * (barHeight + gap);
    const labelWidth = 90;
    const chartWidth = 280;

    return (
      <svg
        viewBox={`0 0 ${labelWidth + chartWidth + 50} ${svgHeight}`}
        className="w-full"
        style={{ maxHeight: svgHeight }}
      >
        {weeklyVolumeByMuscle.map((item, i) => {
          const y = i * (barHeight + gap);
          const barW = (item.sets / maxSets) * chartWidth;
          const color = muscleColors[item.muscle] || 'var(--data-neutral)';

          return (
            <g key={item.muscle}>
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fill="var(--content-muted)"
                fontSize="12"
                fontWeight="500"
              >
                {muscleLabels[item.muscle] || item.muscle}
              </text>
              <rect
                x={labelWidth}
                y={y + 4}
                width={barW}
                height={barHeight - 8}
                rx={6}
                fill={color}
                opacity={0.7}
              />
              <text
                x={labelWidth + barW + 8}
                y={y + barHeight / 2 + 4}
                fill="var(--content-secondary)"
                fontSize="12"
                fontWeight="600"
              >
                {item.sets} sets
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  function renderWeeklyTrendLine() {
    if (weeklyTrend.every((w) => w.totalSets === 0)) {
      return (
        <div className="text-center py-8 text-[var(--content-muted)] text-sm">
          No data yet
        </div>
      );
    }

    const width = 320;
    const height = 120;
    const padding = { top: 10, right: 20, bottom: 30, left: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const points = weeklyTrend.map((w, i) => ({
      x: padding.left + (i / (weeklyTrend.length - 1)) * chartW,
      y: padding.top + chartH - (w.totalSets / maxWeeklySets) * chartH,
      sets: w.totalSets,
      label: w.weekStart.slice(5),
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding.top + chartH - frac * chartH;
          return (
            <line
              key={frac}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="var(--border-default)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#goldGradient)" opacity={0.15} />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--action-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--action-primary)" />
        ))}

        {/* X labels */}
        {points.filter((_, i) => i % 2 === 0 || i === points.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={height - 4} textAnchor="middle" fill="var(--content-muted)" fontSize="12">
            {p.label}
          </text>
        ))}

        {/* Y label */}
        <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fill="var(--content-muted)" fontSize="12">
          {maxWeeklySets}
        </text>
        <text x={padding.left - 8} y={padding.top + chartH + 4} textAnchor="end" fill="var(--content-muted)" fontSize="12">
          0
        </text>

        <defs>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--action-primary)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="var(--action-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // ── Render ──

  return (
    <div className="min-h-screen px-4 py-6 pb-24 sm:px-6 lg:px-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/dashboard/workout"
              className="p-2 rounded-xl hover:bg-[var(--surface-2)] text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[var(--content-primary)]">Workout Analytics</h1>
              <p className="text-[var(--content-muted)] text-sm">Performance overview</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass p-6 animate-pulse">
                  <div className="h-4 bg-[var(--surface-2)] rounded w-1/3 mb-4" />
                  <div className="h-24 bg-[var(--surface-2)] rounded" />
                </div>
              ))}
            </div>
          ) : sets.length === 0 ? (
            <div className="text-center py-20">
              <Activity size={48} className="mx-auto text-[var(--content-muted)] mb-4" />
              <p className="text-[var(--content-muted)] mb-2">No workout data yet</p>
              <Link href="/dashboard/workout" className="accent-text text-sm hover:underline">
                Log your first workout
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ── Weekly Volume by Muscle Group (only section open by default) ── */}
              <Section
                title="Weekly Volume by Muscle"
                icon={<BarChart3 size={16} className="accent-text" />}
                defaultOpen
              >
                {renderVolumeBars()}
              </Section>

              {/* ── Muscle Frequency ── */}
              <Section title="Muscle Frequency" icon={<Clock size={16} className="accent-text" />}>
                <div className="grid grid-cols-2 gap-2">
                  {muscleFrequency.map((mf) => {
                    let statusColor = 'text-[var(--status-danger-fg)]';
                    let dotColor = 'var(--status-danger-fg)';
                    if (mf.lastTrained === null) {
                      statusColor = 'text-[var(--content-muted)]';
                      dotColor = 'var(--content-muted)';
                    } else if (mf.daysSince <= 3) {
                      statusColor = 'text-[var(--status-success-fg)]';
                      dotColor = 'var(--status-success-fg)';
                    } else if (mf.daysSince <= 6) {
                      statusColor = 'text-[var(--status-warning-fg)]';
                      dotColor = 'var(--status-warning-fg)';
                    }

                    return (
                      <div
                        key={mf.muscle}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-2)]"
                      >
                        <span className="text-xs font-medium text-[var(--content-secondary)]">
                          {muscleLabels[mf.muscle] || mf.muscle}
                        </span>
                        <span className={`text-xs flex items-center gap-1.5 ${statusColor}`}>
                          {mf.lastTrained ? formatRelativeDate(mf.lastTrained) : 'Never'}
                          <span
                            aria-hidden
                            style={{ width: 6, height: 6, borderRadius: 3, background: dotColor, display: 'inline-block', flexShrink: 0 }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* ── Personal Records ── */}
              <Section title="Personal Records" icon={<Trophy size={16} className="accent-text" />}>
                {personalRecords.length === 0 ? (
                  <p className="text-[var(--content-muted)] text-sm text-center py-4">No PRs recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {personalRecords.map((pr, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-2)]"
                      >
                        <Trophy size={16} className="shrink-0 accent-text" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--content-primary)] truncate">
                            {pr.exercise_name}
                          </div>
                          <div className="text-xs text-[var(--content-muted)]">
                            {pr.weight_kg}kg {pr.reps ? `x ${pr.reps}` : ''} &middot; {pr.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* ── Weekly Volume Trend ── */}
              <Section title="Weekly Volume Trend" icon={<TrendingUp size={16} className="accent-text" />}>
                <div className="text-xs text-[var(--content-muted)] mb-2">Last 8 weeks</div>
                {renderWeeklyTrendLine()}
              </Section>

              {/* ── Exercise Comparison ── */}
              <Section title="Exercise Comparison" icon={<Activity size={16} className="accent-text" />}>
                <select
                  value={selectedExerciseId || ''}
                  onChange={(e) => setSelectedExerciseId(e.target.value || null)}
                  className="input-dark text-sm mb-4 text-base"
                >
                  <option value="">Select an exercise...</option>
                  {uniqueExercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>

                {selectedExerciseId && userId && (
                  <ExerciseComparison exerciseId={selectedExerciseId} userId={userId} />
                )}
              </Section>

              {/* ── Quick Links ── */}
              <div className="flex gap-3">
                <Link
                  href="/dashboard/workout"
                  className="flex-1 glass p-4 text-center text-sm text-[var(--content-secondary)] hover:accent-text transition-colors"
                >
                  {t('workout.back_to_workout')}
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <BotNav routes={[
        { href: '/dashboard',          label: 'Home',     icon: <Icon name="i-home"  size={18} /> },
        { href: '/dashboard/log',      label: 'Log',      icon: <Icon name="i-book"  size={18} /> },
        { href: '/dashboard/progress', label: 'Progress', icon: <Icon name="i-chart" size={18} /> },
        { href: '/dashboard/profile',  label: 'Me',       icon: <Icon name="i-user"  size={18} /> },
      ]} />
    </div>
  );
}
