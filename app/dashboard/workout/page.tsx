'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dumbbell, Plus, Minus, Clock, Trophy, Search, X, AlertTriangle,
  ChevronDown, ChevronUp, History, Play, Square, Camera
} from 'lucide-react';
import { BotNav } from '@/components/ui/BotNav';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useClientNav } from '@/lib/useClientNav';
import type { Exercise, PainFlag, MuscleGroup, WorkoutSession } from '@/lib/types';
import Link from 'next/link';
import { localToday } from '../../../lib/dates';

// ─── Muscle group labels & colors ───
const MUSCLE_GROUPS: { key: MuscleGroup; label: string; color: string }[] = [
  { key: 'chest', label: 'Chest', color: '#ef4444' },
  { key: 'back', label: 'Back', color: '#3b82f6' },
  { key: 'shoulders', label: 'Shoulders', color: '#f59e0b' },
  { key: 'biceps', label: 'Biceps', color: '#10b981' },
  { key: 'triceps', label: 'Triceps', color: '#8b5cf6' },
  { key: 'forearms', label: 'Forearms', color: '#ec4899' },
  { key: 'quads', label: 'Quads', color: '#06b6d4' },
  { key: 'hamstrings', label: 'Hamstrings', color: '#f97316' },
  { key: 'glutes', label: 'Glutes', color: '#14b8a6' },
  { key: 'calves', label: 'Calves', color: '#a855f7' },
  { key: 'core', label: 'Core', color: '#eab308' },
  { key: 'full_body', label: 'Full Body', color: '#D4A853' },
  { key: 'cardio', label: 'Cardio', color: '#ef4444' },
];

// ─── Local set type for editing ───
interface LocalSet {
  id: string;
  set_number: number;
  weight_kg: string;
  reps: string;
  rpe: string;
  is_warmup: boolean;
  is_pr: boolean;
}

interface ActiveExercise {
  exercise: Exercise;
  sets: LocalSet[];
  collapsed: boolean;
}

