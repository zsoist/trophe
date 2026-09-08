'use client';
import { useState } from 'react';
import { FoodQuantityController, type FoodState, type FoodTransport } from './food-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';
export function FoodQuantityPanel({ controller, state, transport }: { controller: FoodQuantityController; state: FoodState; transport: FoodTransport }) {
  const { t } = useGlobalCoachI18n();
  const [grams, setGrams] = useState('');
  const proposal = state.proposal;
  const saved = Boolean(state.receipt && !state.pending && !state.error);
  const selectionError = Boolean(state.intentId && (state.error === 'ambiguous_selection' || state.error === 'not_found'));
  const errorKey = state.error === 'ambiguous_selection' ? 'global_coach.food_ambiguous_selection'
    : state.error === 'not_found' ? 'global_coach.food_not_found' : 'global_coach.food_changed';
  return <section className={styles.foodReview} aria-label={t('global_coach.food_quantity')}>
    <h3>{state.entry?.foodName ?? t('global_coach.food_quantity')}</h3>
    {state.entry && <p>{t('global_coach.food_current', { grams: state.entry.grams ?? '—', calories: state.entry.calories })}</p>}
    {saved && <p role="status">{t('global_coach.food_saved')}</p>}
    {saved && <button type="button" onClick={() => controller.dismiss()}>{t('global_coach.food_done')}</button>}
    {state.uncertain || state.receipt && state.error ? <button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.food_check')}</button> : proposal ? <>
      <table><caption>{t('global_coach.food_review')}</caption><thead><tr><th scope="col">{t('global_coach.food_value')}</th><th scope="col">{t('global_coach.food_before')}</th><th scope="col">{t('global_coach.food_after')}</th></tr></thead><tbody>
        {(['grams', 'calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG'] as const).map(key => <tr key={key}><th scope="row">{t(`global_coach.food_${key}`)}</th><td>{proposal.before[key] ?? '—'}</td><td>{proposal.after[key] ?? '—'}</td></tr>)}
      </tbody></table>
      <button type="button" disabled={state.pending} onClick={() => void controller.apply(transport)}>{t('global_coach.food_confirm')}</button>
      <button type="button" disabled={state.pending} onClick={() => controller.discard()}>{t('general.cancel')}</button>
    </> : state.entry && !state.pending ? <>
      <label>{t('global_coach.food_grams')}<input type="number" min="1" max="10000" step="any" value={grams} onChange={event => setGrams(event.target.value)} /></label>
      <button type="button" disabled={!Number.isFinite(Number(grams)) || Number(grams) <= 0 || Number(grams) > 10000} onClick={() => void controller.propose(Number(grams), transport)}>{t('global_coach.food_review')}</button>
    </> : null}
    {state.pending && <p role="status">{t('global_coach.pending')}</p>}
    {state.error && !state.uncertain && <p role="status">{t(state.receipt ? 'global_coach.food_saved_refresh' : errorKey, { grams: state.previousGrams ?? '—' })}</p>}
    {state.error && !state.uncertain && !state.receipt && (selectionError
      ? <button type="button" disabled={state.pending} onClick={() => controller.dismiss()}>{t('global_coach.food_close_review')}</button>
      : <button type="button" disabled={state.pending} onClick={() => void controller.retry(transport)}>{t('global_coach.food_reload')}</button>)}
  </section>;
}
