'use client';

/**
 * Client workout landing — rebuilt around the coach-assigned program
 * (workout_programs / workout_program_days, migration 0049).
 *
 * Three entry states:
 *   A) program + template today  → "Today" hero card → GUIDED mode
 *   B) program + rest day        → rest card + "Train anyway" (freestyle)
 *   C) no program                → freestyle quick-start (legacy behavior)
 *
 * Freestyle logging shares guided mode's crash-safe persistence:
 * the session row is created lazily at the first completed set and every
 * completed set is INSERTed immediately (workout-persistence.ts).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dumbbell, Plus, Minus, Clock, Trophy, X, AlertTriangle,
  ChevronDown, ChevronUp, History, Play, Square, Camera, Timer,
  Calculator, Info, Link2, BarChart3, Check, MessageCircle,
} from 'lucide-react';
import { BotNav } from '@/components/ui/BotNav';
import { AnimatedValue } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useClientNav } from '@/lib/useClientNav';
import type { Exercise, PainFlag, WorkoutSession, TemplateExercise } from '@/lib/types';
import Link from 'next/link';
import { localToday } from '../../../lib/utils/dates';
import { trpc } from '@/lib/trpc/client';
import GuidedSession, { type GuidedExerciseInfo, type GuidedTemplate } from '@/components/workout/GuidedSession';
import { TodayProgramCard, RestDayCard, type TodayTemplateSummary } from '@/components/workout/TodayProgramCard';
import PainFlagModal from '@/components/workout/PainFlagModal';
import ExercisePicker from '@/components/workout/ExercisePicker';
import RecentSessionCard from '@/components/workout/RecentSessionCard';
import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';
import PlateCalculator from '@/components/workout/PlateCalculator';
import { muscleColor } from '@/components/workout/muscle-groups';
import { useWeightUnit, kgToDisplay, displayToKg } from '@/lib/workout/units';
import { getRestTarget, setRestTarget as persistRestTarget, REST_CHOICES } from '@/lib/workout/rest-targets';
import { supersetGroupFor, supersetLabelFor } from '@/lib/workout/supersets';
import {
  createWorkoutSession,
  deleteWorkoutSet,
  deleteWorkoutSets,
  finishWorkoutSession,
  insertWorkoutSet,
  insertWorkoutSets,
  loadLastSetsMap,
  loadPrMap,
  updateWorkoutSupersetGroups,
  type CompletedSetInput,
} from '@/components/workout/workout-persistence';

// ─── Local set type for freestyle editing ───
interface LocalSet {
  id: string;
  set_number: number;
  weight_kg: string;
  reps: string;
  rpe: string;
  is_warmup: boolean;
  is_pr: boolean;
  /** Crash-safe persistence: completed sets are already INSERTed. */
  completed: boolean;
  saving: boolean;
  dbId: string | null;
}

interface ActiveExercise {
  exercise: Exercise;
  sets: LocalSet[];
  collapsed: boolean;
  /** Sets from the most recent past session of this exercise — ghost placeholders. */
  lastSets?: { weight_kg: number | null; reps: number | null; rpe?: number | null }[];
  /** Superset pairing: linked with the NEXT exercise in the list (Hevy-style). */
  linkedBelow?: boolean;
}

