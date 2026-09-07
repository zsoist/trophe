'use client';
import { useEffect, useRef, useState } from 'react';
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
  const [choice, setChoice] = useState<{ version: string; value: 20 | 30 | 45 | 60 } | null>(null);
  const duration = choice?.version === profile?.version ? choice?.value ?? 30 : profile?.preferences.durationMinutes ?? 30;
  const [editing, setEditing] = useState<{ id: string; version: string; text: string } | null>(null);
  const memories = (response.memories ?? []).map(memory => Object.hasOwn(state.memories, memory.id) ? state.memories[memory.id] : memory).filter(memory => memory !== null);
  const reviewRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.receipt?.status === 'applied') receiptRef.current?.focus(); else if (state.proposal) reviewRef.current?.focus(); }, [state.proposal, state.receipt]);
  if (!profile && !response.memories?.length) return null;
  const canChange = response.snapshot?.capabilities.some(item => item.key === 'actions' && item.status === 'available');
  const applied = state.receipt?.status === 'applied';
  const currentDuration = state.confirmed?.durationMinutes ?? profile?.preferences.durationMinutes;
  const version = state.confirmed?.version ?? profile?.version;
  return <details className={styles.profile}>
    <summary>{t('global_coach.your_context')}</summary>
    {profile && <div className={styles.profileBody}>
      <p>{t('global_coach.profile_source')} · {profile.timezone} · {profile.language.toUpperCase()}</p>
      <p>{t('global_coach.typical_duration', { minutes: Number(currentDuration ?? 30) })}</p>
      {canChange && <div>
        <label htmlFor="coach-duration">{t('global_coach.choose_duration')}</label>
        <select id="coach-duration" value={duration} disabled={state.pending || state.uncertain} onChange={event => setChoice({ version: profile.version, value: Number(event.target.value) as 20 | 30 | 45 | 60 })}>
          {[20, 30, 45, 60].map(minutes => <option key={minutes} value={minutes}>{t('global_coach.minutes', { minutes })}</option>)}
        </select>
        <button type="button" disabled={state.pending || state.uncertain || !version || duration === currentDuration} onClick={() => { if (version) void controller.propose(conversationId, version, duration, transport, subjectId); }}>{t('global_coach.review_change')}</button>
      </div>}
    </div>}
    <div className={styles.profileBody}>
      {state.proposal && !applied && !state.uncertain && <section ref={reviewRef} tabIndex={-1} aria-label={t('global_coach.review_change')} className={styles.proposal}>
        {state.proposal.action === 'preference.update' ? <p>{t('global_coach.duration_change', { before: Number(state.proposal.before.durationMinutes), after: Number(state.proposal.after.durationMinutes) })}</p> : <>
          <h3>{t(`global_coach.${state.proposal.action.replace('.', '_')}`)}</h3>
          <p>{t('global_coach.before')}: {String(state.proposal.before.text)}</p>
          {state.proposal.action !== 'memory.delete' && <p>{t('global_coach.after')}: {String(state.proposal.after.text)}</p>}
        </>}
        <p>{t(state.storage === 'isolated_ephemeral' ? 'global_coach.isolated_context_change' : 'global_coach.saved_change')}</p>
        <div className={styles.actions}><button type="button" disabled={state.pending} onClick={() => controller.dismiss()}>{t('general.cancel')}</button><button type="button" disabled={state.pending} onClick={() => void controller.apply(conversationId, transport, subjectId)}>{t('global_coach.confirm_change')}</button></div>
      </section>}
      {state.pending && <p role="status">{t('global_coach.preference_pending')}</p>}
      {applied && <p ref={receiptRef} tabIndex={-1} role="status">{t(state.storage === 'isolated_ephemeral' ? 'global_coach.isolated_receipt' : 'global_coach.saved_receipt')}</p>}
      {state.receipt?.status === 'rejected' && <p role="status">{t('global_coach.preference_failed')}</p>}
      {state.uncertain && <div role="status"><p>{t('global_coach.uncertain')}</p><button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button></div>}
      {state.error && !state.uncertain && <p role="status">{t('global_coach.preference_failed')}</p>}
    </div>
    {response.memories && response.memories.length > 0 && <div className={styles.profileBody}>
      <h3>{t('global_coach.memory')}</h3>
      {memories.length === 0 && <p>{t('global_coach.memory_empty')}</p>}
      {memories.map(memory => <article key={memory.id} className={styles.memory}>
        <p>{memory.text}</p>
        <p>{t(`global_coach.memory_${memory.source}`)} · <time dateTime={memory.createdAt}>{memory.createdAt.slice(0, 10)}</time> · {t(`global_coach.scope_${memory.scope}`)}</p>
        <p>{t(memory.confirmation === 'confirmed' ? 'global_coach.confirmed' : 'global_coach.unconfirmed')}</p>
        {canChange && memory.scope === 'user' && <div>
          <div className={styles.memoryActions}>
            {memory.confirmation !== 'confirmed' && <button type="button" disabled={state.pending || state.uncertain} onClick={() => { setEditing(null); void controller.proposeMemory(conversationId, memory, { action: 'memory.confirm' }, transport, subjectId); }}>{t('global_coach.memory_confirm')}</button>}
            <button type="button" disabled={state.pending || state.uncertain} onClick={() => setEditing({ id: memory.id, version: memory.version, text: memory.text })}>{t('global_coach.memory_correct')}</button>
            <button type="button" disabled={state.pending || state.uncertain} onClick={() => { setEditing(null); void controller.proposeMemory(conversationId, memory, { action: 'memory.delete' }, transport, subjectId); }}>{t('global_coach.memory_delete')}</button>
          </div>
          {editing?.id === memory.id && editing.version === memory.version && <form onSubmit={event => { event.preventDefault(); void controller.proposeMemory(conversationId, memory, { action: 'memory.correct', after: { text: editing.text.trim() } }, transport, subjectId); setEditing(null); }}>
            <label htmlFor={`memory-${memory.id}`}>{t('global_coach.memory_text')}</label>
            <textarea id={`memory-${memory.id}`} value={editing.text} maxLength={500} rows={3} disabled={state.pending || state.uncertain} onChange={event => setEditing({ ...editing, text: event.target.value })} />
            <div className={styles.memoryActions}><button type="button" onClick={() => setEditing(null)}>{t('general.cancel')}</button><button type="submit" disabled={state.pending || state.uncertain || !editing.text.trim() || editing.text.trim() === memory.text}>{t('global_coach.review_change')}</button></div>
          </form>}
        </div>}
      </article>)}
    </div>}
  </details>;
}
