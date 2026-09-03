import { Clock3, Dumbbell } from 'lucide-react';

interface WorkoutTodayRailProps {
  title: string;
  source: string;
  readiness: string;
  workSummary: string;
  nextAction: string;
  estimatedDurationMinutes?: number | null;
}

export function WorkoutTodayRail({ title, source, readiness, workSummary, nextAction, estimatedDurationMinutes = null }: WorkoutTodayRailProps) {
  return (
    <section aria-label="Today's workout status" className="overflow-hidden rounded-[14px] border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
      <div className="px-4 py-3">
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--content-primary)]">{title}</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--content-secondary)]">
          <span className="inline-flex items-center gap-1.5"><Dumbbell aria-hidden="true" size={13} />{workSummary}</span>
          {estimatedDurationMinutes ? <span className="inline-flex items-center gap-1.5 font-mono tabular-nums"><Clock3 aria-hidden="true" size={13} />{estimatedDurationMinutes} min</span> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-[var(--workout-rail)] min-[390px]:grid-cols-3">
        <div className="border-r border-[var(--workout-rail)] px-3 py-2.5">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">Source</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{source}</dd>
        </div>
        <div className="px-3 py-2.5 min-[390px]:border-r min-[390px]:border-[var(--workout-rail)]">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">Readiness</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{readiness}</dd>
        </div>
        <div className="col-span-2 border-t border-[var(--workout-rail)] px-3 py-2.5 min-[390px]:col-span-1 min-[390px]:border-t-0">
          <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--content-muted)]">Next step</dt>
          <dd className="mt-1 text-xs font-semibold text-[var(--content-primary)]">{nextAction}</dd>
        </div>
      </dl>
    </section>
  );
}
