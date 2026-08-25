'use client';

import { useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ConfirmSheet } from '@/components/ui';
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
  const [validationError, setValidationError] = useState(false);

  const values = (nextDistance = distance, nextEffort = effort): CardioLogValues => ({
    durationMinutes: mode === 'live' ? Math.floor(elapsedMs / 60_000) : Math.max(0, Number(duration) || 0),
    distanceKm: numberOrNull(nextDistance),
    effort: numberOrNull(nextEffort),
  });

  const validValues = (candidate: CardioLogValues): boolean => (
    (mode === 'live' || (Number.isFinite(candidate.durationMinutes) && candidate.durationMinutes > 0))
    && (candidate.distanceKm === null || (Number.isFinite(candidate.distanceKm) && candidate.distanceKm >= 0))
    && (candidate.effort === null || (Number.isFinite(candidate.effort) && candidate.effort >= 1 && candidate.effort <= 10))
  );

  const validate = (candidate: CardioLogValues): boolean => {
    const valid = validValues(candidate);
    setValidationError(!valid);
    return valid;
  };

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--action-primary)]">{t(`workout.cardio_${draft.activity}`)}</p>
        <h2 className="mt-1 text-xl font-bold text-[var(--content-primary)]">{draft.name}</h2>
      </div>
      {mode === 'retrospective' ? (
        <label className="block text-sm font-medium text-[var(--content-secondary)]">{t('workout.duration_minutes')}<input type="number" min="1" aria-label={t('workout.duration_minutes')} value={duration} onChange={(event) => setDuration(event.target.value)} className="input-dark mt-1 min-h-12 w-full font-mono text-base tabular-nums" /></label>
      ) : (
        <p className="font-mono text-3xl font-bold tabular-nums text-[var(--content-primary)]" aria-label={t('workout.active_duration')}>{Math.floor(elapsedMs / 60_000)}:{String(Math.floor(elapsedMs / 1_000) % 60).padStart(2, '0')}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-[var(--content-secondary)]">{t('workout.distance_optional')}<input type="number" min="0" step="any" inputMode="decimal" disabled={disabled} aria-label={t('workout.distance_optional')} value={distance} onChange={(event) => { const next = event.target.value; setDistance(next); setValidationError(false); onChange?.(values(next, effort)); }} className="input-dark mt-1 min-h-12 w-full font-mono text-base tabular-nums" /></label>
        <label className="text-sm font-medium text-[var(--content-secondary)]">{t('workout.effort')}<input type="number" min="1" max="10" step="1" inputMode="numeric" disabled={disabled} aria-label={t('workout.effort')} value={effort} onChange={(event) => { const next = event.target.value; setEffort(next); setValidationError(false); onChange?.(values(distance, next)); }} className="input-dark mt-1 min-h-12 w-full font-mono text-base tabular-nums" /></label>
      </div>

      {validationError ? <p role="alert" className="text-sm text-[var(--status-danger-fg)]">{t('workout.invalid_cardio_metrics')}</p> : null}

      {mode === 'live' ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={disabled} onClick={paused ? onResume : onPause} className="btn-ghost inline-flex min-h-12 items-center justify-center gap-2 rounded-xl disabled:opacity-50">{paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}{t(paused ? 'workout.resume' : 'workout.pause')}</button>
          <button type="button" disabled={disabled} onClick={() => { const candidate = values(); if (validate(candidate)) onFinish?.(candidate); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--status-danger-bg)] font-semibold text-[var(--status-danger-fg)] disabled:opacity-50"><Square size={17} aria-hidden="true" />{t('workout.finish')}</button>
        </div>
      ) : (
        <button type="button" disabled={saving} onClick={() => { if (validate(values())) setConfirming(true); }} className="btn-gold min-h-12 w-full rounded-xl disabled:opacity-50">{t('workout.log_completed')}</button>
      )}

      <ConfirmSheet
        open={confirming}
        title={t('workout.save_completed_question')}
        confirmLabel={t('workout.save_workout')}
        cancelLabel={t('workout.keep_editing')}
        loading={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          const candidate = values();
          if (!validate(candidate)) return;
          await onSaveRetrospective?.(candidate);
        }}
      />
    </section>
  );
}
