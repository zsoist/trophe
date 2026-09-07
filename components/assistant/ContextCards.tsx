'use client';
import { useEffect, useState } from 'react';
import type { CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { PreferenceController, type PreferenceState, type PreferenceTransport } from './preference-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function ContextCards({ response, conversationId, subjectId, controller, state, transport }: {
  response: CoachConversationResponse; conversationId: string; subjectId?: string;
  controller: PreferenceController; state: PreferenceState; transport: PreferenceTransport;
}) {
  const { t } = useGlobalCoachI18n();
  const profile = response.profile;
  const [duration, setDuration] = useState<20 | 30 | 45 | 60>(profile?.preferences.durationMinutes ?? 30);
  useEffect(() => { if (profile) setDuration(profile.preferences.durationMinutes); }, [profile]);
  if (!profile && !response.memories?.length) return null;
  const canChange = response.snapshot?.capabilities.some(item => item.key === 'actions' && item.status === 'available');
  const applied = state.receipt?.status === 'applied';
  const currentDuration = applied ? state.proposal?.after.durationMinutes : profile?.preferences.durationMinutes;
  const version = applied ? state.receipt?.resourceVersion : profile?.version;
  return <details className={styles.profile}>
    <summary>{t('global_coach.your_context')}</summary>
    {profile && <div className={styles.profileBody}>
      <p>{t('global_coach.profile_source')} · {profile.timezone} · {profile.language.toUpperCase()}</p>
      <p>{t('global_coach.typical_duration', { minutes: Number(currentDuration ?? 30) })}</p>
      {canChange && <div>
        <label htmlFor="coach-duration">{t('global_coach.choose_duration')}</label>
        <select id="coach-duration" value={duration} disabled={state.pending || state.uncertain} onChange={event => setDuration(Number(event.target.value) as 20 | 30 | 45 | 60)}>
          {[20, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{t('global_coach.minutes', { minutes })}</option>)}
        </select>
        <button type="button" disabled={state.pending || state.uncertain || !version || duration === currentDuration} onClick={() => { if (version) void controller.propose(conversationId, version, duration, transport, subjectId); }}>{t('global_coach.review_change')}</button>
      </div>}
      {state.proposal && !applied && !state.uncertain && <section aria-label={t('global_coach.review_change')} className={styles.proposal}>
        <p>{t('global_coach.duration_change', { before: Number(state.proposal.before.durationMinutes), after: Number(state.proposal.after.durationMinutes) })}</p>
        <p>{t(state.storage === 'isolated_ephemeral' ? 'global_coach.isolated_change' : 'global_coach.saved_change')}</p>
        <div className={styles.actions}><button type="button" disabled={state.pending} onClick={() => controller.dismiss()}>{t('general.cancel')}</button><button type="button" disabled={state.pending || Date.parse(state.proposal.expiresAt) <= Date.now()} onClick={() => void controller.apply(conversationId, transport, subjectId)}>{t('global_coach.confirm_change')}</button></div>
      </section>}
      {state.pending && <p role="status">{t('global_coach.preference_pending')}</p>}
      {applied && <p role="status">{t(state.storage === 'isolated_ephemeral' ? 'global_coach.isolated_receipt' : 'global_coach.saved_receipt')}</p>}
      {state.receipt?.status === 'rejected' && <p role="status">{t('global_coach.preference_failed')}</p>}
      {state.uncertain && <div role="status"><p>{t('global_coach.uncertain')}</p><button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button></div>}
      {state.error && !state.uncertain && <p role="status">{t('global_coach.preference_failed')}</p>}
    </div>}
    {response.memories && response.memories.length > 0 && <div className={styles.profileBody}>
      <h3>{t('global_coach.memory')}</h3>
      {response.memories.map(memory => <article key={memory.id} className={styles.memory}><p>{memory.text}</p><p>{t(`global_coach.memory_${memory.source}`)} · <time dateTime={memory.createdAt}>{memory.createdAt.slice(0, 10)}</time> · {t(`global_coach.scope_${memory.scope}`)}</p><p>{t(memory.confirmation === 'confirmed' ? 'global_coach.confirmed' : 'global_coach.unconfirmed')}</p></article>)}
    </div>}
  </details>;
}
