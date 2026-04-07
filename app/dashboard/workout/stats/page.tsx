'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Trophy,
  TrendingUp,
  ArrowLeft,
  Clock,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/BottomNav';
import ExerciseComparison from '@/components/ExerciseComparison';
import type { WorkoutSet, WorkoutSession, Exercise, MuscleGroup } from '@/lib/types';

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const muscleColors: Record<string, string> = {
  chest: '#EF4444',
  back: '#3B82F6',
  shoulders: '#F59E0B',
  biceps: '#A855F7',
  triceps: '#A855F7',
  forearms: '#A855F7',
  quads: '#22C55E',
  hamstrings: '#22C55E',
  glutes: '#22C55E',
  calves: '#22C55E',
  core: '#78716C',
  full_body: '#D4A853',
  cardio: '#EC4899',
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

function getWeekStart(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
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
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<(WorkoutSet & { exercise: Exercise; session: WorkoutSession })[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
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
        .gte('session_date', eightWeeksAgo.toISOString().slice(0, 10))
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
  }

  // ── Computed Data ──

  const thisWeekStart = useMemo(() => getWeekStart(new Date()), []);

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
        const ws = getWeekStart(new Date(s.session.session_date));
        weekMap[ws] = (weekMap[ws] || 0) + 1;
      }
    });

    const weeks: WeeklyVolume[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const ws = getWeekStart(d);
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
        <div className="text-center py-8 text-stone-600 text-sm">
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
          const color = muscleColors[item.muscle] || '#78716C';

          return (
            <g key={item.muscle}>
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2 + 4}
                textAnchor="end"
                fill="#A8A29E"
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
                fill="#D6D3D1"
                fontSize="11"
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
        <div className="text-center py-8 text-stone-600 text-sm">
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
              stroke="#44403C"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#goldGradient)" opacity={0.15} />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#D4A853" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#D4A853" />
        ))}

        {/* X labels */}
        {points.filter((_, i) => i % 2 === 0 || i === points.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={height - 4} textAnchor="middle" fill="#78716C" fontSize="9">
            {p.label}
          </text>
        ))}

        {/* Y label */}
        <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fill="#78716C" fontSize="9">
          {maxWeeklySets}
        </text>
        <text x={padding.left - 8} y={padding.top + chartH + 4} textAnchor="end" fill="#78716C" fontSize="9">
          0
        </text>

        <defs>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A853" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#D4A853" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl hover:bg-white/5 text-stone-400 hover:text-stone-200 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-stone-100">Workout Analytics</h1>
              <p className="text-stone-500 text-sm">Performance overview</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass p-6 animate-pulse">
                  <div className="h-4 bg-stone-800 rounded w-1/3 mb-4" />
                  <div className="h-24 bg-stone-800/50 rounded" />
                </div>
              ))}
            </div>
          ) : sets.length === 0 ? (
            <div className="text-center py-20">
              <Activity size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500 mb-2">No workout data yet</p>
              <Link href="/dashboard" className="text-[#D4A853] text-sm hover:underline">
                Log your first workout
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ── Weekly Volume by Muscle Group ── */}
              <motion.div
                className="glass p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 size={16} className="text-[#D4A853]" />
                  <h2 className="text-sm font-semibold text-stone-200">Weekly Volume by Muscle</h2>
                </div>
                {renderVolumeBars()}
              </motion.div>

              {/* ── Muscle Frequency ── */}
              <motion.div
                className="glass p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-[#D4A853]" />
                  <h2 className="text-sm font-semibold text-stone-200">Muscle Frequency</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {muscleFrequency.map((mf) => {
                    let statusColor = 'text-red-400';
                    let statusIcon = '\u26A0\uFE0F';
                    if (mf.lastTrained === null) {
                      statusColor = 'text-stone-600';
                      statusIcon = '\u2014';
                    } else if (mf.daysSince <= 3) {
                      statusColor = 'text-green-400';
                      statusIcon = '\u2705';
                    } else if (mf.daysSince <= 6) {
                      statusColor = 'text-yellow-400';
                      statusIcon = '\u23F3';
                    }

                    return (
                      <div
                        key={mf.muscle}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]"
                      >
                        <span className="text-xs font-medium text-stone-300">
                          {muscleLabels[mf.muscle] || mf.muscle}
                        </span>
                        <span className={`text-xs ${statusColor}`}>
                          {mf.lastTrained
                            ? `${formatRelativeDate(mf.lastTrained)} ${statusIcon}`
                            : `Never ${statusIcon}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* ── Personal Records ── */}
              <motion.div
                className="glass p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Trophy size={16} className="text-[#D4A853]" />
                  <h2 className="text-sm font-semibold text-stone-200">Personal Records</h2>
                </div>
                {personalRecords.length === 0 ? (
                  <p className="text-stone-600 text-sm text-center py-4">No PRs recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {personalRecords.map((pr, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]"
                      >
                        <span className="text-lg shrink-0">{'\uD83C\uDFC6'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-stone-200 truncate">
                            {pr.exercise_name}
                          </div>
                          <div className="text-xs text-stone-500">
                            {pr.weight_kg}kg {pr.reps ? `x ${pr.reps}` : ''} &middot; {pr.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* ── Weekly Volume Trend ── */}
              <motion.div
                className="glass p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-[#D4A853]" />
                  <h2 className="text-sm font-semibold text-stone-200">Weekly Volume Trend</h2>
                  <span className="text-[10px] text-stone-600 ml-auto">Last 8 weeks</span>
                </div>
                {renderWeeklyTrendLine()}
              </motion.div>

              {/* ── Exercise Comparison ── */}
              <motion.div
                className="glass p-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-[#D4A853]" />
                  <h2 className="text-sm font-semibold text-stone-200">Exercise Comparison</h2>
                </div>

                <select
                  value={selectedExerciseId || ''}
                  onChange={(e) => setSelectedExerciseId(e.target.value || null)}
                  className="input-dark text-sm mb-4"
                >
                  <option value="" className="bg-stone-900">Select an exercise...</option>
                  {uniqueExercises.map((ex) => (
                    <option key={ex.id} value={ex.id} className="bg-stone-900">
                      {ex.name}
                    </option>
                  ))}
                </select>

                {selectedExerciseId && userId && (
                  <ExerciseComparison exerciseId={selectedExerciseId} userId={userId} />
                )}
              </motion.div>

              {/* ── Quick Links ── */}
              <div className="flex gap-3">
                <Link
                  href="/dashboard"
                  className="flex-1 glass p-4 text-center text-sm text-stone-400 hover:text-[#D4A853] transition-colors"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
}
