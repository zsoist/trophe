'use client';

import { useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { CardioDraft } from '@/lib/workout/workspace-state';

export interface CardioLogValues {
  durationMinutes: number;
  distanceKm: number | null;
  effort: number | null;
}

interface LiveCardioProps {
  draft: CardioDraft;
  mode: 'live' | 'retrospective';
  paused?: boolean;
  elapsedMs?: number;
  saving?: boolean;
  disabled?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onFinish?: (values: CardioLogValues) => void;
  onChange?: (values: CardioLogValues) => void;
  onSaveRetrospective?: (values: CardioLogValues) => void | Promise<void>;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function LiveCardio({ draft, mode, paused = false, elapsedMs = 0, saving = false, disabled = false, onPause, onResume, onFinish, onChange, onSaveRetrospective }: LiveCardioProps) {
  const { t } = useI18n();
  const [duration, setDuration] = useState(String(draft.durationMinutes));
  const [distance, setDistance] = useState(draft.distanceKm === null ? '' : String(draft.distanceKm));
  const [effort, setEffort] = useState(draft.effort === null ? '' : String(draft.effort));
  const [confirming, setConfirming] = useState(false);

  const values = (nextDistance = distance, nextEffort = effort): CardioLogValues => ({
    durationMinutes: mode === 'live' ? Math.floor(elapsedMs / 60_000) : Math.max(0, Number(duration) || 0),
    distanceKm: numberOrNull(nextDistance),
    effort: numberOrNull(nextEffort),
  });

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--action-primary)]">{t(`workout.cardio_${draft.activity}`)}</p>
        <h2 className="mt-1 text-xl font-bold text-[var(--content-primary)]">{draft.name}</h2>
      </div>
      {mode === 'retrospective' ? (
        <label className="block text-sm font-medium text-[var(--content-secondary)]">{t('workout.duration_minutes')}<input type="number" min="1" aria-label={t('workout.duration_minutes')} value={duration} onChange={(event) => setDuration(event.target.value)} className="input-dark mt-1 min-h-12 w-full text-base" /></label>
      ) : (
        <p className="text-3xl font-bold tabular-nums text-[var(--content-primary)]" aria-label={t('workout.active_duration')}>{Math.floor(elapsedMs / 60_000)}:{String(Math.floor(elapsedMs / 1_000) % 60).padStart(2, '0')}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-[var(--content-secondary)]">{t('workout.distance_optional')}<input type="number" min="0" step="any" inputMode="decimal" disabled={disabled} aria-label={t('workout.distance_optional')} value={distance} onChange={(event) => { const next = event.target.value; setDistance(next); onChange?.(values(next, effort)); }} className="input-dark mt-1 min-h-12 w-full text-base" /></label>
        <label className="text-sm font-medium text-[var(--content-secondary)]">{t('workout.effort')}<input type="number" min="1" max="10" step="1" inputMode="numeric" disabled={disabled} aria-label={t('workout.effort')} value={effort} onChange={(event) => { const next = event.target.value; setEffort(next); onChange?.(values(distance, next)); }} className="input-dark mt-1 min-h-12 w-full text-base" /></label>
      </div>

      {mode === 'live' ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={disabled} onClick={paused ? onResume : onPause} className="btn-ghost inline-flex min-h-12 items-center justify-center gap-2 rounded-xl disabled:opacity-50">{paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{t(paused ? 'workout.resume' : 'workout.pause')}</button>
          <button type="button" disabled={disabled} onClick={() => onFinish?.(values())} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] font-semibold text-[var(--status-danger-fg)] disabled:opacity-50"><Square size={17} aria-hidden="true" />{t('workout.finish')}</button>
        </div>
      ) : (
        <button type="button" disabled={saving || Number(duration) <= 0} onClick={() => setConfirming(true)} className="btn-gold min-h-12 w-full rounded-xl disabled:opacity-50">{t('workout.log_completed')}</button>
      )}

      {confirming ? (
        <div role="dialog" aria-modal="true" aria-label={t('workout.save_completed_question')} className="fixed inset-0 z-[var(--z-modal,60)] flex items-end justify-center bg-[var(--surface-overlay)] px-4 sm:items-center" onClick={() => setConfirming(false)}>
          <div className="glass-elevated safe-bottom w-full max-w-sm rounded-t-3xl p-5 sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--content-primary)]">{t('workout.save_completed_question')}</h3>
            <div className="mt-5 space-y-3">
              <button type="button" disabled={saving} onClick={() => void onSaveRetrospective?.(values())} className="btn-gold min-h-12 w-full rounded-xl disabled:opacity-50">{saving ? t('workout.saving') : t('workout.save_workout')}</button>
              <button type="button" disabled={saving} onClick={() => setConfirming(false)} className="btn-ghost min-h-12 w-full rounded-xl">{t('workout.keep_editing')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
