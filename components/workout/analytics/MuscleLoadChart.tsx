'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { calculateMuscleLoad } from '@/lib/workout/muscle-load';
import { resolveMuscleActivations } from '@/lib/workout/anatomy';

export type MuscleLoadRange = 'last' | 'week' | 'month' | 'all';
export interface MuscleLoadEntry { date: string; exercise: { name?: string | null; equipment?: string | null; muscleGroup?: string | null; muscle_group?: string | null }; sets: Array<{ completed?: boolean; isWarmup?: boolean; is_warmup?: boolean }>; }

export function muscleLoadRangeStart(range: MuscleLoadRange, now: string) {
  const date = new Date(`${now}T12:00:00`);
  if (range === 'all') return undefined;
  if (range === 'last') return undefined;
  if (range === 'week') { date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return dateKey(date); }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

/** Uses local date-only keys: Last is the most recent completed-session day; Week begins Monday; Month begins on day one. */
export function filterMuscleLoadEntries<T extends Pick<MuscleLoadEntry, 'date' | 'sets'>>(data: T[], range: MuscleLoadRange, now: string): T[] {
  const eligible = data.filter((entry) => entry.date <= now && entry.sets.some((set) => set.completed === true));
  if (range === 'last') {
    const lastDate = eligible.reduce<string | undefined>((latest, entry) => !latest || entry.date > latest ? entry.date : latest, undefined);
    return lastDate ? eligible.filter((entry) => entry.date === lastDate) : [];
  }
  const start = muscleLoadRangeStart(range, now);
  return start ? eligible.filter((entry) => entry.date >= start) : eligible;
}

export function MuscleLoadChart({ data, range, now = dateKey(new Date()) }: { data: MuscleLoadEntry[]; range: MuscleLoadRange; now?: string }) {
  const values = useMemo(() => {
    const loads = new Map<string, { label: string; value: number }>();
    for (const entry of filterMuscleLoadEntries(data, range, now)) {
      const activations = resolveMuscleActivations(entry.exercise);
      const calculated = calculateMuscleLoad({ activations, sets: entry.sets });
      for (const activation of activations) loads.set(activation.id, { label: activation.label, value: (loads.get(activation.id)?.value ?? 0) + (calculated[activation.id] ?? 0) });
    }
    return Array.from(loads.values()).filter((value) => value.value > 0).sort((a, b) => b.value - a.value);
  }, [data, now, range]);
  const max = values[0]?.value ?? 1;
  const rangeName = ({ last: 'Last workout', week: 'Weekly', month: 'Monthly', all: 'All-time' } as const)[range];

  if (!values.length) return <section className="rounded-xl bg-[var(--surface-subtle)] p-4" aria-labelledby="muscle-load-title"><h2 id="muscle-load-title" className="text-base font-semibold text-[var(--content-primary)]">Muscle load</h2><p className="mt-3 text-sm text-[var(--content-muted)]">Log completed strength sets with a resolved exercise to see role-weighted muscle load here.</p></section>;
  return <section className="rounded-xl bg-[var(--surface-subtle)] p-4" aria-labelledby="muscle-load-title"><div className="mb-4 flex items-center gap-2"><BarChart3 size={17} className="text-[var(--action-primary)]" /><h2 id="muscle-load-title" className="text-base font-semibold text-[var(--content-primary)]">Muscle load</h2></div>
    <div role="img" aria-label={`${rangeName} muscle load`} className="space-y-3">{values.map((item) => { const percent = Math.round((item.value / max) * 100); return <div key={item.label} aria-label={`${item.label} ${percent}%`}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="text-[var(--content-secondary)]">{item.label}</span><span className="tabular-nums font-semibold text-[var(--content-primary)]">{percent}% <span className="font-normal text-[var(--content-muted)]">({item.value.toFixed(2)} load)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--action-primary)]" style={{ width: `${percent}%` }} /></div></div>; })}</div>
    <table className="sr-only" aria-label={`${rangeName} muscle load values`}><caption>{rangeName} muscle load values</caption><thead><tr><th>Muscle</th><th>Role-weighted load</th></tr></thead><tbody>{values.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value.toFixed(2)}</td></tr>)}</tbody></table>
  </section>;
}
