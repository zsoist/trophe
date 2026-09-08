'use client';
import { useEffect, useRef, useState } from 'react';
import type { MeasurementValues, ProgressMeasurement } from '@/agents/coach-assistant/progress-contracts';
import type { ProgressController, ProgressState, ProgressTransport } from './progress-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

const value = (raw: string) => raw.trim() === '' ? null : Number(raw);
export function ProgressPanel({ controller, state, transport, onSaved }: { controller: ProgressController; state: ProgressState; transport: ProgressTransport; onSaved?: () => void }) {
  const { t, lang } = useGlobalCoachI18n();
  const [date, setDate] = useState(''), [weight, setWeight] = useState(''), [bodyFat, setBodyFat] = useState(''), [waist, setWaist] = useState('');
  const review = useRef<HTMLElement>(null), receipt = useRef<HTMLParagraphElement>(null), lastReceipt = useRef<string | null>(null);
  useEffect(() => { if (state.proposal) review.current?.focus(); }, [state.proposal]);
  useEffect(() => { if (!state.receipt || state.pending || state.error || lastReceipt.current === state.receipt.id) return; lastReceipt.current = state.receipt.id; receipt.current?.focus(); onSaved?.(); }, [onSaved, state.error, state.pending, state.receipt]);
  const formatDate = (input: string) => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${input}T12:00:00Z`));
  const describe = (item: MeasurementValues | ProgressMeasurement) => [formatDate(item.measuredDate), item.weightKg === null ? null : `${item.weightKg} kg`, item.bodyFatPct === null ? null : `${item.bodyFatPct}%`, item.waistCm === null ? null : `${item.waistCm} cm`].filter(Boolean).join(' · ');
  const parsed: MeasurementValues = { measuredDate: date, weightKg: Number(weight), bodyFatPct: value(bodyFat), waistCm: value(waist) };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.weightKg) && parsed.weightKg > 0 && (parsed.bodyFatPct === null || Number.isFinite(parsed.bodyFatPct) && parsed.bodyFatPct >= 0 && parsed.bodyFatPct <= 100) && (parsed.waistCm === null || Number.isFinite(parsed.waistCm) && parsed.waistCm > 0);
  const latest = state.snapshot?.measurements.at(-1);
  const locked = state.pending || state.uncertain;
  return <section className={styles.foodReview} aria-label={t('global_coach.progress_title')}>
    <h3>{t('global_coach.progress_title')}</h3>
    <div className={styles.periods} aria-label={t('global_coach.progress_window')}>{([30, 90, 365] as const).map(days => <button key={days} type="button" aria-pressed={state.days === days} disabled={locked} onClick={() => void controller.read(transport, days)}>{t('global_coach.progress_days', { days })}</button>)}</div>
    {state.receipt && <p ref={receipt} tabIndex={-1} role="status">{t(state.pending || state.error ? 'global_coach.progress_refresh_pending' : 'global_coach.progress_saved')}</p>}
    {state.uncertain || state.receipt && state.error ? <div role="status"><p>{t('global_coach.uncertain')}</p><button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button></div> : state.proposal ? <section ref={review} tabIndex={-1} aria-label={t('global_coach.progress_review')}>
      <p>{t('global_coach.before')}: {t('global_coach.progress_none')}</p>
      <p>{t('global_coach.after')}: {describe(state.proposal.after)}</p>
      <div className={styles.actions}><button type="button" disabled={locked} onClick={() => controller.discard()}>{t('general.cancel')}</button><button type="button" disabled={locked} onClick={() => void controller.apply(transport)}>{t('global_coach.progress_confirm')}</button></div>
    </section> : state.snapshot ? <>
      <p>{latest ? t('global_coach.progress_latest', { value: describe(latest) }) : t('global_coach.progress_empty', { days: state.days })}</p>
      <div className={styles.progressFields}>
        <label>{t('global_coach.progress_date')}<input type="date" value={date} disabled={locked} onChange={event => setDate(event.target.value)} /></label>
        <label>{t('global_coach.progress_weight')}<input type="number" inputMode="decimal" step="0.1" value={weight} disabled={locked} onChange={event => setWeight(event.target.value)} /></label>
        <label>{t('global_coach.progress_body_fat')}<input type="number" inputMode="decimal" step="0.1" value={bodyFat} disabled={locked} onChange={event => setBodyFat(event.target.value)} /></label>
        <label>{t('global_coach.progress_waist')}<input type="number" inputMode="decimal" step="0.1" value={waist} disabled={locked} onChange={event => setWaist(event.target.value)} /></label>
      </div>
      <button type="button" disabled={locked || !valid} onClick={() => void controller.propose(parsed, transport)}>{t('global_coach.progress_review')}</button>
    </> : null}
    {state.pending && <p role="status">{t('global_coach.pending')}</p>}
    {state.error && !state.uncertain && !state.receipt && <div role="status"><p>{t('global_coach.progress_unavailable')}</p><button type="button" disabled={locked} onClick={() => void controller.read(transport)}>{t('global_coach.progress_reload')}</button></div>}
  </section>;
}
