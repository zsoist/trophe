'use client';
import { useEffect, useRef, useState } from 'react';
import type { FoodPreferenceSnapshot } from '@/agents/coach-assistant/food-preference-contracts';
import type { DietController, DietState, DietTransport } from './diet-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';
type Pattern = FoodPreferenceSnapshot['preferences']['dietPattern'];
export function DietPanel({ controller, state, transport }: { controller: DietController; state: DietState; transport: DietTransport }) {
  const { t } = useGlobalCoachI18n();
  const [choice, setChoice] = useState<{ version: string; value: Pattern } | null>(null);
  const review = useRef<HTMLElement>(null), receipt = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.proposal) review.current?.focus(); }, [state.proposal]);
  useEffect(() => { if (state.receipt) receipt.current?.focus(); }, [state.receipt]);
  const selected = choice?.version === state.profile?.version ? choice?.value ?? null : state.profile?.preferences.dietPattern ?? null;
  const label = (value: Pattern) => t(`global_coach.diet_${value ?? 'undeclared'}`);
  const locked = state.pending || state.uncertain;
  return <section className={styles.foodReview} aria-label={t('global_coach.diet_title')}>
    <h3>{t('global_coach.diet_title')}</h3>
    {state.receipt && <p ref={receipt} tabIndex={-1} role="status">{t(state.pending || state.error ? 'global_coach.diet_refresh_pending' : 'global_coach.diet_saved')}</p>}
    {state.uncertain || state.receipt && state.error ? <div role="status"><p>{t('global_coach.uncertain')}</p><button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button></div> : state.proposal ? <section ref={review} tabIndex={-1} aria-label={t('global_coach.review_change')}>
      <p>{t('global_coach.before')}: {label(state.proposal.before.dietPattern)}</p>
      <p>{t('global_coach.after')}: {label(state.proposal.after.dietPattern)}</p>
      <div className={styles.actions}><button type="button" disabled={locked} onClick={() => controller.discard()}>{t('general.cancel')}</button><button type="button" disabled={locked} onClick={() => void controller.apply(transport)}>{t('global_coach.confirm_change')}</button></div>
    </section> : state.profile ? <>
      <label>{t('global_coach.diet_title')}<select disabled={locked} value={selected ?? ''} onChange={event => setChoice({ version: state.profile!.version, value: (event.target.value || null) as Pattern })}>
        {([null, 'omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const).map(value => <option key={value ?? ''} value={value ?? ''}>{label(value)}</option>)}
      </select></label>
      <button type="button" disabled={locked || selected === state.profile.preferences.dietPattern} onClick={() => void controller.propose(selected, transport)}>{t('global_coach.review_change')}</button>
    </> : null}
    {state.pending && <p role="status">{t('global_coach.pending')}</p>}
    {state.error && !state.uncertain && !state.receipt && <div role="status"><p>{t('global_coach.diet_unavailable')}</p><button type="button" disabled={locked} onClick={() => void controller.read(transport)}>{t('global_coach.diet_reload')}</button></div>}
  </section>;
}
