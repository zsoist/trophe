'use client';

/**
 * Landing hero cards for the client workout page.
 *
 *   TodayProgramCard — coach program assigned AND today has a template:
 *     program name, template name, exercise + set counts, and a
 *     "Review today's workout" CTA into the draft review boundary.
 *
 *   RestDayCard — program assigned, nothing scheduled today:
 *     next scheduled day + recovery tip + "Train anyway" (freestyle).
 */

import { motion } from 'framer-motion';
import { CalendarDays, ChevronRight, ClipboardCheck, Dumbbell, Moon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { MuscleGroup } from '@/lib/types';
import type { DraftExercise } from '@/lib/workout/workspace-state';

const WEEKDAY_KEYS = [
  'general.weekday_sunday', 'general.weekday_monday', 'general.weekday_tuesday',
  'general.weekday_wednesday', 'general.weekday_thursday', 'general.weekday_friday',
  'general.weekday_saturday',
];

const RECOVERY_TIP_KEYS = [
  'workout.rest_tip_1',
  'workout.rest_tip_2',
  'workout.rest_tip_3',
  'workout.rest_tip_4',
  'workout.rest_tip_5',
];

// Rotates daily. Computed at module load — Date.now() is not allowed during
// render (react-hooks/purity; same precedent as CONFETTI_PARTICLES on home).
const TIP_KEY_OF_DAY = RECOVERY_TIP_KEYS[Math.floor(Date.now() / 86400000) % RECOVERY_TIP_KEYS.length];

export interface TodayTemplateSummary {
  templateKey: string;
  templateId?: string | null;
  name: string;
  exercises: DraftExercise[];
  muscleSummary: MuscleGroup[];
}

export function TodayProgramCard({
  programName,
  template,
  alsoToday,
  onReview,
  disabled = false,
}: {
  programName: string;
  template: TodayTemplateSummary;
  /** Extra templates scheduled for the same weekday (sort > 0). */
  alsoToday: TodayTemplateSummary[];
  onReview: (template: TodayTemplateSummary) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const exerciseCount = template.exercises.length;
  const totalSets = template.exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="card-g"
      style={{
        padding: 16,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--action-primary) 14%, transparent) 0%, color-mix(in srgb, var(--action-primary) 3%, transparent) 100%)',
        border: '1px solid color-mix(in srgb, var(--action-primary) 32%, transparent)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', top: -24, right: -24, width: 120, height: 120,
          background: 'radial-gradient(circle, color-mix(in srgb, var(--action-primary) 18%, transparent) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Eyebrow: program name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CalendarDays size={11} style={{ color: 'var(--action-primary)' }} />
        <span style={{
          fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--action-primary)',
        }}>
          {t('workout.program_today', { program: programName })}
        </span>
      </div>

      {/* Template name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--content-primary)', lineHeight: 1.15 }}>
            {template.name}
          </div>
        </div>
      </div>

      {/* Counts row */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--content-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Dumbbell size={11} style={{ color: 'var(--action-primary)' }} />
          {t('workout.exercise_count', { n: exerciseCount })}
        </span>
        <span style={{ fontSize: 12, color: 'var(--content-secondary)' }}>
          {t('workout.est_sets', { n: totalSets })}
        </span>
      </div>

      {/* CTA */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onReview(template)}
        disabled={disabled}
        className="btn-gold w-full min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        style={{
          padding: '14px', fontSize: 14, fontWeight: 800, borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <ClipboardCheck size={16} />
        {t('workout.review_today')}
      </motion.button>

      {/* Second session scheduled today */}
      {alsoToday.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alsoToday.map((t2) => (
            <button
              key={t2.templateKey}
              onClick={() => onReview(t2)}
              disabled={disabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
              }} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--content-muted)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>
                {t('workout.also_today')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t2.name}
              </span>
              <ChevronRight size={13} style={{ color: 'var(--content-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function RestDayCard({
  programName,
  nextWeekday,
  nextTemplateName,
  onTrainAnyway,
  disabled = false,
}: {
  programName: string;
  /** 0=Sunday … 6=Saturday, or null when the program has no other days. */
  nextWeekday: number | null;
  nextTemplateName: string | null;
  onTrainAnyway: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const todayIdx = new Date().getDay();
  const daysAway = nextWeekday === null ? null : ((nextWeekday - todayIdx + 7) % 7 || 7);
  const tip = t(TIP_KEY_OF_DAY);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="card"
      style={{
        padding: 16,
        background: 'linear-gradient(135deg, rgba(125,163,217,.10) 0%, rgba(125,163,217,.02) 100%)',
        border: '1px solid rgba(125,163,217,.22)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', top: -24, right: -24, width: 110, height: 110,
          background: 'radial-gradient(circle, rgba(125,163,217,.16) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Moon size={11} style={{ color: 'var(--status-info-fg)' }} />
        <span style={{
          fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--status-info-fg)',
        }}>
          {programName} · {t('workout.rest_day')}
        </span>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--content-primary)' }}>
        {t('workout.rest_nothing_today')}
      </div>

      {nextWeekday !== null && (
        <div style={{ fontSize: 12, color: 'var(--content-secondary)', marginTop: 4 }}>
          {t('workout.next_session')}{' '}
          <span style={{ color: 'var(--content-primary)', fontWeight: 600 }}>
            {nextTemplateName ?? 'Workout'}
          </span>{' '}
          · {daysAway === 1 ? t('workout.tomorrow') : t(WEEKDAY_KEYS[nextWeekday])}
        </div>
      )}

      <div style={{
        marginTop: 12, padding: '9px 11px', borderRadius: 10,
        background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
        fontSize: 12, color: 'var(--content-secondary)', lineHeight: 1.5,
      }}>
        {tip}
      </div>

      <button
        onClick={onTrainAnyway}
        disabled={disabled}
        className="btn-ghost w-full min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        style={{
          marginTop: 12, padding: '11px', fontSize: 12, fontWeight: 600, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <Dumbbell size={13} />
        {t('workout.train_anyway')}
      </button>
    </motion.div>
  );
}
