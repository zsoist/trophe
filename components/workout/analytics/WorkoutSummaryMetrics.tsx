'use client';

import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import { kgToDisplay, type WeightUnit } from '@/lib/workout/units';

export interface WorkoutSummarySet { completed?: boolean; isWarmup?: boolean; weightKg?: number | null; reps?: number | null; isPr?: boolean; }
export interface WorkoutSummarySession { id: string; durationMinutes?: number | null; sets: WorkoutSummarySet[]; }

export function WorkoutSummaryMetrics({ sessions, unit = 'kg' }: { sessions: WorkoutSummarySession[]; unit?: WeightUnit }) {
  const { lang, t } = useI18n();
  const locale = localeForLanguage(lang);
  const completed = sessions.flatMap((session) => session.sets).filter((set) => set.completed === true && set.isWarmup !== true);
  const duration = sessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
  const volume = completed.reduce((total, set) => total + (set.weightKg !== null && set.weightKg !== undefined && set.reps !== null && set.reps !== undefined ? set.weightKg * set.reps : 0), 0);
  const prs = completed.filter((set) => set.isPr).length;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const metrics = [
    { label: t('workout.analytics_summary_duration'), value: t('workout.analytics_summary_duration_value', { value: number.format(duration) }) },
    { label: t('workout.analytics_summary_working_sets'), value: t(completed.length === 1 ? 'workout.analytics_summary_working_set_value' : 'workout.analytics_summary_working_sets_value', { count: number.format(completed.length) }) },
    { label: t('workout.analytics_summary_lifted_volume'), value: t('workout.analytics_summary_volume_value', { value: number.format(kgToDisplay(volume, unit)), unit }) },
    { label: t('workout.analytics_summary_personal_records'), value: t(prs === 1 ? 'workout.analytics_summary_pr_value' : 'workout.analytics_summary_prs_value', { count: number.format(prs) }) },
  ];
  return <section aria-label={t('workout.analytics_summary_label')} className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-[var(--border-default)] py-4 sm:grid-cols-4">{metrics.map((metric) => <div key={metric.label}><p className="text-xs text-[var(--content-muted)]">{metric.label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[var(--content-primary)]">{metric.value}</p></div>)}</section>;
}
