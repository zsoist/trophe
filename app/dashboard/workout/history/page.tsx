'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronDown, ChevronUp, Clock, Dumbbell,
  RotateCcw, Trophy, Calendar
} from 'lucide-react';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { WorkoutSession, WorkoutSet, Exercise } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SessionWithSets extends WorkoutSession {
  sets: (WorkoutSet & { exercise: Exercise })[];
}

// ─── Volume bar chart (last 10 sessions) ───
function VolumeChart({ sessions }: { sessions: SessionWithSets[] }) {
  const last10 = sessions.slice(0, 10).reverse();
  const volumes = last10.map((s) =>
    s.sets.reduce((acc, set) => acc + (set.weight_kg || 0) * (set.reps || 0), 0)
  );
  const maxVol = Math.max(...volumes, 1);

  if (volumes.length < 2) return null;

  return (
    <div className="glass p-4 mb-4">
      <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Total Volume (last {last10.length})</p>
      <div className="flex items-end gap-1 h-20">
        {volumes.map((vol, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((vol / maxVol) * 100, 4)}%` }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className="flex-1 rounded-t-md relative group"
            style={{
              background: `linear-gradient(to top, rgba(212,168,83,0.3), rgba(212,168,83,0.6))`,
              minHeight: '3px',
            }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-stone-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {vol > 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-stone-600">
          {last10[0]?.session_date?.slice(5) || ''}
        </span>
        <span className="text-[9px] text-stone-600">
          {last10[last10.length - 1]?.session_date?.slice(5) || ''}
        </span>
      </div>
    </div>
  );
}

// ─── Session Card ───
function SessionCard({
  session,
  lang,
}: {
  session: SessionWithSets;
  lang: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const router = useRouter();

  const totalVolume = session.sets.reduce(
    (acc, set) => acc + (set.weight_kg || 0) * (set.reps || 0),
    0
  );

  const exerciseCount = new Set(session.sets.map((s) => s.exercise_id)).size;
  const prCount = session.sets.filter((s) => s.is_pr).length;

  // Group sets by exercise
  const grouped = useMemo(() => {
    const map = new Map<string, { exercise: Exercise; sets: (WorkoutSet & { exercise: Exercise })[] }>();
    session.sets.forEach((set) => {
      const key = set.exercise_id;
      if (!map.has(key)) {
        map.set(key, { exercise: set.exercise!, sets: [] });
      }
      map.get(key)!.sets.push(set);
    });
    return Array.from(map.values());
  }, [session.sets]);

  const getExerciseName = (ex: Exercise) => {
    if (lang === 'es' && ex.name_es) return ex.name_es;
    if (lang === 'el' && ex.name_el) return ex.name_el;
    return ex.name;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return t('general.today');
    if (diff === 1) return t('general.yesterday');
    return d.toLocaleDateString(lang === 'es' ? 'es' : lang === 'el' ? 'el' : 'en', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden"
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start gap-3"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(212,168,83,0.1)' }}>
          <Dumbbell size={18} className="gold-text" />
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-stone-200 truncate">
              {session.name || 'Workout'}
            </p>
            {prCount > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'rgba(212,168,83,0.15)', color: '#D4A853' }}>
                <Trophy size={9} /> {prCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(session.session_date)}
            </span>
            {session.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {session.duration_minutes}{t('workout.min')}
              </span>
            )}
            <span>{exerciseCount} {t('workout.exercises')}</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-semibold gold-text">
            {totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume}
          </p>
          <p className="text-[10px] text-stone-600">kg vol</p>
          {expanded ? <ChevronUp size={14} className="text-stone-500 mt-1" /> : <ChevronDown size={14} className="text-stone-500 mt-1" />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {grouped.map(({ exercise, sets }) => (
                <div key={exercise.id}>
                  <p className="text-xs font-medium text-stone-400 mb-1">
                    {getExerciseName(exercise)}
                  </p>
                  <div className="space-y-0.5">
                    {sets.map((set) => (
                      <div
                        key={set.id}
                        className="flex items-center gap-2 text-xs py-0.5"
                      >
                        <span className="w-5 text-stone-600 text-right">{set.set_number}</span>
                        {set.is_warmup && (
                          <span className="text-[9px] text-amber-400 font-medium">W</span>
                        )}
                        <span className={set.is_pr ? 'text-yellow-400 font-semibold' : 'text-stone-300'}>
                          {set.weight_kg || 0}kg
                        </span>
                        <span className="text-stone-500">x</span>
                        <span className="text-stone-300">{set.reps || 0}</span>
                        {set.rpe && (
                          <span className="text-stone-600">@{set.rpe}</span>
                        )}
                        {set.is_pr && <Trophy size={10} className="text-yellow-400" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Pain flags */}
              {session.pain_flags && session.pain_flags.length > 0 && (
                <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-xs text-red-400 mb-1">Pain Flags</p>
                  {session.pain_flags.map((pf, i) => (
                    <p key={i} className="text-xs text-stone-500">
                      {pf.body_part} — severity {pf.severity}/5
                      {pf.notes && ` — ${pf.notes}`}
                    </p>
                  ))}
                </div>
              )}

              {/* Repeat button */}
              <button
                onClick={() => {
                  // Store exercises in sessionStorage for repeat
                  const exerciseIds = grouped.map((g) => g.exercise.id);
                  sessionStorage.setItem('trophe_repeat_exercises', JSON.stringify(exerciseIds));
                  router.push('/dashboard/workout');
                }}
                className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                style={{ background: 'rgba(212,168,83,0.1)', color: '#D4A853', border: '1px solid rgba(212,168,83,0.2)' }}
              >
                <RotateCcw size={12} />
                {t('workout.repeat')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// Workout History Page
// ═══════════════════════════════════════════════
export default function WorkoutHistoryPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Fetch sessions
      const { data: sessionsData } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('session_date', { ascending: false })
        .limit(50);

      if (!sessionsData || sessionsData.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch all sets for these sessions with exercise data
      const sessionIds = sessionsData.map((s: WorkoutSession) => s.id);
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select('*, exercise:exercises(*)')
        .in('session_id', sessionIds)
        .order('set_number');

      // Merge
      const merged: SessionWithSets[] = sessionsData.map((s: WorkoutSession) => ({
        ...s,
        pain_flags: (s.pain_flags as unknown as import('@/lib/types').PainFlag[]) || [],
        sets: (setsData || []).filter((set: WorkoutSet) => set.session_id === s.id),
      }));

      setSessions(merged);
      setLoading(false);
    }
    load();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 glass-elevated px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <Link href="/dashboard/workout">
            <button className="p-2 rounded-xl transition-colors" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ArrowLeft size={18} className="text-stone-400" />
            </button>
          </Link>
          <h1 className="text-lg font-bold">{t('workout.history')}</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-stone-700 border-t-[#D4A853] rounded-full animate-spin" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <Dumbbell size={48} className="text-stone-700 mx-auto mb-4" />
            <p className="text-stone-500 text-sm">{t('workout.no_sessions')}</p>
            <Link href="/dashboard/workout">
              <button className="btn-gold mt-4 text-sm px-6 py-2">
                {t('workout.start')}
              </button>
            </Link>
          </motion.div>
        )}

        {!loading && sessions.length > 0 && (
          <>
            <VolumeChart sessions={sessions} />

            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  lang={lang}
                />
              ))}
            </div>
          </>
        )}
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
