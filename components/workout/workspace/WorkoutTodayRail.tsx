'use client';

import { Clock3, Dumbbell } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface WorkoutTodayRailProps {
  title: string;
  source: string;
  readiness: string;
  workSummary: string;
  nextAction: string;
  estimatedDurationMinutes?: number | null;
}

export function WorkoutTodayRail({ title, source, readiness, workSummary, nextAction, estimatedDurationMinutes = null }: WorkoutTodayRailProps) {
  const { t } = useI18n();
  return (
    <section aria-label={t('workout.home_status_label')} className="workout-today-rail overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
      <div className="workout-today-rail__headline px-4 py-3">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--content-primary)]">{title}</h2>
        <div className="workout-today-rail__metrics mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--content-secondary)]">
          <span className="inline-flex items-center gap-1.5"><Dumbbell aria-hidden="true" size={13} />{workSummary}</span>
          {estimatedDurationMinutes ? <span className="inline-flex items-center gap-1.5 font-mono tabular-nums"><Clock3 aria-hidden="true" size={13} />{t('workout.history_minutes', { n: estimatedDurationMinutes })}</span> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-[var(--workout-rail)] min-[390px]:grid-cols-3">
        <div className="border-r border-[var(--workout-rail)] px-3 py-2.5">
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">{t('workout.home_source_label')}</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{source}</dd>
        </div>
        <div className="px-3 py-2.5 min-[390px]:border-r min-[390px]:border-[var(--workout-rail)]">
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">{t('workout.home_readiness_label')}</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{readiness}</dd>
        </div>
        <div className="col-span-2 border-t border-[var(--workout-rail)] px-3 py-2.5 min-[390px]:col-span-1 min-[390px]:border-t-0">
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">{t('workout.home_next_step_label')}</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{nextAction}</dd>
        </div>
      </dl>
    </section>
  );
}
