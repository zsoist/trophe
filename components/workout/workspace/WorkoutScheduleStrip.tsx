'use client';

import { CalendarDays } from 'lucide-react';
import type { WorkoutHomeProgram } from '@/components/workout/workspace/WorkoutHome';
import { useI18n } from '@/lib/i18n';

interface WorkoutScheduleStripProps {
  program: WorkoutHomeProgram | null;
  todayName: string | null;
  todaySource: string;
}

export function WorkoutScheduleStrip({ program, todayName, todaySource }: WorkoutScheduleStripProps) {
  const { t } = useI18n();
  const programName = program?.programName ?? t('workout.home_coach_schedule');
  const todayNote = todaySource === t('workout.home_source_recommended')
    ? t('workout.home_adaptive_plan')
    : todaySource === t('workout.home_source_coach')
      ? programName
      : todaySource;
  const rows = [
    ...(todayName ? [{ when: t('general.today'), name: todayName, note: todayNote }] : []),
    ...(program?.alsoToday ?? []).map((template) => ({ when: t('workout.home_later_today'), name: template.name, note: programName })),
    ...(program?.nextTemplateName ? [{ when: program.nextWeekday == null ? t('workout.home_next') : t(`workout.day_${program.nextWeekday}`), name: program.nextTemplateName, note: programName }] : []),
  ];

  return (
    <section aria-labelledby="workout-schedule-title">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays aria-hidden="true" size={16} className="text-[var(--action-primary)]" />
        <h2 id="workout-schedule-title" className="text-sm font-bold tracking-[-0.01em] text-[var(--content-primary)]">{t('workout.home_schedule')}</h2>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
        {rows.length ? <ol>{rows.map((row, index) => (
          <li key={`${row.when}:${row.name}`} className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 ${index ? 'border-t border-[var(--workout-rail)]' : ''}`}>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--content-muted)]">{row.when}</span>
            <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-[var(--content-primary)]">{row.name}</strong><span className="block truncate text-xs text-[var(--content-muted)]">{row.note}</span></span>
          </li>
        ))}</ol> : <p className="px-3 py-3 text-sm text-[var(--content-secondary)]">{t('workout.home_schedule_empty')}</p>}
      </div>
    </section>
  );
}
