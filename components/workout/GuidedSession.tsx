'use client';

/**
 * Guided training mode — the core of the client workout rebuild.
 *
 * Walks the client through the coach-assigned template one exercise at a
 * time: target chips ("3 × 8-12 @ RPE 8"), ghost placeholders from the last
 * logged session, check-to-complete sets, rest timer, PR detection, swipe /
 * next navigation, and a finish screen with a gold PR celebration.
 *
 * Persistence is crash-safe (workout-persistence.ts):
 *   - session row created lazily at the FIRST completed set
 *   - each completed set INSERTed immediately
 *   - finish = single UPDATE (name = template name, duration, pain flags,
 *     template_id — the FK added by migration 0049).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Info, Minus, Plus,
  SkipForward, Timer, Trophy, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Exercise, PainFlag, TemplateExercise } from '@/lib/types';
import PainFlagModal from './PainFlagModal';
import ExerciseInfoSheet from './ExerciseInfoSheet';
import { muscleColor, exerciseDisplayName } from './muscle-groups';
import { useWeightUnit, kgToDisplay, displayToKg } from '@/lib/workout/units';
import { getRestTarget } from '@/lib/workout/rest-targets';
import {
  createWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  insertWorkoutSet,
  loadLastSetsMap,
  loadPrMap,
  type GhostSet,
} from './workout-persistence';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuidedExerciseInfo {
  id: string;
  name: string;
  nameEs: string | null;
  nameEl: string | null;
  muscleGroup: string;
  equipment: string | null;
  isCompound: boolean | null;
}

export interface GuidedTemplate {
  id: string;
  name: string;
  dayLabel: string | null;
  difficulty: string | null;
  exercises: TemplateExercise[];
}

interface GuidedSet {
  id: string;
  set_number: number;
  weight: string;
  reps: string;
  rpe: string;
  is_warmup: boolean;
  is_pr: boolean;
  completed: boolean;
  saving: boolean;
  dbId: string | null;
  ghost?: GhostSet;
}

interface GuidedExercise {
  ref: TemplateExercise;
  info: GuidedExerciseInfo | null;
  sets: GuidedSet[];
  skipped: boolean;
}

interface FinishStats {
  durationMin: number;
  totalVolume: number;
  setsDone: number;
  prs: { exerciseName: string; weight: number; reps: number | null }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function newSet(setNumber: number, ghost?: GhostSet): GuidedSet {
  return {
    id: crypto.randomUUID(),
    set_number: setNumber,
    weight: '',
    reps: '',
    rpe: '',
    is_warmup: false,
    is_pr: false,
    completed: false,
    saving: false,
    dbId: null,
    ghost,
  };
}

function resolveFloat(input: string, ghost: number | null | undefined): number | null {
  if (input.trim() !== '') {
    const v = parseFloat(input);
    return isNaN(v) ? null : v;
  }
  return ghost ?? null;
}

function resolveInt(input: string, ghost: number | null | undefined): number | null {
  if (input.trim() !== '') {
    const v = parseInt(input, 10);
    return isNaN(v) ? null : v;
  }
  return ghost ?? null;
}

/** Elapsed whole minutes since `start` (event-handler time, min 1). */
function minutesSince(start: number): number {
  return start > 0 ? Math.max(1, Math.round((Date.now() - start) / 60000)) : 1;
}

// ─── Rest bar (per-exercise target, full-width for one-handed reach) ────────

function RestBar({ startedAt, targetS, onDismiss }: { startedAt: number; targetS: number; onDismiss: () => void }) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [startedAt]);

  const ready = elapsed >= targetS;
  const pct = Math.min(elapsed / targetS, 1);

  return (
    <motion.button
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
      className="w-full min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      style={{
        marginTop: 10, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, position: 'relative', overflow: 'hidden',
        background: ready ? 'color-mix(in srgb, var(--action-primary) 14%, transparent)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
        border: ready ? '1px solid color-mix(in srgb, var(--action-primary) 40%, transparent)' : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
        animation: ready ? 'pulse 1.6s ease-in-out infinite' : undefined,
      }}
      title={t('workout.rest_dismiss_hint')}
    >
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: '100%',
          transform: `scaleX(${pct})`,
          transformOrigin: 'left center',
          background: 'color-mix(in srgb, var(--action-primary) 8%, transparent)',
          transition: reducedMotion ? 'none' : 'transform .5s linear',
          pointerEvents: 'none',
        }}
      />
      <Timer size={14} style={{ color: ready ? 'var(--action-primary)' : 'var(--content-muted)', flexShrink: 0, position: 'relative' }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, position: 'relative',
        color: ready ? 'var(--action-primary)' : 'var(--content-secondary)',
      }}>
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
      </span>
      <span style={{ fontSize: 12, color: ready ? 'var(--action-primary)' : 'var(--content-muted)', position: 'relative', fontWeight: ready ? 700 : 400 }}>
        {ready ? t('workout.rested_go') : t('workout.resting')}
      </span>
    </motion.button>
  );
}

