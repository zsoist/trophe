'use client';

export interface WorkoutSummarySet { completed?: boolean; isWarmup?: boolean; weightKg?: number | null; reps?: number | null; isPr?: boolean; }
export interface WorkoutSummarySession { id: string; durationMinutes?: number | null; sets: WorkoutSummarySet[]; }
export function WorkoutSummaryMetrics({ sessions }: { sessions: WorkoutSummarySession[] }) {
  const completed = sessions.flatMap((session) => session.sets).filter((set) => set.completed === true && set.isWarmup !== true);
  const duration = sessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
  const volume = completed.reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
  const prs = completed.filter((set) => set.isPr).length;
  const metrics = [{ label: 'Duration', value: `${duration} min` }, { label: 'Working sets', value: `${completed.length} working set${completed.length === 1 ? '' : 's'}` }, { label: 'Lifted volume', value: `${volume} kg` }, { label: 'Personal records', value: `${prs} PR${prs === 1 ? '' : 's'}` }];
  return <section aria-label="Workout summary metrics" className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-[var(--border-default)] py-4 sm:grid-cols-4">{metrics.map((metric) => <div key={metric.label}><p className="text-xs text-[var(--content-muted)]">{metric.label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-[var(--content-primary)]">{metric.value}</p></div>)}</section>;
}
