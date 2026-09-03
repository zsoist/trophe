'use client';

import { TrendingUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { localeForLanguage } from '@/lib/i18n-locale';
import { kgToDisplay, type WeightUnit } from '@/lib/workout/units';

export interface ExerciseProgressEntry {
  sessionId?: string;
  date: string;
  weightKg: number | null;
  reps: number | null;
}

/** One evidence point per session: highest working-set weight, then reps. */
export function aggregateExerciseProgress(data: ExerciseProgressEntry[]) {
  const bySession = new Map<string, ExerciseProgressEntry>();
  for (const entry of data) {
    if (entry.weightKg === null || entry.reps === null) continue;
    const key = entry.sessionId ?? entry.date;
    const previous = bySession.get(key);
    if (!previous || entry.weightKg > (previous.weightKg ?? -1) || (entry.weightKg === previous.weightKg && entry.reps > (previous.reps ?? -1))) bySession.set(key, entry);
  }
  return [...bySession.values()].sort((left, right) => left.date.localeCompare(right.date) || (left.sessionId ?? '').localeCompare(right.sessionId ?? ''));
}

function downsample<T>(entries: T[], limit: number): T[] {
  if (entries.length <= limit) return entries;
  return Array.from({ length: limit }, (_, index) => entries[Math.round((index / (limit - 1)) * (entries.length - 1))]);
}

export function ExerciseProgressChart({
  exerciseName,
  data,
  unit = 'kg',
}: {
  exerciseName: string;
  data: ExerciseProgressEntry[];
  unit?: WeightUnit;
}) {
  const { lang, t } = useI18n();
  const locale = localeForLanguage(lang);
  const evidence = aggregateExerciseProgress(data);
  if (!evidence.length) return <section className="rounded-xl bg-[var(--surface-subtle)] p-4"><h2 className="text-base font-semibold text-[var(--content-primary)]">{t('workout.analytics_progress_title')}</h2><p className="mt-3 text-sm text-[var(--content-muted)]">{t('workout.analytics_progress_empty')}</p></section>;
  if (evidence.length < 2) return <section className="rounded-xl bg-[var(--surface-subtle)] p-4"><h2 className="text-base font-semibold text-[var(--content-primary)]">{t('workout.analytics_progress_title')}</h2><p className="mt-3 text-sm text-[var(--content-muted)]">{t('workout.analytics_progress_insufficient')}</p></section>;

  const maxWeight = Math.max(...evidence.map((entry) => entry.weightKg ?? 0), 1);
  const chartEvidence = downsample(evidence, 48);
  const detailEvidence = evidence.slice(-12);
  const formatNumber = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const formatDate = (date: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));

  return <section className="rounded-xl bg-[var(--surface-subtle)] p-4" aria-labelledby="exercise-progress-title">
    <div className="mb-4 flex items-center gap-2"><TrendingUp size={17} className="text-[var(--action-primary)]" /><h2 id="exercise-progress-title" className="text-base font-semibold text-[var(--content-primary)]">{t('workout.analytics_progress_heading', { exercise: exerciseName })}</h2></div>
    <svg role="img" aria-label={t('workout.analytics_progress_chart', { exercise: exerciseName })} viewBox="0 0 300 96" className="w-full" style={{ maxHeight: 144 }}><path d={`M 12 ${84 - ((chartEvidence[0].weightKg ?? 0) / maxWeight) * 64} ${chartEvidence.slice(1).map((entry, index) => `L ${12 + ((index + 1) / (chartEvidence.length - 1)) * 276} ${84 - ((entry.weightKg ?? 0) / maxWeight) * 64}`).join(' ')}`} fill="none" stroke="var(--action-primary)" strokeWidth="3" strokeLinecap="round" />{chartEvidence.map((entry, index) => <circle key={`${entry.sessionId ?? entry.date}-${index}`} cx={12 + (index / (chartEvidence.length - 1)) * 276} cy={84 - ((entry.weightKg ?? 0) / maxWeight) * 64} r="3.5" fill="var(--action-primary)" />)}</svg>
    <table className="mt-3 w-full text-left text-sm" aria-label={t('workout.analytics_progress_table', { exercise: exerciseName })}><thead className="text-[var(--content-muted)]"><tr><th className="py-2 font-medium">{t('exercisecompare.date')}</th><th className="py-2 font-medium">{t('workout.weight')}</th><th className="py-2 font-medium">{t('workout.reps')}</th><th className="py-2 text-right font-medium">{t('workout.volume')}</th></tr></thead><tbody>{detailEvidence.map((entry, index) => {
      const weight = `${formatNumber(kgToDisplay(entry.weightKg!, unit))} ${unit}`;
      const volume = `${formatNumber(kgToDisplay(entry.weightKg! * entry.reps!, unit))} ${unit}`;
      return <tr key={`${entry.sessionId ?? entry.date}-${index}`} aria-label={t('workout.analytics_progress_row', { weight, reps: entry.reps!, volume })} className="border-t border-[var(--border-default)] text-[var(--content-secondary)]"><td className="py-2">{formatDate(entry.date)}</td><td className="py-2 tabular-nums">{weight}</td><td className="py-2 tabular-nums">{entry.reps}</td><td className="py-2 text-right tabular-nums">{volume}</td></tr>;
    })}</tbody></table>
  </section>;
}