// ─── Elapsed timer chip ─────────────────────────────────────────────────────

function ElapsedChip({ startTime, readyLabel }: { startTime: number; readyLabel: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startTime === 0) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const notStarted = startTime === 0;
  const mins = Math.floor(elapsed / 60);
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={
        notStarted
          ? { background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-secondary)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }
          : { background: 'color-mix(in srgb, var(--action-primary) 15%, transparent)', color: 'var(--action-primary)', border: '1px solid color-mix(in srgb, var(--action-primary) 28%, transparent)' }
      }
    >
      <Clock size={11} />
      {notStarted ? (
        <span>{readyLabel}</span>
      ) : (
        <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
          {String(mins).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      )}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// GuidedSession
// ═════════════════════════════════════════════════════════════════════════

export default function GuidedSession({
  userId,
  programName,
  template,
  exerciseInfo,
  onExit,
}: {
  userId: string;
  programName: string;
  template: GuidedTemplate;
  exerciseInfo: Record<string, GuidedExerciseInfo>;
  /** finished=true → parent refreshes the recent-sessions list. */
  onExit: (finished: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const reducedMotion = useReducedMotion();

  const [exercises, setExercises] = useState<GuidedExercise[]>(() =>
    template.exercises.map((ref) => ({
      ref,
      info: exerciseInfo[ref.exercise_id] ?? null,
      sets: Array.from({ length: Math.max(1, ref.target_sets || 1) }, (_, i) => newSet(i + 1)),
      skipped: false,
    })),
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState<'active' | 'finish'>('active');
  const [finishStats, setFinishStats] = useState<FinishStats | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restTargetS, setRestTargetS] = useState(90);
  const [painFlags, setPainFlags] = useState<PainFlag[]>([]);
  const [painModalExerciseId, setPainModalExerciseId] = useState<string | null>(null);
  // 10/10 wave: display unit + exercise info sheet (full row fetched on demand).
  const [unit] = useWeightUnit();
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);

  const openInfo = async (exerciseId: string) => {
    const { data } = await supabase.from('exercises').select('*').eq('id', exerciseId).maybeSingle();
    if (data) setInfoExercise(data as Exercise);
  };

  // Session clock starts on the FIRST completed set (see completeSet), not on
  // mount — so elapsed time reflects real training, not warm-up browsing.
  // 0 = "not started yet"; the chip shows "Ready" until then.
  const [startTime, setStartTime] = useState<number>(0);

  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const prMapRef = useRef<Record<string, number>>({});

  const exerciseIds = useMemo(
    () => [...new Set(template.exercises.map((e) => e.exercise_id))],
    [template.exercises],
  );

  // ── Ghost placeholders (last logged sets) + PR baselines, batched ─────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ghosts, prs] = await Promise.all([
        loadLastSetsMap(userId, exerciseIds),
        loadPrMap(userId, exerciseIds),
      ]);
      if (cancelled) return;
      prMapRef.current = prs;
      setExercises((prev) =>
        prev.map((ex) => {
          const g = ghosts[ex.ref.exercise_id];
          if (!g || g.length === 0) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, i) => ({ ...s, ghost: g[i] ?? g[g.length - 1] })),
          };
        }),
      );
    })();
    return () => { cancelled = true; };
  }, [userId, exerciseIds]);

  // ── Lazy session creation (first completed set) ───────────────────────────
  const ensureSession = useCallback((): Promise<string | null> => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = createWorkoutSession(userId, template.name, template.id).then((id) => {
        sessionIdRef.current = id;
        if (!id) sessionPromiseRef.current = null; // failed create → allow retry
        return id;
      });
    }
    return sessionPromiseRef.current;
  }, [userId, template.id, template.name]);

  // ── Set state helpers ──────────────────────────────────────────────────────
  const patchSet = useCallback((exIdx: number, setId: string, patch: Partial<GuidedSet>) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
          : ex,
      ),
    );
  }, []);

  const updateSetField = (exIdx: number, setId: string, field: 'weight' | 'reps' | 'rpe', value: string) => {
    if (field === 'rpe' && value !== '' && !(parseFloat(value) >= 1 && parseFloat(value) <= 10)) return;
    patchSet(exIdx, setId, { [field]: value } as Partial<GuidedSet>);
  };

  const toggleWarmup = (exIdx: number, set: GuidedSet) => {
    if (set.completed || set.saving) return;
    patchSet(exIdx, set.id, { is_warmup: !set.is_warmup });
  };

  /** Steppers for the active row — big one-handed +/- controls (display unit). */
  const bump = (exIdx: number, set: GuidedSet, field: 'weight' | 'reps', delta: number) => {
    if (set.completed || set.saving) return;
    const base =
      field === 'weight'
        // Typed value is already display-unit; the kg ghost converts for display.
        ? (set.weight.trim() !== '' ? parseFloat(set.weight) : set.ghost?.weight_kg != null ? kgToDisplay(set.ghost.weight_kg, unit) : 0)
        : (set.reps.trim() !== '' ? parseInt(set.reps, 10) : set.ghost?.reps ?? 0);
    const safeBase = isNaN(base) ? 0 : base;
    const next = Math.max(0, Math.round((safeBase + delta) * 10) / 10);
    patchSet(exIdx, set.id, { [field]: String(next) } as Partial<GuidedSet>);
  };

  // ── Check-to-complete: immediate INSERT (crash-safe) ──────────────────────
  const completeSet = async (exIdx: number, set: GuidedSet) => {
    if (set.saving) return;
    const exercise = exercises[exIdx];
    const exId = exercise.ref.exercise_id;

    // Un-complete → delete the persisted row.
    if (set.completed) {
      patchSet(exIdx, set.id, { saving: true });
      const deleted = set.dbId ? await deleteWorkoutSet(set.dbId) : false;
      if (!deleted) {
        patchSet(exIdx, set.id, { saving: false });
        window.alert(t('workout.save_failed'));
        return;
      }
      patchSet(exIdx, set.id, { saving: false, completed: false, dbId: null, is_pr: false });
      return;
    }

    // Typed weight is in the DISPLAY unit → convert once to kg for storage.
    // Ghost fallback (resolveFloat's second arg) is already kg from the DB.
    const typedWeight = set.weight.trim() !== '' && !isNaN(parseFloat(set.weight))
      ? displayToKg(parseFloat(set.weight), unit)
      : null;
    const weight = typedWeight ?? resolveFloat('', set.ghost?.weight_kg);
    const reps = resolveInt(set.reps, set.ghost?.reps);
    const rpe = resolveFloat(set.rpe, set.ghost?.rpe);
    // Compound lifts only — isolation PRs are noise (Nik feedback 2026-08-19).
    const isPr = Boolean(exercise.info?.isCompound) && !set.is_warmup && weight !== null && weight > (prMapRef.current[exId] ?? 0);

    patchSet(exIdx, set.id, { saving: true });
    const sessionId = await ensureSession();
    if (!sessionId) {
      patchSet(exIdx, set.id, { saving: false });
      window.alert(t('workout.save_failed'));
      return;
    }
    const dbId = await insertWorkoutSet(sessionId, {
      exercise_id: exId,
      set_number: set.set_number,
      weight_kg: weight,
      reps,
      rpe,
      is_warmup: set.is_warmup,
      is_pr: isPr,
    });
    if (!dbId) {
      patchSet(exIdx, set.id, { saving: false });
      window.alert(t('workout.save_failed'));
      return;
    }
    if (isPr && weight !== null) prMapRef.current[exId] = weight;
    // First logged set starts the session clock (idempotent — only set once).
    setStartTime((s) => s || Date.now());
    patchSet(exIdx, set.id, {
      saving: false,
      completed: true,
      dbId,
      is_pr: isPr,
      // Show the committed values in the DISPLAY unit (weight is storage kg).
      weight: weight !== null ? String(kgToDisplay(weight, unit)) : set.weight,
      reps: reps !== null ? String(reps) : set.reps,
      rpe: rpe !== null ? String(rpe) : set.rpe,
    });
    setRestTargetS(getRestTarget(exId, exercise.info?.isCompound));
    setRestStartedAt(Date.now());
  };

  const addExtraSet = (exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const extra = newSet(ex.sets.length + 1, last?.ghost);
        // Carry forward what the lifter just did as the new ghost baseline.
        // Ghosts live in kg — typed values (display unit) convert on the way in.
        if (last && (last.weight || last.reps)) {
          extra.ghost = {
            weight_kg: last.weight ? displayToKg(parseFloat(last.weight), unit) : last.ghost?.weight_kg ?? null,
            reps: last.reps ? parseInt(last.reps, 10) : last.ghost?.reps ?? null,
            rpe: last.rpe ? parseFloat(last.rpe) : last.ghost?.rpe ?? null,
          };
        }
        return { ...ex, sets: [...ex.sets, extra] };
      }),
    );
  };

  const toggleSkip = (exIdx: number) => {
    setExercises((prev) => prev.map((ex, i) => (i === exIdx ? { ...ex, skipped: !ex.skipped } : ex)));
    if (!exercises[exIdx].skipped && currentIdx < exercises.length - 1) {
      setCurrentIdx((i) => Math.min(i + 1, exercises.length - 1));
    }
  };

  // ── Progress ───────────────────────────────────────────────────────────────
  const activeExercises = exercises.filter((e) => !e.skipped);
  const totalSets = activeExercises.reduce((s, e) => s + e.sets.length, 0);
  const completedCount = exercises.reduce(
    (s, e) => s + e.sets.filter((x) => x.completed).length,
    0,
  );
  const progressPct = totalSets > 0 ? Math.min((completedCount / totalSets) * 100, 100) : 0;

  // ── Finish ────────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (finishing) return;

    // Nothing logged → nothing persisted (lazy session): just leave.
    if (completedCount === 0 && !sessionIdRef.current) {
      onExit(false);
      return;
    }

    setFinishing(true);
    const durationMin = minutesSince(startTime);
    const done = exercises.flatMap((ex) =>
      ex.sets
        .filter((s) => s.completed && !s.is_warmup)
        .map((s) => {
          // s.weight is a DISPLAY-unit string; store finish stats in kg so the
          // render-time kgToDisplay() is correct (was double-converted in lb).
          const wKg = s.weight ? displayToKg(parseFloat(s.weight), unit) : 0;
          const r = s.reps ? parseInt(s.reps, 10) : null;
          return {
            exerciseName: localizedName(ex),
            weight: wKg,
            reps: r,
            volume: wKg * (r ?? 0),
            isPr: s.is_pr,
          };
        }),
    );
    const stats: FinishStats = {
      durationMin,
      totalVolume: Math.round(done.reduce((s, d) => s + d.volume, 0)),
      setsDone: done.length,
      prs: done.filter((d) => d.isPr).map((d) => ({ exerciseName: d.exerciseName, weight: d.weight, reps: d.reps })),
    };

    const sessionId = sessionIdRef.current ?? (await ensureSession());
    if (!sessionId) {
      setFinishing(false);
      window.alert(t('workout.save_failed'));
      return;
    }
    const finished = await finishWorkoutSession(sessionId, {
      name: template.name,
      duration_minutes: durationMin,
      pain_flags: painFlags,
      template_id: template.id,
    });
    if (!finished) {
      setFinishing(false);
      window.alert(t('workout.save_failed'));
      return;
    }
    setFinishStats(stats);
    setFinishing(false);
    setRestStartedAt(null);
    setPhase('finish');
  };

  const handleBack = () => {
    // No sets logged → nothing persisted; safe to just leave.
    if (completedCount === 0 && !sessionIdRef.current) {
      onExit(false);
      return;
    }
    // Sets already persisted → close out properly so no half-open session lingers.
    void handleFinish();
  };

  const localizedName = (ex: GuidedExercise): string => {
    const info = ex.info;
    if (!info) return 'Exercise';
    // Exercise names stay English for Greek users (see exerciseDisplayName).
    return exerciseDisplayName({ name: info.name, name_es: info.nameEs }, lang);
  };

  // ═══ Finish screen ═════════════════════════════════════════════════════
  if (phase === 'finish' && finishStats) {
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-elevated p-6 text-center relative overflow-hidden"
        >
          {finishStats.prs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 0.9, 0.45], scale: [0.4, 1.25, 1] }}
              transition={{ duration: 0.9, times: [0, 0.55, 1], type: 'tween', ease: 'easeOut' }}
              style={{
                position: 'absolute', top: -70, left: '50%', transform: 'translateX(-50%)',
                width: 260, height: 260, borderRadius: '50%', pointerEvents: 'none',
                background: 'radial-gradient(circle, color-mix(in srgb, var(--action-primary) 35%, transparent) 0%, transparent 70%)',
              }}
            />
          )}

          <motion.div
            initial={{ scale: 0, rotate: -18 }}
            animate={{ scale: [0, 1.18, 1], rotate: [-18, 4, 0] }}
            transition={{ duration: 0.55, times: [0, 0.7, 1], type: 'tween', ease: 'easeOut' }}
            className="mx-auto mb-3"
            style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'color-mix(in srgb, var(--action-primary) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--action-primary) 40%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
            }}
          >
            <Trophy size={30} style={{ color: 'var(--action-primary)' }} />
          </motion.div>

          <h2 className="text-xl font-bold" style={{ color: 'var(--content-primary)', letterSpacing: '-.02em' }}>
            {t('workout.template_done', { name: template.name })}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--content-muted)' }}>{programName}</p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              { label: t('workout.duration'), value: `${finishStats.durationMin}${t('workout.min')}` },
              { label: t('workout.volume'), value: (() => { const v = kgToDisplay(finishStats.totalVolume, unit); return v > 1000 ? `${(v / 1000).toFixed(1)}k ${unit}` : `${Math.round(v)} ${unit}`; })() },
              { label: t('workout.sets_label'), value: String(finishStats.setsDone) },
            ].map((s) => (
              <div key={s.label} className="glass p-3 rounded-xl">
                {/* Serif display numerals (digits/units only — never Greek) */}
                <div className="display-lg" style={{ fontSize: 22, lineHeight: '26px', color: 'var(--content-primary)' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--content-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {finishStats.prs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="mt-4 p-3 rounded-xl text-left"
              style={{ background: 'color-mix(in srgb, var(--action-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--action-primary) 30%, transparent)' }}
            >
              <div className="display-lg" style={{ fontSize: 19, lineHeight: '23px', color: 'var(--action-primary)', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Trophy size={15} style={{ flexShrink: 0 }} /> {t('workout.pr_count', { n: finishStats.prs.length })}
              </div>
              {finishStats.prs.map((pr, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--content-secondary)', padding: '2px 0' }}>
                  <span style={{ fontWeight: 600, color: 'var(--content-primary)' }}>{pr.exerciseName}</span>
                  {' — '}
                  <span style={{ color: 'var(--action-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {kgToDisplay(pr.weight, unit)}{unit}{pr.reps ? ` × ${pr.reps}` : ''}
                  </span>
                </div>
              ))}
            </motion.div>
          )}

          {painFlags.length > 0 && (
            <div className="mt-3 p-3 rounded-xl text-left" style={{ background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)' }}>
              <p className="text-xs text-[var(--status-danger-fg)] font-medium mb-1 flex items-center gap-1">
                <AlertTriangle size={11} /> {t('workout.pain_shared', { n: painFlags.length })}
              </p>
              {painFlags.map((pf, i) => (
                <p key={i} className="text-xs text-[var(--content-muted)]">
                  {pf.body_part} — severity {pf.severity}/5
                </p>
              ))}
            </div>
          )}

          <button onClick={() => onExit(true)} className="btn-gold w-full mt-5 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ padding: 14, fontSize: 14, fontWeight: 800, borderRadius: 14 }}>
            {t('workout.done')}
          </button>
        </motion.div>
      </div>
    );
  }

  // ═══ Active guided flow ════════════════════════════════════════════════
  const ex = exercises[currentIdx];
  const exName = localizedName(ex);
  const color = muscleColor(ex.info?.muscleGroup);
  const isLast = currentIdx === exercises.length - 1;
  const targetChip = `${ex.ref.target_sets} × ${ex.ref.target_reps}${ex.ref.target_rpe ? ` @ RPE ${ex.ref.target_rpe}` : ''}`;
  const firstOpenIdx = ex.sets.findIndex((s) => !s.completed);

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Sticky guided header: exit + name + elapsed + progress */}
      <div className="sticky top-0 z-40 glass-elevated px-4 pt-3 pb-2">
        <div className="max-w-md lg:max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', minWidth: 38, minHeight: 38 }}
              aria-label={t('workout.exit')}
            >
              <X size={18} className="text-[var(--content-secondary)]" />
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--content-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {template.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
                {currentIdx + 1} / {exercises.length} · {t('workout.sets_progress', { done: completedCount, total: totalSets })}
              </div>
            </div>
            <ElapsedChip startTime={startTime} readyLabel={t('workout.ready')} />
          </div>
          {/* Progress bar */}
          <div className="mb-track" style={{ marginTop: 8 }}>
            <motion.div
              className="mb-fill"
              style={{
                width: '100%',
                transformOrigin: 'left center',
                background: 'linear-gradient(90deg,var(--gold-400,#B8923E),var(--gold-200,#E8C078))',
              }}
              initial={false}
              animate={{ scaleX: progressPct / 100 }}
              transition={{ duration: reducedMotion ? 0 : 0.35, type: 'tween', ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-4" style={{ paddingBottom: 170 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={ex.ref.exercise_id + currentIdx}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.22, type: 'tween', ease: 'easeOut' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 && !isLast) setCurrentIdx((i) => i + 1);
              else if (info.offset.x > 70 && currentIdx > 0) setCurrentIdx((i) => i - 1);
            }}
          >
            {/* Exercise card */}
            <div className="glass overflow-hidden" style={{ opacity: ex.skipped ? 0.55 : 1 }}>
              {/* Header */}
              <div className="flex items-center gap-3 p-4 pb-3">
                <div className="w-1.5 h-12 rounded-full shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--content-primary)', letterSpacing: '-.01em' }} className="truncate">
                    {exName}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      style={{
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        padding: '2px 8px', borderRadius: 14,
                        background: 'color-mix(in srgb, var(--action-primary) 13%, transparent)', border: '1px solid color-mix(in srgb, var(--action-primary) 30%, transparent)', color: 'var(--action-primary)',
                      }}
                    >
                      {targetChip}
                    </span>
                    {ex.info?.equipment && (
                      <span style={{ fontSize: 12, color: 'var(--content-muted)' }}>{ex.info.equipment}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void openInfo(ex.ref.exercise_id)}
                  className="p-2 rounded-lg min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', minWidth: 36, minHeight: 36 }}
                  aria-label={t('workout.info_title')}
                >
                  <Info size={15} className="text-[var(--content-secondary)]" />
                </button>
                <button
                  onClick={() => setPainModalExerciseId(ex.ref.exercise_id)}
                  className="p-2 rounded-lg min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{ background: 'var(--status-danger-bg)', minWidth: 36, minHeight: 36 }}
                  aria-label={t('workout.report_pain')}
                >
                  <AlertTriangle size={15} className="text-[var(--status-danger-fg)]" />
                </button>
              </div>

              {/* Coach notes on this exercise */}
              {ex.ref.notes && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-lg" style={{ background: 'var(--status-info-bg)', border: '1px solid var(--status-info-border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--status-info-fg)', lineHeight: 1.45 }}>{ex.ref.notes}</p>
                </div>
              )}

              {ex.skipped ? (
                <div className="px-4 pb-4 pt-1 text-center">
                  <p style={{ fontSize: 12, color: 'var(--content-muted)', marginBottom: 10 }}>{t('workout.exercise_skipped')}</p>
                  <button onClick={() => toggleSkip(currentIdx)} className="btn-ghost text-xs px-4 py-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    {t('workout.undo_skip')}
                  </button>
                </div>
              ) : (
                <div className="px-3 pb-3">
                  {/* Column headers */}
                  <div className="flex items-center gap-1.5 px-1 pb-1 text-xs text-[var(--content-muted)] uppercase tracking-wider">
                    <div style={{ width: 34 }} className="text-center">Set</div>
                    <div className="flex-1 text-center">{unit}</div>
                    <div className="flex-1 text-center">{t('workout.reps')}</div>
                    <div style={{ width: 42 }} className="text-center">rpe</div>
                    <div style={{ width: 46 }} />
                  </div>

                  {ex.sets.map((set, setIdx) => {
                    const isActive = setIdx === firstOpenIdx && !set.completed;
                    return (
                      <div key={set.id}>
                        <div
                          className="flex items-center gap-1.5 px-1 py-1"
                          style={{
                            borderRadius: 12,
                            background: isActive ? 'color-mix(in srgb, var(--content-primary) 8%, transparent)' : 'transparent',
                          }}
                        >
                          {/* Set number — tap toggles warmup */}
                          <button
                            onClick={() => toggleWarmup(currentIdx, set)}
                            title={t('workout.warmup_hint')}
                            style={{
                              width: 34, height: 44, borderRadius: 10, flexShrink: 0,
                              fontSize: set.is_warmup ? 11 : 12, fontWeight: 700,
                              background: set.is_warmup ? 'var(--status-warning-bg)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                              color: set.is_warmup ? 'var(--status-warning-fg)' : 'var(--content-muted)',
                              border: '1px solid transparent',
                            }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            {set.is_warmup ? 'W' : set.set_number}
                          </button>

                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight}
                            disabled={set.completed}
                            onChange={(e) => updateSetField(currentIdx, set.id, 'weight', e.target.value)}
                            placeholder={set.ghost?.weight_kg != null ? String(kgToDisplay(set.ghost.weight_kg, unit)) : '0'}
                            className="flex-1 text-center rounded-xl outline-none min-w-0 text-base"
                            style={{
                              height: 44, fontSize: 16, fontWeight: 600,
                              background: set.is_pr ? 'color-mix(in srgb, var(--action-primary) 15%, transparent)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                              border: set.is_pr ? '1px solid color-mix(in srgb, var(--action-primary) 35%, transparent)' : '1px solid transparent',
                              color: set.is_pr ? 'var(--action-primary)' : 'var(--content-primary)',
                              opacity: set.completed && !set.is_pr ? 0.65 : 1,
                            }}
                          />

                          <input
                            type="number"
                            inputMode="numeric"
                            value={set.reps}
                            disabled={set.completed}
                            onChange={(e) => updateSetField(currentIdx, set.id, 'reps', e.target.value)}
                            placeholder={set.ghost?.reps != null ? String(set.ghost.reps) : ex.ref.target_reps}
                            className="flex-1 text-center rounded-xl outline-none min-w-0 text-base"
                            style={{
                              height: 44, fontSize: 16, fontWeight: 600,
                              background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-primary)',
                              opacity: set.completed ? 0.65 : 1,
                            }}
                          />

                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.rpe}
                            disabled={set.completed}
                            onChange={(e) => updateSetField(currentIdx, set.id, 'rpe', e.target.value)}
                            placeholder={set.ghost?.rpe != null ? String(set.ghost.rpe) : (ex.ref.target_rpe ? String(ex.ref.target_rpe) : '-')}
                            className="text-center rounded-xl outline-none text-base"
                            style={{
                              width: 42, height: 44, fontSize: 16,
                              background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-secondary)',
                              opacity: set.completed ? 0.65 : 1,
                            }}
                          />

                          {/* Check-to-complete (44px target) */}
                          <motion.button
                            whileTap={{ scale: 0.88 }}
                            onClick={() => completeSet(currentIdx, set)}
                            disabled={set.saving}
                            aria-label={set.completed ? t('workout.undo_set') : t('workout.complete_set')}
                            style={{
                              width: 46, height: 44, borderRadius: 12, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: set.completed
                                ? (set.is_pr ? 'color-mix(in srgb, var(--action-primary) 25%, transparent)' : 'var(--status-success-bg)')
                                : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                              border: set.completed
                                ? (set.is_pr ? '1px solid color-mix(in srgb, var(--action-primary) 50%, transparent)' : '1px solid var(--status-success-border)')
                                : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                              color: set.completed ? (set.is_pr ? 'var(--action-primary)' : 'var(--status-success-fg)') : 'var(--content-muted)',
                              opacity: set.saving ? 0.5 : 1,
                            }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            {set.is_pr && set.completed ? <Trophy size={17} /> : <Check size={19} strokeWidth={2.6} />}
                          </motion.button>
                        </div>

                        {/* Big steppers under the active set — one-handed adjust */}
                        {isActive && (
                          <div className="flex gap-1.5 px-1 pb-1.5 pt-0.5">
                            {[
                              // Weight steps follow the display unit's plate math.
                              { field: 'weight' as const, delta: -(unit === 'lb' ? 5 : 2.5) },
                              { field: 'weight' as const, delta: unit === 'lb' ? 5 : 2.5 },
                              { field: 'reps' as const, delta: -1 },
                              { field: 'reps' as const, delta: 1 },
                            ].map((b) => (
                              <button
                                key={`${b.field}${b.delta}`}
                                onClick={() => bump(currentIdx, set, b.field, b.delta)}
                                style={{
                                  flex: 1, height: 44, borderRadius: 12,
                                  background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                                  color: 'var(--content-secondary)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                              >
                                {b.delta < 0 ? <Minus size={11} /> : <Plus size={11} />}
                                {Math.abs(b.delta)}
                                <span style={{ fontSize: 12, color: 'var(--content-disabled)' }}>{b.field === 'weight' ? unit : 'rep'}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add extra set + Skip */}
                  <div className="flex gap-2 px-1 pt-2">
                    <button
                      onClick={() => addExtraSet(currentIdx)}
                      className="flex-1 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      style={{ height: 40, background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-secondary)', border: '1px dashed color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
                    >
                      <Plus size={13} />
                      {t('workout.add_extra_set')}
                    </button>
                    <button
                      onClick={() => toggleSkip(currentIdx)}
                      className="rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 px-4 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      style={{ height: 40, background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', color: 'var(--content-muted)' }}
                    >
                      <SkipForward size={13} />
                      {t('workout.skip')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rest timer between sets */}
            <AnimatePresence>
              {restStartedAt !== null && (
                <RestBar key={restStartedAt} startedAt={restStartedAt} targetS={restTargetS} onDismiss={() => setRestStartedAt(null)} />
              )}
            </AnimatePresence>

            {/* Up-next preview */}
            {!isLast && (
              <div className="mt-3 px-1 flex items-center gap-2" style={{ opacity: 0.8 }}>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--content-disabled)' }}>
                  {t('workout.up_next')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--content-secondary)', fontWeight: 600 }} className="truncate">
                  {localizedName(exercises[currentIdx + 1])}
                </span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Fixed thumb-reach action bar (above BotNav) */}
      <div
        className="fixed left-0 right-0 z-40 px-4"
        style={{ bottom: 84 }}
      >
        <div className="max-w-md lg:max-w-2xl mx-auto flex gap-2">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="glass-elevated rounded-2xl flex items-center justify-center min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{ width: 56, height: 52, opacity: currentIdx === 0 ? 0.35 : 1 }}
            aria-label="Previous exercise"
          >
            <ChevronLeft size={20} className="text-[var(--content-secondary)]" />
          </button>
          {isLast ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleFinish}
              disabled={finishing}
              className="btn-gold flex-1 rounded-2xl flex items-center justify-center gap-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{ height: 52, fontSize: 14, fontWeight: 800, opacity: finishing ? 0.7 : 1 }}
            >
              <Trophy size={16} />
              {finishing ? t('workout.saving') : t('workout.finish')}
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setCurrentIdx((i) => Math.min(exercises.length - 1, i + 1))}
              className="btn-gold flex-1 rounded-2xl flex items-center justify-center gap-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{ height: 52, fontSize: 14, fontWeight: 800 }}
            >
              {t('workout.next_exercise')}
              <ChevronRight size={18} />
            </motion.button>
          )}
          {!isLast && completedCount > 0 && (
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="glass-elevated rounded-2xl flex items-center justify-center px-3 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{ height: 52, fontSize: 12, fontWeight: 700, color: 'var(--content-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}
            >
              {finishing ? '…' : t('workout.end_early')}
            </button>
          )}
        </div>
      </div>

      {/* Pain flag modal */}
      <AnimatePresence>
        {painModalExerciseId && (
          <PainFlagModal
            exerciseId={painModalExerciseId}
            exerciseName={exName}
            suggestedBodyPart={ex.info?.muscleGroup ?? ''}
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
    </div>
  );
}
