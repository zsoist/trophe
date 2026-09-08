'use client';

import { WorkoutSetController, type WorkoutSetState, type WorkoutSetTransport } from './workout-set-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function WorkoutSetPanel({ controller, state, transport }: {
  controller: WorkoutSetController;
  state: WorkoutSetState;
  transport: WorkoutSetTransport;
}) {
  const { t } = useGlobalCoachI18n();
  const current = state.snapshot;
  const proposal = state.proposal;
  const saved = Boolean(state.receipt && !state.error && current && proposal === null);
  const detail = current
    ? t('global_coach.workout_set_identity', {
      exercise: current.exerciseName,
      set: current.setNumber,
      weight: current.weightKg ?? '—',
    })
    : null;

  return <section className={styles.foodReview} aria-label={t('global_coach.workout_set_title')}>
    <h3>{t('global_coach.workout_set_title')}</h3>
    {detail && <p>{detail}</p>}
    {proposal && <>
      <p>{t('global_coach.workout_set_scope')}</p>
      <table>
        <caption>{t('global_coach.workout_set_review')}</caption>
        <thead><tr><th scope="col">{t('global_coach.workout_set_value')}</th><th scope="col">{t('global_coach.food_before')}</th><th scope="col">{t('global_coach.food_after')}</th></tr></thead>
        <tbody><tr><th scope="row">{t('global_coach.workout_set_reps')}</th><td>{proposal.before.reps ?? '—'}</td><td>{proposal.after.reps}</td></tr></tbody>
      </table>
      <button type="button" disabled={state.pending} onClick={() => void controller.apply(transport)}>{t('global_coach.workout_set_confirm')}</button>
      <button type="button" disabled={state.pending} onClick={() => controller.dismiss()}>{t('general.cancel')}</button>
    </>}
    {saved && <><p role="status">{t('global_coach.workout_set_saved', { reps: current!.reps ?? '—' })}</p><button type="button" onClick={() => controller.dismiss()}>{t('global_coach.food_done')}</button></>}
    {state.pending && <p role="status">{t(state.receipt ? 'global_coach.workout_set_refreshing' : 'global_coach.pending')}</p>}
    {(state.uncertain || state.receipt && state.error) && <>
      <p role="status">{t(state.receipt ? 'global_coach.workout_set_refresh_failed' : 'global_coach.workout_set_uncertain')}</p>
      <button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.workout_set_check')}</button>
    </>}
    {state.error && !state.uncertain && !state.receipt && <>
      <p role="status">{t(`global_coach.workout_set_${state.error}`)}</p>
      {current && ['failed', 'version_conflict', 'expired', 'invalid_proposal'].includes(state.error)
        ? <button type="button" disabled={state.pending} onClick={() => void controller.retry(transport)}>{t('global_coach.workout_set_reload')}</button>
        : <button type="button" disabled={state.pending} onClick={() => controller.dismiss()}>{t('global_coach.food_done')}</button>}
    </>}
  </section>;
}
