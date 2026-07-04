'use client';

/**
 * Landing hero cards for the client workout page.
 *
 *   TodayProgramCard — coach program assigned AND today has a template:
 *     program name, template name/dayLabel, exercise + set counts,
 *     difficulty chip, big "Start workout" CTA into guided mode.
 *
 *   RestDayCard — program assigned, nothing scheduled today:
 *     next scheduled day + recovery tip + "Train anyway" (freestyle).
 */

import { motion } from 'framer-motion';
import { CalendarDays, ChevronRight, Dumbbell, Moon, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { TemplateExercise } from '@/lib/types';

// `label` is an i18n key — resolved with t() at render.
const DIFFICULTY_STYLE: Record<string, { bg: string; border: string; fg: string; label: string }> = {
  beginner:     { bg: 'rgba(101,211,135,.12)', border: 'rgba(101,211,135,.3)', fg: '#65D387', label: 'workout.difficulty_beginner' },
  intermediate: { bg: 'color-mix(in srgb, var(--accent, #D4A853) 12%, transparent)',  border: 'color-mix(in srgb, var(--accent, #D4A853) 30%, transparent)',  fg: 'var(--accent, #D4A853)', label: 'workout.difficulty_intermediate' },
  advanced:     { bg: 'rgba(232,122,110,.12)', border: 'rgba(232,122,110,.3)', fg: '#E87A6E', label: 'workout.difficulty_advanced' },
};

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
  templateId: string;
  name: string;
  dayLabel: string | null;
  difficulty: string | null;
  exercises: TemplateExercise[];
}

export function TodayProgramCard({
  programName,
  template,
  alsoToday,
  onStart,
  starting,
}: {
  programName: string;
  template: TodayTemplateSummary;
  /** Extra templates scheduled for the same weekday (sort > 0). */
  alsoToday: TodayTemplateSummary[];
  onStart: (t: TodayTemplateSummary) => void;
  starting: boolean;
}) {
  const { t } = useI18n();
  const diff = DIFFICULTY_STYLE[template.difficulty ?? 'intermediate'] ?? DIFFICULTY_STYLE.intermediate;
  const exerciseCount = template.exercises.length;
  const totalSets = template.exercises.reduce((s, e) => s + (e.target_sets || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="card-g"
      style={{
        padding: 16,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent, #D4A853) 14%, transparent) 0%, color-mix(in srgb, var(--accent, #D4A853) 3%, transparent) 100%)',
        border: '1px solid color-mix(in srgb, var(--accent, #D4A853) 32%, transparent)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', top: -24, right: -24, width: 120, height: 120,
          background: 'radial-gradient(circle, color-mix(in srgb, var(--accent, #D4A853) 18%, transparent) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Eyebrow: program name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CalendarDays size={11} style={{ color: 'var(--accent, #D4A853)' }} />
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--accent, #D4A853)',
        }}>
          {t('workout.program_today', { program: programName })}
        </span>
      </div>

      {/* Template name + day label */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--t1,#FAFAF9)', lineHeight: 1.15 }}>
            {template.name}
          </div>
          {template.dayLabel && (
            <div style={{ fontSize: 11, color: 'var(--t3,#A8A29E)', marginTop: 2 }}>{template.dayLabel}</div>
          )}
        </div>
        <span style={{
          flexShrink: 0, padding: '3px 9px', borderRadius: 20, fontSize: 9.5, fontWeight: 700,
          background: diff.bg, border: `1px solid ${diff.border}`, color: diff.fg,
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>
          {t(diff.label)}
        </span>
      </div>

      {/* Counts row */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Dumbbell size={11} style={{ color: 'var(--accent, #D4A853)' }} />
          {t('workout.exercise_count', { n: exerciseCount })}
        </span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>
          {t('workout.est_sets', { n: totalSets })}
        </span>
      </div>

      {/* CTA */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onStart(template)}
        disabled={starting}
        className="btn-gold w-full"
        style={{
          padding: '14px', fontSize: 14, fontWeight: 800, borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: starting ? 0.7 : 1,
        }}
      >
        <Play size={16} />
        {starting ? t('workout.loading') : t('workout.start_workout')}
      </motion.button>

      {/* Second session scheduled today */}
      {alsoToday.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alsoToday.map((t2) => (
            <button
              key={t2.templateId}
              onClick={() => onStart(t2)}
              disabled={starting}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>
                {t('workout.also_today')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t2.name}
              </span>
              <ChevronRight size={13} style={{ color: 'var(--t4)', flexShrink: 0 }} />
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
}: {
  programName: string;
  /** 0=Sunday … 6=Saturday, or null when the program has no other days. */
  nextWeekday: number | null;
  nextTemplateName: string | null;
  onTrainAnyway: () => void;
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
        <Moon size={11} style={{ color: 'var(--info,#7DA3D9)' }} />
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--info,#7DA3D9)',
        }}>
          {programName} · {t('workout.rest_day')}
        </span>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--t1,#FAFAF9)' }}>
        {t('workout.rest_nothing_today')}
      </div>

      {nextWeekday !== null && (
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          {t('workout.next_session')}{' '}
          <span style={{ color: 'var(--t1)', fontWeight: 600 }}>
            {nextTemplateName ?? 'Workout'}
          </span>{' '}
          · {daysAway === 1 ? t('workout.tomorrow') : t(WEEKDAY_KEYS[nextWeekday])}
        </div>
      )}

      <div style={{
        marginTop: 12, padding: '9px 11px', borderRadius: 10,
        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
        fontSize: 11, color: 'var(--t3)', lineHeight: 1.5,
      }}>
        {tip}
      </div>

      <button
        onClick={onTrainAnyway}
        className="btn-ghost w-full"
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
