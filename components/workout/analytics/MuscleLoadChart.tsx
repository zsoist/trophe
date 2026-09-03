'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import { calculateMuscleLoad } from '@/lib/workout/muscle-load';
import { resolveMuscleActivations, type AnatomyMuscleId } from '@/lib/workout/anatomy';

export type MuscleLoadRange = 'last' | 'week' | 'month' | 'all';
export interface MuscleLoadEntry {
  sessionId: string;
  date: string;
  exercise: { name?: string | null; equipment?: string | null; muscleGroup?: string | null; muscle_group?: string | null };
  sets: Array<{ completed?: boolean; isWarmup?: boolean; is_warmup?: boolean }>;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function muscleLoadRangeStart(range: MuscleLoadRange, now: string) {
  const date = new Date(`${now}T12:00:00`);
  if (range === 'all' || range === 'last') return undefined;
  if (range === 'week') {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return dateKey(date);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Last uses the exact latest terminal session, even when it has no strength rows. */
export function filterMuscleLoadEntries<T extends Pick<MuscleLoadEntry, 'sessionId' | 'date' | 'sets'>>(
  data: T[],
  range: MuscleLoadRange,
  now: string,
  latestCompletedSessionId?: string,
): T[] {
  const completed = data.filter((entry) => entry.sets.some((set) => set.completed === true));
  if (range === 'last') {
    return latestCompletedSessionId ? completed.filter((entry) => entry.sessionId === latestCompletedSessionId) : [];
  }
  const eligible = completed.filter((entry) => entry.date <= now);
  const start = muscleLoadRangeStart(range, now);
  return start ? eligible.filter((entry) => entry.date >= start) : eligible;
}

const muscleCopyKey = (id: AnatomyMuscleId) => `workout.atlas_muscle_${id.replaceAll('-', '_')}`;

export function MuscleLoadChart({
  data,
  range,
  now = dateKey(new Date()),
  latestCompletedSessionId,
}: {
  data: MuscleLoadEntry[];
  range: MuscleLoadRange;
  now?: string;
  latestCompletedSessionId?: string;
}) {
  const { lang, t } = useI18n();
  const locale = localeForLanguage(lang);
  const filtered = useMemo(() => filterMuscleLoadEntries(data, range, now, latestCompletedSessionId), [data, latestCompletedSessionId, now, range]);
  const values = useMemo(() => {
    const loads = new Map<AnatomyMuscleId, number>();
    for (const entry of filtered) {
      const activations = resolveMuscleActivations(entry.exercise);
      const calculated = calculateMuscleLoad({ activations, sets: entry.sets });
      for (const activation of activations) loads.set(activation.id, (loads.get(activation.id) ?? 0) + (calculated[activation.id] ?? 0));
    }
    return [...loads.entries()].filter(([, value]) => value > 0).sort((left, right) => right[1] - left[1]);
  }, [filtered]);
  const max = values[0]?.[1] ?? 1;
  const rangeName = t(`workout.analytics_range_name_${range}`);

  if (!values.length) {
    const message = range === 'last' && latestCompletedSessionId
      ? t('workout.analytics_muscle_load_last_empty')
      : t('workout.analytics_muscle_load_empty');
    return <section className="rounded-xl bg-[var(--surface-subtle)] p-4" aria-labelledby="muscle-load-title"><h2 id="muscle-load-title" className="text-base font-semibold text-[var(--content-primary)]">{t('workout.analytics_muscle_load_title')}</h2><p className="mt-3 text-sm text-[var(--content-muted)]">{message}</p></section>;
  }

  return <section className="rounded-xl bg-[var(--surface-subtle)] p-4" aria-labelledby="muscle-load-title">
    <div className="mb-4 flex items-center gap-2"><BarChart3 size={17} className="text-[var(--action-primary)]" /><h2 id="muscle-load-title" className="text-base font-semibold text-[var(--content-primary)]">{t('workout.analytics_muscle_load_title')}</h2></div>
    <div role="img" aria-label={t('workout.analytics_muscle_load_chart', { range: rangeName })} className="space-y-3">{values.map(([id, value]) => {
      const label = t(muscleCopyKey(id));
      const percent = Math.round((value / max) * 100);
      const formattedValue = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      return <div key={id} aria-label={t('workout.analytics_muscle_load_item', { muscle: label, percent })}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="text-[var(--content-secondary)]">{label}</span><span className="tabular-nums font-semibold text-[var(--content-primary)]">{t('workout.analytics_muscle_load_value', { percent, value: formattedValue })}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--action-primary)]" style={{ width: `${percent}%` }} /></div></div>;
    })}</div>
    <table className="sr-only" aria-label={t('workout.analytics_muscle_load_table', { range: rangeName })}><caption>{t('workout.analytics_muscle_load_table', { range: rangeName })}</caption><thead><tr><th>{t('workout.analytics_muscle')}</th><th>{t('workout.analytics_role_weighted_load')}</th></tr></thead><tbody>{values.map(([id, value]) => <tr key={id}><td>{t(muscleCopyKey(id))}</td><td>{new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}</td></tr>)}</tbody></table>
  </section>;
}