// ─── Pain Flag Modal ───
function PainFlagModal({
  exerciseId,
  onSave,
  onClose,
}: {
  exerciseId: string;
  onSave: (flag: PainFlag) => void;
  onClose: () => void;
}) {
  const [bodyPart, setBodyPart] = useState('');
  const [severity, setSeverity] = useState(1);
  const [notes, setNotes] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-elevated p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-red-400" />
          <h3 className="text-lg font-semibold">Pain Flag</h3>
        </div>

        <input
          type="text"
          placeholder="Body part (e.g. left shoulder)"
          value={bodyPart}
          onChange={(e) => setBodyPart(e.target.value)}
          className="input-dark mb-3"
        />

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">
            Severity: {severity}/5
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: severity >= s
                    ? `rgba(239, 68, 68, ${0.2 + s * 0.15})`
                    : 'rgba(255,255,255,0.05)',
                  color: severity >= s ? '#fca5a5' : '#78716c',
                  border: severity >= s
                    ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-dark mb-4 h-16 resize-none"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!bodyPart.trim()) return;
              onSave({
                exercise_id: exerciseId,
                body_part: bodyPart.trim(),
                severity,
                notes: notes.trim() || undefined,
              });
              onClose();
            }}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: 'rgba(239,68,68,0.2)',
              color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            Save Flag
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Custom Exercise Modal ───
function CustomExerciseModal({
  onSave,
  onClose,
}: {
  onSave: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('dumbbell');
  const [isCompound, setIsCompound] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment,
        is_compound: isCompound,
        is_template: false,
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (data && !error) {
      onSave(data as Exercise);
      onClose();
    } else {
      console.error('Error creating exercise:', error);
    }
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-elevated p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Dumbbell size={20} className="gold-text" />
          <h3 className="text-lg font-semibold">Custom Exercise</h3>
        </div>

        <input
          type="text"
          placeholder="Exercise name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-dark mb-3"
          autoFocus
        />

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">Muscle group</label>
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
            className="input-dark w-full"
          >
            {MUSCLE_GROUPS.map((mg) => (
              <option key={mg.key} value={mg.key}>{mg.label}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">Equipment</label>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="input-dark w-full"
          >
            {['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'kettlebell'].map((eq) => (
              <option key={eq} value={eq}>{eq.charAt(0).toUpperCase() + eq.slice(1)}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={isCompound}
            onChange={(e) => setIsCompound(e.target.checked)}
            className="rounded border-stone-600"
          />
          <span className="text-sm text-stone-400">Compound movement</span>
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-gold flex-1 text-sm py-2 font-semibold"
          >
            {saving ? 'Saving...' : 'Create'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Exercise Picker Modal ───
function ExercisePicker({
  exercises,
  onSelect,
  onClose,
  lang,
  onCustomCreated,
}: {
  exercises: Exercise[];
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  lang: string;
  onCustomCreated?: (ex: Exercise) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | 'all'>('all');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = exercises.filter((ex) => {
    const name = lang === 'es' && ex.name_es ? ex.name_es : lang === 'el' && ex.name_el ? ex.name_el : ex.name;
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchesMuscle = filterMuscle === 'all' || ex.muscle_group === filterMuscle;
    return matchesSearch && matchesMuscle;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(10,10,10,0.95)' }}
    >
      <div className="p-4 flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X size={20} />
        </button>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('workout.search_exercises')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-dark pl-10"
          />
        </div>
      </div>

      {/* Muscle group filter chips */}
      <div className="px-4 pb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMuscle('all')}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: filterMuscle === 'all' ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.05)',
              color: filterMuscle === 'all' ? '#D4A853' : '#a8a29e',
              border: filterMuscle === 'all' ? '1px solid rgba(212,168,83,0.3)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {t('workout.all')}
          </button>
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg.key}
              onClick={() => setFilterMuscle(mg.key)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: filterMuscle === mg.key ? `${mg.color}22` : 'rgba(255,255,255,0.05)',
                color: filterMuscle === mg.key ? mg.color : '#a8a29e',
                border: filterMuscle === mg.key ? `1px solid ${mg.color}55` : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {mg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Custom Exercise button */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowCustomModal(true)}
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          style={{ border: '1px dashed rgba(212,168,83,0.3)', background: 'rgba(212,168,83,0.05)', color: '#D4A853' }}
        >
          <Plus size={16} />
          Add Custom Exercise
        </button>
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {filtered.length === 0 && (
          <p className="text-stone-500 text-center py-8 text-sm">No exercises found</p>
        )}
        {filtered.map((ex) => {
          const mg = MUSCLE_GROUPS.find((m) => m.key === ex.muscle_group);
          const name = lang === 'es' && ex.name_es ? ex.name_es : lang === 'el' && ex.name_el ? ex.name_el : ex.name;
          return (
            <motion.button
              key={ex.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onSelect(ex);
                onClose();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl mb-1 text-left transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <div
                className="w-2 h-8 rounded-full shrink-0"
                style={{ background: mg?.color || '#666' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-200 truncate">{name}</p>
                <p className="text-xs text-stone-500">
                  {mg?.label || ex.muscle_group}
                  {ex.equipment && ` · ${ex.equipment}`}
                  {ex.is_compound && ' · Compound'}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Custom exercise modal */}
      <AnimatePresence>
        {showCustomModal && (
          <CustomExerciseModal
            onSave={(ex) => {
              if (onCustomCreated) onCustomCreated(ex);
              onSelect(ex);
            }}
            onClose={() => setShowCustomModal(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Elapsed Timer ───
function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="tabular-nums">
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

// ═══════════════════════════════════════════════
// Main Workout Page
// ═══════════════════════════════════════════════
export default function WorkoutPage() {
  const clientNav = useClientNav();
  const router = useRouter();
  const { t, lang } = useI18n();

  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [startTime, setStartTime] = useState<number>(0);

  // Exercise state
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeExercises, setActiveExercises] = useState<ActiveExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [painModalExerciseId, setPainModalExerciseId] = useState<string | null>(null);
  const [prRecords, setPrRecords] = useState<Record<string, number>>({});

  // Cardio quick-log state
  const [showCardio, setShowCardio] = useState(false);
  const [cardioType, setCardioType] = useState<'walk' | 'run' | 'cycle' | 'hiit' | 'swim' | 'other'>('run');
  const [cardioDuration, setCardioDuration] = useState(30);
  const [cardioDistance, setCardioDistance] = useState('');
  const [savingCardio, setSavingCardio] = useState(false);
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load exercises & user
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [exercisesRes, sessionsRes] = await Promise.all([
        supabase.from('exercises').select('*').order('muscle_group').order('name'),
        supabase.from('workout_sessions').select('*')
          .eq('user_id', user.id)
          .order('session_date', { ascending: false })
          .limit(5),
      ]);
      if (exercisesRes.data) setExercises(exercisesRes.data);
      if (sessionsRes.data) setRecentSessions(sessionsRes.data);
    }
    init();
  }, [router]);

  // Load PR records for user
  const loadPRs = useCallback(async (exerciseIds: string[]) => {
    if (!userId || exerciseIds.length === 0) return;
    const { data } = await supabase
      .from('workout_sets')
      .select('exercise_id, weight_kg, session_id, workout_sessions!inner(user_id)')
      .in('exercise_id', exerciseIds)
      .eq('workout_sessions.user_id', userId)
      .eq('is_warmup', false)
      .not('weight_kg', 'is', null);

    if (data) {
      const maxWeights: Record<string, number> = {};
      data.forEach((s: { exercise_id: string; weight_kg: number | null }) => {
        if (s.weight_kg !== null) {
          maxWeights[s.exercise_id] = Math.max(maxWeights[s.exercise_id] || 0, s.weight_kg);
        }
      });
      setPrRecords((prev) => ({ ...prev, ...maxWeights }));
    }
  }, [userId]);

  // ─── Start workout ───
  const startWorkout = async () => {
    if (!userId) return;
    const today = localToday();
    const defaultName = `Workout — ${today}`;
    setSessionName(defaultName);

    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: userId,
        session_date: today,
        name: defaultName,
        pain_flags: [],
      })
      .select()
      .maybeSingle();

    if (data && !error) {
      setSessionId(data.id);
      setSessionActive(true);
      setStartTime(Date.now());
      setActiveExercises([]);
      setPainFlags([]);
    }
  };

  // ─── Add exercise to session ───
  const addExercise = (ex: Exercise) => {
    const alreadyAdded = activeExercises.some((ae) => ae.exercise.id === ex.id);
    if (alreadyAdded) return;

    setActiveExercises((prev) => [
      ...prev,
      {
        exercise: ex,
        sets: [{ id: crypto.randomUUID(), set_number: 1, weight_kg: '', reps: '', rpe: '', is_warmup: false, is_pr: false }],
        collapsed: false,
      },
    ]);
    loadPRs([ex.id]);
  };

  // ─── Set management ───
  const addSet = (exIndex: number) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      const lastSet = updated[exIndex].sets[updated[exIndex].sets.length - 1];
      updated[exIndex].sets.push({
        id: crypto.randomUUID(),
        set_number: updated[exIndex].sets.length + 1,
        weight_kg: lastSet?.weight_kg || '',
        reps: lastSet?.reps || '',
        rpe: '',
        is_warmup: false,
        is_pr: false,
      });
      return updated;
    });
  };

  const removeSet = (exIndex: number, setIndex: number) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      if (updated[exIndex].sets.length <= 1) return prev;
      updated[exIndex].sets.splice(setIndex, 1);
      updated[exIndex].sets.forEach((s, i) => (s.set_number = i + 1));
      return updated;
    });
  };

  const updateSet = (exIndex: number, setIndex: number, field: keyof LocalSet, value: string | boolean) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      const set = { ...updated[exIndex].sets[setIndex], [field]: value };

      // Auto-detect PR
      if (field === 'weight_kg' && typeof value === 'string' && !set.is_warmup) {
        const w = parseFloat(value);
        const prevMax = prRecords[updated[exIndex].exercise.id] || 0;
        set.is_pr = !isNaN(w) && w > 0 && w > prevMax;
      }

      updated[exIndex] = { ...updated[exIndex], sets: [...updated[exIndex].sets] };
      updated[exIndex].sets[setIndex] = set;
      return updated;
    });
  };

  const toggleCollapse = (exIndex: number) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      updated[exIndex] = { ...updated[exIndex], collapsed: !updated[exIndex].collapsed };
      return updated;
    });
  };

  const removeExercise = (exIndex: number) => {
    setActiveExercises((prev) => prev.filter((_, i) => i !== exIndex));
  };

  // ─── Finish workout ───
  const finishWorkout = async () => {
    if (!sessionId || saving) return;
    setSaving(true);

    try {
      const durationMinutes = Math.round((Date.now() - startTime) / 60000);

      // Save all sets
      const allSets = activeExercises.flatMap((ae) =>
        ae.sets.map((s) => ({
          session_id: sessionId,
          exercise_id: ae.exercise.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg ? parseFloat(s.weight_kg) : null,
          reps: s.reps ? parseInt(s.reps) : null,
          rpe: s.rpe ? parseFloat(s.rpe) : null,
          is_warmup: s.is_warmup,
          is_pr: s.is_pr,
          notes: null,
        }))
      );

      if (allSets.length > 0) {
        await supabase.from('workout_sets').insert(allSets);
      }

      // Update session
      await supabase
        .from('workout_sessions')
        .update({
          name: sessionName,
          duration_minutes: durationMinutes,
          pain_flags: painFlags,
        })
        .eq('id', sessionId);

      // Reset
      setSessionActive(false);
      setSessionId(null);
      setActiveExercises([]);
      setPainFlags([]);
    } catch (err) {
      console.error('Error finishing workout:', err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Log cardio quick session ─────────────────────────────────
  const logCardio = async () => {
    if (!userId || savingCardio) return;
    setSavingCardio(true);
    try {
      const today = localToday();
      const label = cardioType.charAt(0).toUpperCase() + cardioType.slice(1);
      const name = `${label} — ${cardioDuration}min${cardioDistance ? ` · ${cardioDistance}km` : ''}`;
      const { data } = await supabase.from('workout_sessions').insert({
        user_id: userId,
        session_date: today,
        name,
        duration_minutes: cardioDuration,
        notes: cardioDistance ? `Distance: ${cardioDistance}km` : null,
        pain_flags: [],
      }).select().maybeSingle();
      if (data) {
        setRecentSessions(prev => [data, ...prev.slice(0, 4)]);
        setShowCardio(false);
        setCardioDistance('');
        setCardioDuration(30);
      }
    } catch (err) {
      console.error('Cardio log error:', err);
    } finally {
      setSavingCardio(false);
    }
  };

  const getExerciseName = (ex: Exercise) => {
    if (lang === 'es' && ex.name_es) return ex.name_es;
    if (lang === 'el' && ex.name_el) return ex.name_el;
    return ex.name;
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg,#0a0a0a)' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 glass-elevated px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell size={22} className="gold-text" />
            <h1 className="text-lg font-bold">{t('workout.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {sessionActive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Clock size={12} />
                <ElapsedTimer startTime={startTime} />
              </div>
            )}
            <Link href="/dashboard/workout/history">
              <button className="p-2 rounded-xl transition-colors" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <History size={18} className="text-stone-400" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Not in session — Rich landing state */}
        {!sessionActive && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* ── Primary CTA pair ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Strength */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={startWorkout}
                className="card"
                style={{ padding: '20px 12px', textAlign: 'center', cursor: 'pointer' }}
              >
                <Dumbbell size={28} className="gold-text mx-auto" />
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--t1)', letterSpacing: '-.01em' }}>Strength</div>
                <div className="ds-sub" style={{ fontSize: 9, marginTop: 3 }}>Weights + sets</div>
              </motion.button>

              {/* Cardio */}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowCardio(v => !v)}
                className="card"
                style={{
                  padding: '20px 12px', textAlign: 'center', cursor: 'pointer',
                  border: showCardio ? '1px solid rgba(212,168,83,.4)' : undefined,
                  background: showCardio ? 'rgba(212,168,83,.07)' : undefined,
                }}
              >
                <Play size={28} className="gold-text mx-auto" />
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--t1)', letterSpacing: '-.01em' }}>Cardio</div>
                <div className="ds-sub" style={{ fontSize: 9, marginTop: 3 }}>Run · Cycle · HIIT</div>
              </motion.button>
            </div>

            {/* ── Cardio quick-log panel (expandable) ── */}
            <AnimatePresence>
              {showCardio && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="glass p-4 rounded-2xl space-y-4">
                    {/* Type chips */}
                    <div>
                      <p className="ds-sub mb-2" style={{ fontSize: 10 }}>Activity type</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['walk', 'run', 'cycle', 'hiit', 'swim', 'other'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => setCardioType(type)}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              cursor: 'pointer', transition: 'all .15s',
                              background: cardioType === type ? 'rgba(212,168,83,.2)' : 'rgba(255,255,255,.04)',
                              border: cardioType === type ? '1px solid rgba(212,168,83,.5)' : '1px solid rgba(255,255,255,.06)',
                              color: cardioType === type ? '#D4A853' : 'var(--t3)',
                            }}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration stepper */}
                    <div>
                      <p className="ds-sub mb-2" style={{ fontSize: 10 }}>Duration</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          onClick={() => setCardioDuration(v => Math.max(5, v - 5))}
                          style={{
                            width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)',
                            background: 'rgba(255,255,255,.04)', fontSize: 18, color: 'var(--t2)', cursor: 'pointer',
                          }}
                        >
                          <Minus size={16} className="mx-auto" />
                        </button>
                        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--font-mono)', minWidth: 60, textAlign: 'center' }}>
                          {cardioDuration}<span style={{ fontSize: 13, color: 'var(--t4)', fontWeight: 400 }}>min</span>
                        </span>
                        <button
                          onClick={() => setCardioDuration(v => v + 5)}
                          style={{
                            width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)',
                            background: 'rgba(255,255,255,.04)', fontSize: 18, color: 'var(--t2)', cursor: 'pointer',
                          }}
                        >
                          <Plus size={16} className="mx-auto" />
                        </button>
                        {/* Quick picks */}
                        <div style={{ display: 'flex', gap: 5, marginLeft: 4 }}>
                          {[20, 30, 45, 60].map(m => (
                            <button
                              key={m}
                              onClick={() => setCardioDuration(m)}
                              style={{
                                padding: '4px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                                cursor: 'pointer',
                                background: cardioDuration === m ? 'rgba(212,168,83,.2)' : 'rgba(255,255,255,.04)',
                                border: cardioDuration === m ? '1px solid rgba(212,168,83,.4)' : '1px solid rgba(255,255,255,.06)',
                                color: cardioDuration === m ? '#D4A853' : 'var(--t4)',
                              }}
                            >{m}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Distance (optional) */}
                    {(cardioType === 'run' || cardioType === 'walk' || cardioType === 'cycle') && (
                      <div>
                        <p className="ds-sub mb-2" style={{ fontSize: 10 }}>Distance (optional)</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={cardioDistance}
                            onChange={e => setCardioDistance(e.target.value)}
                            placeholder="0.0"
                            style={{
                              width: 80, padding: '8px 10px', borderRadius: 10, textAlign: 'center',
                              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                              color: 'var(--t1)', fontSize: 15, fontFamily: 'var(--font-mono)', outline: 'none',
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--t4)' }}>km</span>
                        </div>
                      </div>
                    )}

                    <button
                      className="btn-gold w-full py-3"
                      onClick={logCardio}
                      disabled={savingCardio}
                    >
                      <Play size={14} className="inline mr-2" />
                      {savingCardio ? 'Saving...' : `Log ${cardioType.charAt(0).toUpperCase() + cardioType.slice(1)} Session`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── AI Form Check ── */}
            <Link href="/dashboard/workout/form-check">
              <button className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4A853' }}>
                <Camera size={16} />
                AI Form Check
              </button>
            </Link>

            {/* ── Recent sessions ── */}
            {recentSessions.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Recent</span>
                  <Link href="/dashboard/workout/history">
                    <span style={{ fontSize: 10, color: 'var(--gold-300,#D4A853)', cursor: 'pointer' }}>See all</span>
                  </Link>
                </div>
                <div className="space-y-2">
                  {recentSessions.slice(0, 4).map(session => {
                    const d = new Date(session.session_date + 'T00:00:00');
                    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <motion.div
                        key={session.id}
                        whileTap={{ scale: 0.98 }}
                        className="card"
                        style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          background: 'rgba(212,168,83,.1)', border: '1px solid rgba(212,168,83,.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Dumbbell size={14} className="gold-text" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {session.name ?? 'Workout'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>{label}</div>
                        </div>
                        {session.duration_minutes && (
                          <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            <Clock size={9} className="inline mr-1" />
                            {session.duration_minutes}m
                          </span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {recentSessions.length === 0 && (
              <div className="glass p-5 text-center">
                <Trophy size={20} className="text-stone-600 mx-auto mb-2" />
                <p className="text-sm text-stone-400 font-medium">No workouts yet</p>
                <p className="text-xs text-stone-600 mt-1">Log your first session above to start tracking PRs</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Active session */}
        {sessionActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Session name */}
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="input-dark text-center font-semibold"
              placeholder={t('workout.session_name')}
            />

            {/* Exercises */}
            <AnimatePresence mode="popLayout">
              {activeExercises.map((ae, exIndex) => {
                const mg = MUSCLE_GROUPS.find((m) => m.key === ae.exercise.muscle_group);
                return (
                  <motion.div
                    key={ae.exercise.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass overflow-hidden"
                  >
                    {/* Exercise header */}
                    <button
                      onClick={() => toggleCollapse(exIndex)}
                      className="w-full flex items-center gap-3 p-3"
                    >
                      <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: mg?.color || '#666' }} />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-stone-200 truncate">
                          {getExerciseName(ae.exercise)}
                        </p>
                        <p className="text-xs text-stone-500">
                          {ae.sets.length} {ae.sets.length === 1 ? 'set' : 'sets'}
                          {ae.sets.some((s) => s.is_pr) && (
                            <span className="ml-1 text-yellow-400">
                              <Trophy size={10} className="inline" /> PR!
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPainModalExerciseId(ae.exercise.id); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(239,68,68,0.1)' }}
                        >
                          <AlertTriangle size={14} className="text-red-400" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeExercise(exIndex); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)' }}
                        >
                          <X size={14} className="text-stone-500" />
                        </button>
                        {ae.collapsed ? <ChevronDown size={16} className="text-stone-500" /> : <ChevronUp size={16} className="text-stone-500" />}
                      </div>
                    </button>

                    {/* Sets */}
                    <AnimatePresence>
                      {!ae.collapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {/* Column headers */}
                          <div className="flex items-center gap-1 px-3 pb-1 text-[10px] text-stone-600 uppercase tracking-wider">
                            <div className="w-8 text-center">#</div>
                            <div className="flex-1 text-center">kg</div>
                            <div className="flex-1 text-center">reps</div>
                            <div className="w-12 text-center">rpe</div>
                            <div className="w-8 text-center">W</div>
                            <div className="w-6" />
                          </div>

                          {/* Set rows */}
                          {ae.sets.map((set, setIndex) => (
                            <div key={set.id} className="flex items-center gap-1 px-3 py-1">
                              <div className="w-8 text-center text-xs text-stone-500 font-medium">
                                {set.set_number}
                              </div>

                              <input
                                type="number"
                                inputMode="decimal"
                                value={set.weight_kg}
                                onChange={(e) => updateSet(exIndex, setIndex, 'weight_kg', e.target.value)}
                                placeholder="0"
                                className="flex-1 text-center text-sm py-1.5 rounded-lg outline-none transition-colors"
                                style={{
                                  background: set.is_pr ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.04)',
                                  border: set.is_pr ? '1px solid rgba(212,168,83,0.3)' : '1px solid transparent',
                                  color: set.is_pr ? '#D4A853' : '#f5f5f4',
                                }}
                              />

                              <input
                                type="number"
                                inputMode="numeric"
                                value={set.reps}
                                onChange={(e) => updateSet(exIndex, setIndex, 'reps', e.target.value)}
                                placeholder="0"
                                className="flex-1 text-center text-sm py-1.5 rounded-lg outline-none"
                                style={{ background: 'rgba(255,255,255,0.04)', color: '#f5f5f4' }}
                              />

                              <input
                                type="number"
                                inputMode="decimal"
                                value={set.rpe}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || (parseFloat(v) >= 1 && parseFloat(v) <= 10)) {
                                    updateSet(exIndex, setIndex, 'rpe', v);
                                  }
                                }}
                                placeholder="-"
                                className="w-12 text-center text-sm py-1.5 rounded-lg outline-none"
                                style={{ background: 'rgba(255,255,255,0.04)', color: '#a8a29e' }}
                              />

                              <button
                                onClick={() => updateSet(exIndex, setIndex, 'is_warmup', !set.is_warmup)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-bold transition-colors"
                                style={{
                                  background: set.is_warmup ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                                  color: set.is_warmup ? '#fbbf24' : '#78716c',
                                }}
                              >
                                W
                              </button>

                              <button
                                onClick={() => removeSet(exIndex, setIndex)}
                                className="w-6 flex items-center justify-center"
                              >
                                <Minus size={12} className="text-stone-600" />
                              </button>

                              {set.is_pr && (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute right-2 text-sm"
                                >
                                  <Trophy size={14} className="text-yellow-400" />
                                </motion.span>
                              )}
                            </div>
                          ))}

                          {/* Add set button */}
                          <div className="px-3 py-2">
                            <button
                              onClick={() => addSet(exIndex)}
                              className="w-full py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                              style={{ background: 'rgba(255,255,255,0.04)', color: '#a8a29e' }}
                            >
                              <Plus size={12} />
                              {t('workout.add_set')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Add exercise button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowPicker(true)}
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold gold-text transition-colors"
              style={{ border: '1px dashed rgba(212,168,83,0.3)', background: 'rgba(212,168,83,0.05)' }}
            >
              <Plus size={18} />
              {t('workout.add_exercise')}
            </motion.button>

            {/* Pain flags summary */}
            {painFlags.length > 0 && (
              <div className="glass p-3">
                <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> {painFlags.length} pain flag{painFlags.length > 1 ? 's' : ''} recorded
                </p>
                {painFlags.map((pf, i) => (
                  <p key={i} className="text-xs text-stone-500">
                    {pf.body_part} — severity {pf.severity}/5
                  </p>
                ))}
              </div>
            )}

            {/* Finish button */}
            {activeExercises.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={finishWorkout}
                disabled={saving}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-base font-bold transition-all"
                style={{
                  background: saving ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.15)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <Square size={18} />
                {saving ? 'Saving...' : t('workout.finish')}
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* Exercise picker modal */}
      <AnimatePresence>
        {showPicker && (
          <ExercisePicker
            exercises={exercises}
            onSelect={addExercise}
            onClose={() => setShowPicker(false)}
            lang={lang}
            onCustomCreated={(ex) => setExercises((prev) => [...prev, ex])}
          />
        )}
      </AnimatePresence>

      {/* Pain flag modal */}
      <AnimatePresence>
        {painModalExerciseId && (
          <PainFlagModal
            exerciseId={painModalExerciseId}
            onSave={(flag) => setPainFlags((prev) => [...prev, flag])}
            onClose={() => setPainModalExerciseId(null)}
          />
        )}
      </AnimatePresence>

      <BotNav routes={clientNav} />
    </div>
  );
}