function blankSet(setNumber: number, from?: LocalSet): LocalSet {
  return {
    id: crypto.randomUUID(),
    set_number: setNumber,
    weight_kg: from?.weight_kg ?? '',
    reps: from?.reps ?? '',
    rpe: '',
    is_warmup: false,
    is_pr: false,
    completed: false,
    saving: false,
    dbId: null,
  };
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

// ─── Rest timer chip — starts when a set is logged, gold pulse at target ───
function RestChip({ startedAt, targetS, onDismiss }: { startedAt: number; targetS: number; onDismiss: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [startedAt]);

  const ready = elapsed >= targetS;
  const mins = Math.floor(elapsed / 60);

  return (
    <motion.button
      initial={{ opacity: 0, y: -8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={onDismiss}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
      style={{
        background: ready ? 'color-mix(in srgb, var(--accent, #D4A853) 18%, transparent)' : 'rgba(255,255,255,0.06)',
        color: ready ? 'var(--accent, #D4A853)' : '#a8a29e',
        border: ready ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 35%, transparent)' : '1px solid rgba(255,255,255,0.08)',
        animation: ready ? 'pulse 1.6s ease-in-out infinite' : undefined,
      }}
      title="Rest since last set — tap to dismiss"
    >
      <Timer size={12} />
      <span style={{ fontFamily: 'var(--font-mono)' }}>{mins}:{String(elapsed % 60).padStart(2, '0')}</span>
      {ready && <span style={{ fontWeight: 700 }}>go</span>}
    </motion.button>
  );
}

// ═══════════════════════════════════════════════
// Main Workout Page
// ═══════════════════════════════════════════════
export default function WorkoutPage() {
  const clientNav = useClientNav();
  const router = useRouter();
  const { t, lang } = useI18n();

  // View mode
  const [mode, setMode] = useState<'landing' | 'freestyle' | 'guided'>('landing');
  const [guidedTemplate, setGuidedTemplate] = useState<GuidedTemplate | null>(null);

  // Freestyle session state (crash-safe: session row created lazily)
  const [sessionName, setSessionName] = useState('');
  const [startTime, setStartTime] = useState<number>(0);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Exercise state
  const [exercises, setExercises] = useState<Exercise[]>([]);
  // Recently-logged exercise ids (most-recent first) — powers the picker's
  // "Recent" quick-add row so re-adding a staple is one tap, not a scroll.
  const [recentExerciseIds, setRecentExerciseIds] = useState<string[]>([]);
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
  const [syncingSupersets, setSyncingSupersets] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  // 10/10 wave: display unit, per-exercise rest targets, info/plate sheets.
  const [unit, setUnit] = useWeightUnit();
  const [restTargets, setRestTargets] = useState<Record<string, number>>({});
  const [restChipTarget, setRestChipTarget] = useState(90);
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [plateCalcKg, setPlateCalcKg] = useState<number | null>(null);
  // Session-complete celebration (volume/sets/PRs/minutes) — shown over the
  // landing after finish; dismissing it is the only way it clears.
  const [finishSummary, setFinishSummary] = useState<{ volume: number; sets: number; prs: number; minutes: number } | null>(null);

  // ── Coach program (tRPC; provider mounted in app/dashboard/layout.tsx) ──
  const programQuery = trpc.workouts.program.mine.useQuery(undefined, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const programData = programQuery.data ?? null;

  const exerciseInfoMap = useMemo(() => {
    const map: Record<string, GuidedExerciseInfo> = {};
    for (const e of programData?.exercises ?? []) map[e.id] = e as GuidedExerciseInfo;
    return map;
  }, [programData]);

  // Weekday of the user's LOCAL calendar day (0=Sunday … 6=Saturday).
  const todayWeekday = new Date(localToday() + 'T12:00:00').getDay();

  const toSummary = useCallback(
    (day: NonNullable<typeof programData>['days'][number]): TodayTemplateSummary => ({
      templateId: day.template.id,
      name: day.template.name,
      dayLabel: day.template.dayLabel,
      difficulty: day.template.difficulty,
      exercises: ((day.template.exercises as TemplateExercise[] | null) ?? []).filter(
        (e) => e && typeof e.exercise_id === 'string',
      ),
    }),
    [],
  );

  const todaySummaries = useMemo(() => {
    if (!programData) return [];
    return programData.days
      .filter((d) => d.weekday === todayWeekday)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(toSummary);
  }, [programData, todayWeekday, toSummary]);

  const nextScheduled = useMemo(() => {
    if (!programData || programData.days.length === 0) return null;
    for (let i = 1; i <= 7; i++) {
      const wd = (todayWeekday + i) % 7;
      const day = programData.days
        .filter((d) => d.weekday === wd)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
      if (day) return { weekday: wd, templateName: day.template.name };
    }
    return null;
  }, [programData, todayWeekday]);

  // ── Load exercises, user & recents (+ ?repeat=<sessionId> from history) ──
  const refreshRecents = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', uid)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setRecentSessions(data);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const [exercisesRes, recentSetsRes] = await Promise.all([
        supabase.from('exercises').select('*').order('muscle_group').order('name'),
        // RLS scopes workout_sets to the caller's own sessions, so no explicit
        // user filter is needed (workout_sets has no user_id column).
        supabase
          .from('workout_sets')
          .select('exercise_id, created_at')
          .order('created_at', { ascending: false })
          .limit(120),
        refreshRecents(user.id),
      ]);
      if (exercisesRes.data) setExercises(exercisesRes.data);
      // De-dupe most-recent-first into a stable "recently used" list.
      if (recentSetsRes.data) {
        const seen = new Set<string>();
        const ids: string[] = [];
        for (const row of recentSetsRes.data as { exercise_id: string | null }[]) {
          if (row.exercise_id && !seen.has(row.exercise_id)) {
            seen.add(row.exercise_id);
            ids.push(row.exercise_id);
          }
        }
        setRecentExerciseIds(ids);
      }

      // "Repeat" deep-link from history: prefill a freestyle session.
      const repeatId = new URLSearchParams(window.location.search).get('repeat');
      if (repeatId) {
        window.history.replaceState({}, '', '/dashboard/workout');
        await startRepeat(repeatId, user.id);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Load PR records for user
  const loadPRs = useCallback(async (uid: string, exerciseIds: string[]) => {
    const map = await loadPrMap(uid, exerciseIds);
    setPrRecords((prev) => ({ ...prev, ...map }));
  }, []);

  // ─── Freestyle: start (no DB write — session is created at first set) ───
  const startFreestyle = () => {
    if (!userId) return;
    setSessionName(`Workout — ${localToday()}`);
    sessionPromiseRef.current = null;
    sessionIdRef.current = null;
    setActiveExercises([]);
    setPainFlags([]);
    setRestStartedAt(null);
    setStartTime(0); // clock starts on the first completed set, not on entry
    setMode('freestyle');
  };

  /** Repeat a past session: same exercises + that session's values as ghosts. */
  const startRepeat = async (repeatSessionId: string, uid: string) => {
    const [{ data: sessionRow }, { data: setRows }] = await Promise.all([
      supabase.from('workout_sessions').select('id, name, user_id').eq('id', repeatSessionId).maybeSingle(),
      supabase
        .from('workout_sets')
        .select('exercise_id, set_number, weight_kg, reps, rpe, is_warmup, exercise:exercises(*)')
        .eq('session_id', repeatSessionId)
        .order('set_number'),
    ]);
    if (!sessionRow || sessionRow.user_id !== uid) return;

    type RepeatRow = {
      exercise_id: string;
      set_number: number;
      weight_kg: number | null;
      reps: number | null;
      rpe: number | null;
      is_warmup: boolean;
      exercise: Exercise | null;
    };
    const rows = ((setRows as unknown as RepeatRow[]) ?? []).filter((r) => r.exercise);
    if (rows.length === 0) return;

    const byExercise = new Map<string, { exercise: Exercise; ghosts: { weight_kg: number | null; reps: number | null; rpe: number | null }[] }>();
    for (const r of rows) {
      if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, { exercise: r.exercise!, ghosts: [] });
      byExercise.get(r.exercise_id)!.ghosts.push({ weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe });
    }

    const prefilled: ActiveExercise[] = Array.from(byExercise.values()).map(({ exercise, ghosts }) => ({
      exercise,
      collapsed: false,
      lastSets: ghosts,
      sets: ghosts.map((_, i) => blankSet(i + 1)),
    }));

    setSessionName(sessionRow.name ?? `Workout — ${localToday()}`);
    sessionPromiseRef.current = null;
    sessionIdRef.current = null;
    setActiveExercises(prefilled);
    setPainFlags([]);
    setRestStartedAt(null);
    setStartTime(0); // clock starts on the first completed set, not on entry
    setMode('freestyle');
    void loadPRs(uid, Array.from(byExercise.keys()));
  };

  // Ghost values for a newly added exercise (shared batched helper).
  const loadLastSets = useCallback(async (exerciseId: string) => {
    if (!userId) return;
    const map = await loadLastSetsMap(userId, [exerciseId]);
    const lastSets = map[exerciseId];
    if (!lastSets || lastSets.length === 0) return;
    setActiveExercises((prev) => prev.map((ae) =>
      ae.exercise.id === exerciseId ? { ...ae, lastSets } : ae,
    ));
  }, [userId]);

  // ─── Add exercise to freestyle session ───
  const addExercise = (ex: Exercise) => {
    const alreadyAdded = activeExercises.some((ae) => ae.exercise.id === ex.id);
    if (alreadyAdded) return;

    setActiveExercises((prev) => [
      ...prev,
      { exercise: ex, sets: [blankSet(1)], collapsed: false },
    ]);
    setRestTargets((prev) => ({ ...prev, [ex.id]: getRestTarget(ex.id, ex.is_compound) }));
    if (userId) void loadPRs(userId, [ex.id]);
    void loadLastSets(ex.id);
  };

  /** Cycle the exercise's rest target through the standard choices (persists). */
  const cycleRestTarget = (ex: Exercise) => {
    const current = restTargets[ex.id] ?? getRestTarget(ex.id, ex.is_compound);
    const idx = REST_CHOICES.indexOf(current as (typeof REST_CHOICES)[number]);
    const next = REST_CHOICES[(idx + 1) % REST_CHOICES.length];
    persistRestTarget(ex.id, next);
    setRestTargets((prev) => ({ ...prev, [ex.id]: next }));
  };

  /** Toggle superset pairing between an exercise and the one below it. */
  const toggleSupersetLink = async (exIndex: number) => {
    if (syncingSupersets || exIndex >= activeExercises.length - 1) return;
    const previous = activeExercises;
    const updated = [...previous];
    updated[exIndex] = {
      ...updated[exIndex],
      linkedBelow: !updated[exIndex].linkedBelow,
    };
    setActiveExercises(updated);

    const persisted = updated.flatMap((exercise, index) =>
      exercise.sets.flatMap((set) =>
        set.dbId
          ? [{ id: set.dbId, superset_group: supersetGroupFor(updated, index) }]
          : [],
      ),
    );
    if (persisted.length === 0) return;

    setSyncingSupersets(true);
    try {
      const saved = await updateWorkoutSupersetGroups(persisted);
      if (saved) return;
      setActiveExercises((current) => current === updated ? previous : current);
      window.alert(t('workout.superset_save_failed'));
    } catch {
      setActiveExercises((current) => current === updated ? previous : current);
      window.alert(t('workout.superset_save_failed'));
    } finally {
      setSyncingSupersets(false);
    }
  };

  // ─── Set management ───
  const addSet = (exIndex: number) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      const lastSet = updated[exIndex].sets[updated[exIndex].sets.length - 1];
      updated[exIndex] = {
        ...updated[exIndex],
        sets: [...updated[exIndex].sets, blankSet(updated[exIndex].sets.length + 1, lastSet)],
      };
      return updated;
    });
  };

  const removeSet = async (exIndex: number, setIndex: number) => {
    const target = activeExercises[exIndex]?.sets[setIndex];
    if (!target || activeExercises[exIndex].sets.length <= 1) return;
    if (target.dbId) {
      const deleted = await deleteWorkoutSet(target.dbId);
      if (!deleted) {
        window.alert(t('workout.save_failed'));
        return;
      }
    }
    setActiveExercises((prev) => {
      const updated = [...prev];
      const sets = updated[exIndex].sets.filter((_, i) => i !== setIndex);
      sets.forEach((s, i) => (s.set_number = i + 1));
      updated[exIndex] = { ...updated[exIndex], sets };
      return updated;
    });
  };

  const updateSet = (exIndex: number, setIndex: number, field: keyof LocalSet, value: string | boolean) => {
    setActiveExercises((prev) => {
      const updated = [...prev];
      const set = { ...updated[exIndex].sets[setIndex], [field]: value };
      if (set.completed) return prev; // completed sets are locked (uncheck to edit)

      // Auto-detect PR — typed value is in the DISPLAY unit; PR baselines are kg.
      if (field === 'weight_kg' && typeof value === 'string' && !set.is_warmup) {
        const w = parseFloat(value);
        const wKg = isNaN(w) ? NaN : displayToKg(w, unit);
        const prevMax = prRecords[updated[exIndex].exercise.id] || 0;
        set.is_pr = !isNaN(wKg) && wKg > 0 && wKg > prevMax;
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

  const removeExercise = async (exIndex: number) => {
    // Persisted sets of a removed exercise are deleted too.
    const setIds = (activeExercises[exIndex]?.sets ?? [])
      .map((set) => set.dbId)
      .filter((id): id is string => Boolean(id));
    const deleted = await deleteWorkoutSets(setIds);
    if (!deleted) {
      window.alert(t('workout.save_failed'));
      return;
    }
    setActiveExercises((prev) => prev.filter((_, i) => i !== exIndex));
  };

  // ─── Crash-safe: lazy session creation ───
  const ensureSession = useCallback((): Promise<string | null> => {
    if (!userId) return Promise.resolve(null);
    if (!sessionPromiseRef.current) {
      const name = sessionName || `Workout — ${localToday()}`;
      sessionPromiseRef.current = createWorkoutSession(userId, name).then((id) => {
        sessionIdRef.current = id;
        if (!id) sessionPromiseRef.current = null; // failed create → allow retry
        return id;
      });
    }
    return sessionPromiseRef.current;
  }, [userId, sessionName]);

  const resolveSetInput = (
    ae: ActiveExercise,
    set: LocalSet,
    setIndex: number,
    supersetGroup: number | null = null,
  ): CompletedSetInput => {
    const ghost = ae.lastSets?.[setIndex];
    // Typed weight is in the DISPLAY unit → convert once to kg for storage.
    // Ghost fallbacks are already kg (straight from the DB) — no conversion.
    const typed = set.weight_kg.trim() !== '' ? parseFloat(set.weight_kg) : NaN;
    const weight = set.weight_kg.trim() !== ''
      ? (isNaN(typed) ? null : displayToKg(typed, unit))
      : ghost?.weight_kg ?? null;
    const reps = set.reps.trim() !== ''
      ? (isNaN(parseInt(set.reps, 10)) ? null : parseInt(set.reps, 10))
      : ghost?.reps ?? null;
    const rpe = set.rpe.trim() !== '' && !isNaN(parseFloat(set.rpe)) ? parseFloat(set.rpe) : null;
    const isPr = !set.is_warmup && weight !== null && weight > (prRecords[ae.exercise.id] ?? 0);
    return {
      exercise_id: ae.exercise.id,
      set_number: set.set_number,
      weight_kg: weight,
      reps,
      rpe,
      is_warmup: set.is_warmup,
      is_pr: isPr,
      superset_group: supersetGroup,
    };
  };

  /** Check-to-complete: INSERT immediately (or delete when unchecking). */
  const completeFreestyleSet = async (exIndex: number, setIndex: number) => {
    const ae = activeExercises[exIndex];
    const set = ae?.sets[setIndex];
    if (!ae || !set || set.saving) return;

    const patch = (p: Partial<LocalSet>) => {
      setActiveExercises((prev) => {
        const updated = [...prev];
        const sets = [...updated[exIndex].sets];
        sets[setIndex] = { ...sets[setIndex], ...p };
        updated[exIndex] = { ...updated[exIndex], sets };
        return updated;
      });
    };

    if (set.completed) {
      patch({ saving: true });
      const deleted = set.dbId ? await deleteWorkoutSet(set.dbId) : false;
      if (!deleted) {
        patch({ saving: false });
        window.alert(t('workout.save_failed'));
        return;
      }
      patch({ saving: false, completed: false, dbId: null, is_pr: false });
      return;
    }

    const input = resolveSetInput(ae, set, setIndex, supersetGroupFor(activeExercises, exIndex));
    patch({ saving: true });
    const sessionId = await ensureSession();
    if (!sessionId) {
      patch({ saving: false });
      window.alert(t('workout.save_failed'));
      return;
    }
    const dbId = await insertWorkoutSet(sessionId, input);
    if (!dbId) {
      patch({ saving: false });
      window.alert(t('workout.save_failed'));
      return;
    }
    // The session clock begins with the FIRST logged set — not on entry — so
    // elapsed time reflects real training, not time spent picking exercises.
    setStartTime((s) => s || Date.now());
    if (input.is_pr && input.weight_kg !== null) {
      setPrRecords((prev) => ({ ...prev, [ae.exercise.id]: input.weight_kg as number }));
    }
    patch({
      saving: false,
      completed: true,
      dbId,
      is_pr: input.is_pr,
      // Write back in the DISPLAY unit (input.weight_kg is storage kg).
      weight_kg: input.weight_kg !== null ? String(kgToDisplay(input.weight_kg, unit)) : set.weight_kg,
      reps: input.reps !== null ? String(input.reps) : set.reps,
    });
    // Haptic feedback — the tap IS the gesture, so vibrate is never blocked
    // here: a firm triple pulse for a PR, a tick for a normal completed set.
    if (typeof navigator !== 'undefined') {
      navigator.vibrate?.(input.is_pr ? [12, 40, 12] : 6);
    }
    setRestChipTarget(restTargets[ae.exercise.id] ?? getRestTarget(ae.exercise.id, ae.exercise.is_compound));
    setRestStartedAt(Date.now());
  };

  // ─── Finish freestyle workout ───
  const finishWorkout = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // startTime is 0 until the first check-completed set — a session finished
      // with only filled (never checked) rows must not divide against epoch 0.
      const durationMinutes = startTime > 0 ? Math.max(1, Math.round((Date.now() - startTime) / 60000)) : 1;

      // Rows the user filled but never check-completed still get saved.
      const pending: CompletedSetInput[] = activeExercises.flatMap((ae, aeIndex) =>
        ae.sets
          .filter((s) => !s.completed && (s.weight_kg.trim() !== '' || s.reps.trim() !== ''))
          .map((s) => {
            const input = resolveSetInput(ae, s, ae.sets.indexOf(s), supersetGroupFor(activeExercises, aeIndex));
            return input;
          }),
      );

      const hasAnything = pending.length > 0 || sessionIdRef.current !== null;
      if (!hasAnything) {
        // Nothing logged → nothing persisted (no empty-session leak).
        setMode('landing');
        setActiveExercises([]);
        setPainFlags([]);
        setRestStartedAt(null);
        return;
      }

      // Session summary — the moment the old flow never gave the user.
      // Completed rows carry live values; pending rows were just resolved.
      const summarySets = [
        // Completed rows hold DISPLAY-unit strings — convert back to kg so the
        // volume sum stays in one unit alongside pending rows (already kg).
        ...activeExercises.flatMap((ae) =>
          ae.sets.filter((s) => s.completed && !s.is_warmup).map((s) => ({
            w: displayToKg(parseFloat(s.weight_kg) || 0, unit), r: parseInt(s.reps, 10) || 0, pr: s.is_pr,
          }))),
        ...pending.filter((p) => !p.is_warmup).map((p) => ({
          w: p.weight_kg ?? 0, r: p.reps ?? 0, pr: p.is_pr,
        })),
      ];
      const summary = {
        volume: Math.round(summarySets.reduce((s, x) => s + x.w * x.r, 0)),
        sets: summarySets.length,
        prs: summarySets.filter((x) => x.pr).length,
        minutes: durationMinutes,
      };

      const sessionId = await ensureSession();
      if (!sessionId) throw new Error('Workout session could not be created');
      const inserted = await insertWorkoutSets(sessionId, pending);
      const finished = inserted && await finishWorkoutSession(sessionId, {
        name: sessionName || `Workout — ${localToday()}`,
        duration_minutes: durationMinutes,
        pain_flags: painFlags,
      });
      if (!inserted || !finished) {
        throw new Error('Workout writes could not be verified');
      }

      if (userId) await refreshRecents(userId);

      // Reset + celebrate
      setMode('landing');
      setActiveExercises([]);
      setPainFlags([]);
      setRestStartedAt(null);
      sessionPromiseRef.current = null;
      sessionIdRef.current = null;
      setFinishSummary(summary);
      if (typeof navigator !== 'undefined') navigator.vibrate?.([10, 30, 10, 30, 18]);
    } catch (err) {
      console.error('Error finishing workout:', err);
      window.alert(t('workout.save_failed'));
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

  // ─── Guided mode start / exit ───
  const startGuided = (summary: TodayTemplateSummary) => {
    if (summary.exercises.length === 0) return;
    setGuidedTemplate({
      id: summary.templateId,
      name: summary.name,
      dayLabel: summary.dayLabel,
      difficulty: summary.difficulty,
      exercises: summary.exercises,
    });
    setMode('guided');
  };

  const exitGuided = (finished: boolean) => {
    setMode('landing');
    setGuidedTemplate(null);
    if (finished && userId) void refreshRecents(userId);
  };

  // ═══ GUIDED MODE (full-screen takeover) ═══
  if (mode === 'guided' && guidedTemplate && userId) {
    return (
      <div className="min-h-screen pb-28" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <GuidedSession
          userId={userId}
          programName={programData?.program.name ?? 'Program'}
          template={guidedTemplate}
          exerciseInfo={exerciseInfoMap}
          onExit={exitGuided}
        />
        <BotNav routes={clientNav} />
      </div>
    );
  }

  const inFreestyle = mode === 'freestyle';
  const hasProgram = Boolean(programData);
  const todayHero = todaySummaries[0] ?? null;

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg,#0a0a0a)' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 glass-elevated px-4 py-3">
        <div className="max-w-md lg:max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell size={22} className="gold-text" />
            <h1 className="text-lg font-bold">{t('workout.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {inFreestyle && restStartedAt !== null && (
                <RestChip key={restStartedAt} startedAt={restStartedAt} targetS={restChipTarget} onDismiss={() => setRestStartedAt(null)} />
              )}
            </AnimatePresence>
            {/* kg/lb display toggle — storage stays kg */}
            <button
              onClick={() => setUnit(unit === 'kg' ? 'lb' : 'kg')}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,0.08)' }}
              aria-label="kg / lb"
            >
              {unit}
            </button>
            {inFreestyle && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tabular-nums"
                style={
                  startTime === 0
                    ? { background: 'rgba(255,255,255,0.05)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,0.08)' }
                    : { background: 'color-mix(in srgb, var(--accent, #D4A853) 15%, transparent)', color: 'var(--accent, #D4A853)', border: '1px solid color-mix(in srgb, var(--accent, #D4A853) 28%, transparent)' }
                }>
                <Clock size={12} />
                {startTime === 0 ? t('workout.ready') : <ElapsedTimer startTime={startTime} />}
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

      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-4">
        {/* ═══ LANDING ═══ */}
        {mode === 'landing' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* ── Hero: program-aware entry state ── */}
            {programQuery.isLoading ? (
              <div className="card" style={{ height: 150, animation: 'pulse 1.5s infinite' }} />
            ) : hasProgram && todayHero ? (
              /* State A — training day */
              <>
                <TodayProgramCard
                  programName={programData!.program.name}
                  template={todayHero}
                  alsoToday={todaySummaries.slice(1)}
                  onStart={startGuided}
                  starting={false}
                />
                {/* Secondary: freestyle + cardio */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    onClick={startFreestyle}
                    className="card"
                    style={{ padding: '11px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  >
                    <Dumbbell size={14} className="gold-text" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{t('workout.freestyle')}</span>
                  </button>
                  <button
                    onClick={() => setShowCardio(v => !v)}
                    className="card"
                    style={{
                      padding: '11px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      border: showCardio ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 40%, transparent)' : undefined,
                      background: showCardio ? 'color-mix(in srgb, var(--accent, #D4A853) 7%, transparent)' : undefined,
                    }}
                  >
                    <Play size={14} className="gold-text" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{t('workout.cardio')}</span>
                  </button>
                </div>
              </>
            ) : hasProgram ? (
              /* State B — rest day */
              <>
                <RestDayCard
                  programName={programData!.program.name}
                  nextWeekday={nextScheduled?.weekday ?? null}
                  nextTemplateName={nextScheduled?.templateName ?? null}
                  onTrainAnyway={startFreestyle}
                />
                <button
                  onClick={() => setShowCardio(v => !v)}
                  className="card w-full"
                  style={{
                    padding: '11px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    border: showCardio ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 40%, transparent)' : undefined,
                    background: showCardio ? 'color-mix(in srgb, var(--accent, #D4A853) 7%, transparent)' : undefined,
                  }}
                >
                  <Play size={14} className="gold-text" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{t('workout.log_cardio')}</span>
                </button>
              </>
            ) : (
              /* State C — no program: freestyle quick-start (legacy) */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Strength */}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={startFreestyle}
                    className="card"
                    style={{ padding: '20px 12px', textAlign: 'center', cursor: 'pointer' }}
                  >
                    <Dumbbell size={28} className="gold-text mx-auto" />
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--t1)', letterSpacing: '-.01em' }}>{t('workout.strength')}</div>
                    <div className="ds-sub" style={{ fontSize: 9, marginTop: 3 }}>{t('workout.strength_sub')}</div>
                  </motion.button>

                  {/* Cardio */}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setShowCardio(v => !v)}
                    className="card"
                    style={{
                      padding: '20px 12px', textAlign: 'center', cursor: 'pointer',
                      border: showCardio ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 40%, transparent)' : undefined,
                      background: showCardio ? 'color-mix(in srgb, var(--accent, #D4A853) 7%, transparent)' : undefined,
                    }}
                  >
                    <Play size={28} className="gold-text mx-auto" />
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--t1)', letterSpacing: '-.01em' }}>{t('workout.cardio')}</div>
                    <div className="ds-sub" style={{ fontSize: 9, marginTop: 3 }}>{t('workout.cardio_sub')}</div>
                  </motion.button>
                </div>

                {/* Subtle coach hint */}
                <Link href="/dashboard/messages">
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.08)',
                  }}>
                    <MessageCircle size={12} style={{ color: 'var(--t4)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--t4)' }}>
                      {t('workout.no_program_hint')}
                    </span>
                  </div>
                </Link>
              </>
            )}

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
                      <p className="ds-sub mb-2" style={{ fontSize: 10 }}>{t('workout.cardio_type')}</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['walk', 'run', 'cycle', 'hiit', 'swim', 'other'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => setCardioType(type)}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              cursor: 'pointer', transition: 'all .15s',
                              background: cardioType === type ? 'color-mix(in srgb, var(--accent, #D4A853) 20%, transparent)' : 'rgba(255,255,255,.04)',
                              border: cardioType === type ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 50%, transparent)' : '1px solid rgba(255,255,255,.06)',
                              color: cardioType === type ? 'var(--accent, #D4A853)' : 'var(--t3)',
                            }}
                          >
                            {t(`workout.cardio_${type}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration stepper */}
                    <div>
                      <p className="ds-sub mb-2" style={{ fontSize: 10 }}>{t('workout.cardio_duration')}</p>
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
                                background: cardioDuration === m ? 'color-mix(in srgb, var(--accent, #D4A853) 20%, transparent)' : 'rgba(255,255,255,.04)',
                                border: cardioDuration === m ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 40%, transparent)' : '1px solid rgba(255,255,255,.06)',
                                color: cardioDuration === m ? 'var(--accent, #D4A853)' : 'var(--t4)',
                              }}
                            >{m}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Distance (optional) */}
                    {(cardioType === 'run' || cardioType === 'walk' || cardioType === 'cycle') && (
                      <div>
                        <p className="ds-sub mb-2" style={{ fontSize: 10 }}>{t('workout.cardio_distance')}</p>
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
                      {savingCardio ? t('workout.custom_saving') : `${t('workout.cardio_log')} · ${t(`workout.cardio_${cardioType}`)}`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Recent sessions (tappable → inline set detail) ── */}
            {recentSessions.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t('workout.recent')}</span>
                  <Link href="/dashboard/workout/history">
                    <span style={{ fontSize: 10, color: 'var(--accent, #D4A853)', cursor: 'pointer' }}>{t('workout.see_all')}</span>
                  </Link>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {recentSessions.slice(0, 4).map(session => (
                    <RecentSessionCard key={session.id} session={session} lang={lang} />
                  ))}
                </div>
              </div>
            )}

            {recentSessions.length === 0 && (
              <div className="glass p-5 text-center">
                <Trophy size={20} className="text-stone-600 mx-auto mb-2" />
                <p className="text-sm text-stone-400 font-medium">{t('workout.no_workouts')}</p>
                <p className="text-xs text-stone-600 mt-1">
                  {hasProgram && todayHero ? t('workout.start_today_hint') : t('workout.no_workouts_sub')}
                </p>
              </div>
            )}

            {/* ── Quick links: History · Stats · Form Check (utilities last) ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { href: '/dashboard/workout/history', icon: <History size={16} className="gold-text mx-auto" />, label: t('workout.history') },
                { href: '/dashboard/workout/stats', icon: <BarChart3 size={16} className="gold-text mx-auto" />, label: t('workout.stats') },
                { href: '/dashboard/workout/form-check', icon: <Camera size={16} className="gold-text mx-auto" />, label: t('workout.form_check') },
              ].map((link) => (
                <Link key={link.href} href={link.href}>
                  <div className="card" style={{ padding: '12px 6px', textAlign: 'center', cursor: 'pointer' }}>
                    {link.icon}
                    <div style={{ fontSize: 10, fontWeight: 600, marginTop: 5, color: 'var(--t2)' }}>{link.label}</div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══ FREESTYLE SESSION ═══ */}
        {inFreestyle && (
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
                const mgColor = muscleColor(ae.exercise.muscle_group);
                return (
                  <motion.div
                    key={ae.exercise.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass overflow-hidden"
                  >
                    {/* Superset badge — shown on every exercise in a chain */}
                    {supersetGroupFor(activeExercises, exIndex) !== null && (
                      <div className="flex items-center gap-1.5 px-3 pt-2 -mb-1">
                        <Link2 size={11} style={{ color: 'var(--accent, #D4A853)' }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent, #D4A853)' }}>
                          {t('workout.superset')} {supersetLabelFor(activeExercises, exIndex)}
                        </span>
                      </div>
                    )}

                    {/* Exercise header */}
                    <button
                      onClick={() => toggleCollapse(exIndex)}
                      className="w-full flex items-center gap-3 p-3"
                    >
                      <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: mgColor }} />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-stone-200 truncate">
                          {getExerciseName(ae.exercise)}
                        </p>
                        <p className="text-xs text-stone-500">
                          {ae.sets.length} {ae.sets.length === 1 ? 'set' : 'sets'}
                          {ae.lastSets && ae.lastSets.length > 0 && (
                            <span className="ml-1.5 text-stone-600">
                              · last {ae.lastSets.slice(0, 3).map(ls => `${ls.weight_kg !== null ? kgToDisplay(ls.weight_kg, unit) : '–'}×${ls.reps ?? '–'}`).join(' ')}
                            </span>
                          )}
                          {ae.sets.some((s) => s.is_pr) && (
                            <motion.span
                              initial={{ scale: 0, rotate: -20 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                              className="ml-1.5 inline-block font-semibold"
                              style={{ color: 'var(--accent, #D4A853)' }}
                            >
                              <Trophy size={10} className="inline" /> PR
                            </motion.span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Rest target — tap to cycle 60/90/120/150/180s (persists) */}
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleRestTarget(ae.exercise); }}
                          className="px-1.5 py-1 rounded-lg text-[10px] font-bold tabular-nums transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}
                          aria-label={t('workout.rest_target')}
                          title={t('workout.rest_target')}
                        >
                          <Timer size={10} className="inline mr-0.5" style={{ verticalAlign: -1 }} />
                          {restTargets[ae.exercise.id] ?? getRestTarget(ae.exercise.id, ae.exercise.is_compound)}s
                        </button>
                        {/* Superset link with next exercise */}
                        {exIndex < activeExercises.length - 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSupersetLink(exIndex); }}
                            disabled={syncingSupersets}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{
                              background: ae.linkedBelow ? 'color-mix(in srgb, var(--accent, #D4A853) 16%, transparent)' : 'rgba(255,255,255,0.05)',
                              color: ae.linkedBelow ? 'var(--accent, #D4A853)' : '#78716c',
                              opacity: syncingSupersets ? 0.5 : 1,
                            }}
                            aria-label={ae.linkedBelow ? t('workout.superset_unlink') : t('workout.superset_link')}
                            title={ae.linkedBelow ? t('workout.superset_unlink') : t('workout.superset_link')}
                          >
                            <Link2 size={14} />
                          </button>
                        )}
                        {/* Plate calculator (barbell only) */}
                        {ae.exercise.equipment === 'barbell' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const typedRaw = ae.sets.map((s) => parseFloat(s.weight_kg)).find((v) => !isNaN(v) && v > 0);
                              const typedKg = typedRaw !== undefined ? displayToKg(typedRaw, unit) : undefined;
                              const target = typedKg ?? ae.lastSets?.[0]?.weight_kg ?? prRecords[ae.exercise.id] ?? 60;
                              setPlateCalcKg(target);
                            }}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ background: 'rgba(255,255,255,0.05)' }}
                            aria-label={t('workout.plate_title')}
                            title={t('workout.plate_title')}
                          >
                            <Calculator size={14} className="text-stone-500" />
                          </button>
                        )}
                        {/* Exercise info sheet */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setInfoExercise(ae.exercise); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)' }}
                          aria-label={t('workout.info_title')}
                          title={t('workout.info_title')}
                        >
                          <Info size={14} className="text-stone-500" />
                        </button>
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
                            <div className="w-7 text-center">#</div>
                            <div className="flex-1 text-center">{unit}</div>
                            <div className="flex-1 text-center">reps</div>
                            <div className="w-10 text-center">rpe</div>
                            <div className="w-7 text-center">W</div>
                            <div className="w-9 text-center"><Check size={10} className="inline" /></div>
                            <div className="w-5" />
                          </div>

                          {/* Set rows */}
                          {ae.sets.map((set, setIndex) => (
                            <div key={set.id} className="flex items-center gap-1 px-3 py-1">
                              <div className="w-7 text-center text-xs text-stone-500 font-medium">
                                {set.set_number}
                              </div>

                              <input
                                type="number"
                                inputMode="decimal"
                                value={set.weight_kg}
                                disabled={set.completed}
                                onChange={(e) => updateSet(exIndex, setIndex, 'weight_kg', e.target.value)}
                                placeholder={
                                  ae.lastSets?.[setIndex]?.weight_kg != null
                                    ? String(kgToDisplay(ae.lastSets[setIndex].weight_kg as number, unit))
                                    : '0'
                                }
                                className="flex-1 min-w-0 text-center text-sm py-2 rounded-lg outline-none transition-colors"
                                style={{
                                  background: set.is_pr ? 'color-mix(in srgb, var(--accent, #D4A853) 15%, transparent)' : 'rgba(255,255,255,0.04)',
                                  border: set.is_pr ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 30%, transparent)' : '1px solid transparent',
                                  color: set.is_pr ? 'var(--accent, #D4A853)' : '#f5f5f4',
                                  opacity: set.completed && !set.is_pr ? 0.65 : 1,
                                }}
                              />

                              <input
                                type="number"
                                inputMode="numeric"
                                value={set.reps}
                                disabled={set.completed}
                                onChange={(e) => updateSet(exIndex, setIndex, 'reps', e.target.value)}
                                placeholder={ae.lastSets?.[setIndex]?.reps?.toString() ?? '0'}
                                className="flex-1 min-w-0 text-center text-sm py-2 rounded-lg outline-none"
                                style={{ background: 'rgba(255,255,255,0.04)', color: '#f5f5f4', opacity: set.completed ? 0.65 : 1 }}
                              />

                              <input
                                type="number"
                                inputMode="decimal"
                                value={set.rpe}
                                disabled={set.completed}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || (parseFloat(v) >= 1 && parseFloat(v) <= 10)) {
                                    updateSet(exIndex, setIndex, 'rpe', v);
                                  }
                                }}
                                placeholder="-"
                                className="w-10 text-center text-sm py-2 rounded-lg outline-none"
                                style={{ background: 'rgba(255,255,255,0.04)', color: '#a8a29e', opacity: set.completed ? 0.65 : 1 }}
                              />

                              <button
                                onClick={() => updateSet(exIndex, setIndex, 'is_warmup', !set.is_warmup)}
                                disabled={set.completed}
                                className="w-7 h-9 flex items-center justify-center rounded-lg text-[10px] font-bold transition-colors"
                                style={{
                                  background: set.is_warmup ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                                  color: set.is_warmup ? '#fbbf24' : '#78716c',
                                }}
                              >
                                W
                              </button>

                              {/* Check-to-complete → immediate INSERT */}
                              <button
                                onClick={() => completeFreestyleSet(exIndex, setIndex)}
                                disabled={set.saving}
                                aria-label={set.completed ? 'Undo set' : 'Complete set'}
                                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                                style={{
                                  background: set.completed
                                    ? (set.is_pr ? 'color-mix(in srgb, var(--accent, #D4A853) 22%, transparent)' : 'rgba(34,197,94,.16)')
                                    : 'rgba(255,255,255,0.05)',
                                  border: set.completed
                                    ? (set.is_pr ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 45%, transparent)' : '1px solid rgba(34,197,94,.3)')
                                    : '1px solid rgba(255,255,255,.09)',
                                  color: set.completed ? (set.is_pr ? 'var(--accent, #D4A853)' : '#4ade80') : '#78716c',
                                  opacity: set.saving ? 0.5 : 1,
                                }}
                              >
                                {set.is_pr && set.completed ? <Trophy size={13} /> : <Check size={14} strokeWidth={2.6} />}
                              </button>

                              <button
                                onClick={() => removeSet(exIndex, setIndex)}
                                className="w-5 flex items-center justify-center"
                              >
                                <Minus size={12} className="text-stone-600" />
                              </button>
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
              style={{ border: '1px dashed color-mix(in srgb, var(--accent, #D4A853) 30%, transparent)', background: 'color-mix(in srgb, var(--accent, #D4A853) 5%, transparent)' }}
            >
              <Plus size={18} />
              {t('workout.add_exercise')}
            </motion.button>

            {/* Pain flags summary */}
            {painFlags.length > 0 && (
              <div className="glass p-3">
                <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> {painFlags.length} {t('workout.pain_recorded')}
                </p>
                {painFlags.map((pf, i) => (
                  <p key={i} className="text-xs text-stone-500">
                    {pf.body_part} — {t('workout.pain_severity')} {pf.severity}/5
                  </p>
                ))}
              </div>
            )}

            {/* Finish button */}
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
              {saving ? t('workout.custom_saving') : t('workout.finish')}
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* Exercise picker modal */}
      <AnimatePresence>
        {showPicker && (
          <ExercisePicker
            exercises={exercises}
            recentIds={recentExerciseIds}
            onSelect={addExercise}
            onClose={() => setShowPicker(false)}
            lang={lang}
            onCustomCreated={(ex) => setExercises((prev) => [...prev, ex])}
            onInfo={(ex) => setInfoExercise(ex)}
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

      {/* Exercise info sheet (form cue, muscles, PR, recent history) */}
      <AnimatePresence>
        {infoExercise && (
          <ExerciseInfoSheet
            exercise={infoExercise}
            userId={userId}
            onClose={() => setInfoExercise(null)}
          />
        )}
      </AnimatePresence>

      {/* Plate calculator (barbell lifts) */}
      <AnimatePresence>
        {plateCalcKg !== null && (
          <PlateCalculator
            weightKg={plateCalcKg}
            unit={unit}
            onClose={() => setPlateCalcKg(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Session-complete celebration ─────────────────────────── */}
      <AnimatePresence>
        {finishSummary && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center px-6"
            style={{ zIndex: 60, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setFinishSummary(null)}
          >
            <motion.div
              className="card-g w-full max-w-sm text-center"
              style={{ padding: '26px 22px' }}
              initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="eye" style={{ color: 'var(--accent)', marginBottom: 6 }}>
                {t('workout.summary_title')}
              </div>
              <div className="display-lg" style={{ fontSize: 44, lineHeight: '48px', color: 'var(--t1)' }}>
                <AnimatedValue value={kgToDisplay(finishSummary.volume, unit)} />
                <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 13, color: 'var(--t4)', marginLeft: 4 }}>{unit}</span>
              </div>
              <div className="eye-d" style={{ marginTop: 2, marginBottom: 16 }}>{t('workout.summary_volume')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                {[
                  { v: finishSummary.sets, l: t('workout.summary_sets'), accent: false },
                  { v: finishSummary.prs, l: t('workout.summary_prs'), accent: finishSummary.prs > 0 },
                  { v: finishSummary.minutes, l: t('workout.summary_minutes'), accent: false },
                ].map((s) => (
                  <div key={s.l} style={{ padding: '10px 6px', borderRadius: 12, background: s.accent ? 'var(--accent-soft)' : 'rgba(255,255,255,.03)', border: `1px solid ${s.accent ? 'var(--accent)' : 'var(--line)'}` }}>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.accent ? 'var(--accent)' : 'var(--t1)' }}>
                      <AnimatedValue value={s.v} />
                    </div>
                    <div className="eye-d" style={{ marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {finishSummary.prs > 0 && (
                <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 14 }}>
                  {t('workout.summary_pr_line')}
                </div>
              )}
              <button className="btn-gold w-full" style={{ fontSize: 13, padding: '11px' }} onClick={() => setFinishSummary(null)}>
                {t('workout.summary_done')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BotNav routes={clientNav} />
    </div>
  );
}
