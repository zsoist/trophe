'use client';

import { MessageController, type MessageState, type MessageTransport } from './message-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function MessagePanel({ controller, state, transport }: {
  controller: MessageController;
  state: MessageState;
  transport: MessageTransport;
}) {
  const { t } = useGlobalCoachI18n();
  const saved = Boolean(state.receipt && !state.pending && !state.error);
  return <section className={styles.foodReview} aria-label={t('global_coach.message_title')}>
    <h3>{t('global_coach.message_title')}</h3>
    {state.recipient && <p><strong>{state.recipient.name ?? t('global_coach.message_recipient_fallback')}</strong></p>}
    {!saved && !state.uncertain && <label>
      {t('global_coach.message_label')}
      <textarea
        aria-label={t('global_coach.message_label')}
        disabled={state.pending || Boolean(state.receipt)}
        maxLength={2000}
        rows={4}
        value={state.draft}
        onChange={event => controller.setDraft(event.target.value)}
      />
    </label>}
    {state.proposal && <>
      <p>{t('global_coach.message_exact')}</p>
      <p className={styles.messagePreview}>{state.proposal.after.message}</p>
      <button type="button" disabled={state.pending} onClick={() => void controller.apply(transport)}>{t('global_coach.message_confirm')}</button>
      <button type="button" disabled={state.pending} onClick={() => controller.discard()}>{t('general.cancel')}</button>
    </>}
    {state.recipient && !state.proposal && !saved && !state.uncertain && !state.pending
      && <button type="button" disabled={!state.draft.trim()} onClick={() => void controller.propose(transport)}>{t('global_coach.message_review')}</button>}
    {saved && <><p role="status">{t('global_coach.message_saved')}</p><button type="button" onClick={() => controller.dismiss()}>{t('global_coach.food_done')}</button></>}
    {state.pending && <p role="status">{t('global_coach.pending')}</p>}
    {state.uncertain && <>
      <p role="status">{t('global_coach.message_uncertain')}</p>
      <button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.message_check')}</button>
    </>}
    {state.error && !state.uncertain && !saved && <p role="status">{t(`global_coach.message_${state.error}`)}</p>}
  </section>;
}
