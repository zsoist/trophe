import { CalendarDays } from 'lucide-react';
import type { WorkoutHomeProgram } from '@/components/workout/workspace/WorkoutHome';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface WorkoutScheduleStripProps {
  program: WorkoutHomeProgram | null;
  todayName: string | null;
  todaySource: string;
}

export function WorkoutScheduleStrip({ program, todayName, todaySource }: WorkoutScheduleStripProps) {
  const programName = program?.programName ?? 'Coach schedule';
  const rows = [
    ...(todayName ? [{ when: 'Today', name: todayName, note: program?.programName ?? (todaySource === 'Recommended by Trophē' ? 'Adaptive plan' : 'Today’s plan') }] : []),
    ...(program?.alsoToday ?? []).map((template) => ({ when: 'Later today', name: template.name, note: programName })),
    ...(program?.nextTemplateName ? [{ when: program.nextWeekday == null ? 'Next' : WEEKDAYS[program.nextWeekday] ?? 'Next', name: program.nextTemplateName, note: programName }] : []),
  ];

  return (
    <section aria-labelledby="workout-schedule-title">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays aria-hidden="true" size={16} className="text-[var(--action-primary)]" />
        <h2 id="workout-schedule-title" className="text-sm font-bold tracking-[-0.01em] text-[var(--content-primary)]">Schedule</h2>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
        {rows.length ? <ol>{rows.map((row, index) => (
          <li key={`${row.when}:${row.name}`} className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 ${index ? 'border-t border-[var(--workout-rail)]' : ''}`}>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.07em] text-[var(--content-muted)]">{row.when}</span>
            <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-[var(--content-primary)]">{row.name}</strong><span className="block truncate text-xs text-[var(--content-muted)]">{row.note}</span></span>
          </li>
        ))}</ol> : <p className="px-3 py-3 text-sm text-[var(--content-secondary)]">No coach session is scheduled. Build a workout that fits today.</p>}
      </div>
    </section>
  );
}
