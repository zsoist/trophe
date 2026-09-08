'use client';
import { useEffect, useRef, useState } from 'react';
import type { PersistentMemoryCard } from '@/agents/coach-assistant/memory-contracts';
import { type MemoryController, type MemoryState, type MemoryTransport } from './memory-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function MemoryPanel({ controller, state, transport }: { controller: MemoryController; state: MemoryState; transport: MemoryTransport }) {
  const { t } = useGlobalCoachI18n();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<PersistentMemoryCard | undefined>();
  const [clearedReceipt, setClearedReceipt] = useState<string | null>(null);
  const review = useRef<HTMLElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.proposal) review.current?.focus(); }, [state.proposal]);
  useEffect(() => { if (state.receipt) status.current?.focus(); }, [state.receipt]);
  const locked = state.pending || state.uncertain || Boolean(state.receipt && state.error);
  const proposal = state.proposal;
  if (state.receipt && state.receipt.id !== clearedReceipt && !state.pending && !state.error && !state.uncertain && !proposal) {
    setClearedReceipt(state.receipt.id); setEditing(undefined); setText('');
  }
  return <section className={styles.foodReview} aria-label={t('global_coach.memory')}>
    <h3>{t('global_coach.memory')}</h3>
    <p>{t('global_coach.memory_persistent_scope')}</p>
    {state.receipt && <p ref={status} tabIndex={-1} role="status">{t(state.pending || state.error ? 'global_coach.memory_refresh_pending' : 'global_coach.memory_saved')}</p>}
    {state.uncertain || state.receipt && state.error ? <div role="status">
      <p>{t('global_coach.uncertain')}</p>
      <button type="button" disabled={state.pending} onClick={() => void controller.check(transport)}>{t('global_coach.check_status')}</button>
    </div> : proposal ? <section ref={review} tabIndex={-1} aria-label={t('global_coach.review_change')}>
      <h4>{t(`global_coach.${proposal.action.replace('.', '_')}`)}</h4>
      {proposal.before && <p>{t('global_coach.before')}: {proposal.before.text}</p>}
      {proposal.after && <p>{t('global_coach.after')}: {proposal.after.text}</p>}
      <div className={styles.actions}>
        <button type="button" disabled={locked} onClick={() => controller.discard()}>{t('general.cancel')}</button>
        <button type="button" disabled={locked} onClick={() => void controller.apply(transport)}>{t('global_coach.confirm_change')}</button>
      </div>
    </section> : <>
      {!state.loaded && <button type="button" disabled={locked} onClick={() => void controller.read(transport)}>{t('global_coach.memory_load')}</button>}
      {state.loaded && <>
        {state.memories.length === 0 && <p>{t('global_coach.memory_empty')}</p>}
        {state.memories.map(memory => <article className={styles.memory} key={memory.id}>
          <p>{memory.text}</p>
          <div className={styles.memoryActions}>
            <button type="button" disabled={locked} onClick={() => { setEditing(memory); setText(memory.text); }}>{t('global_coach.memory_correct')}</button>
            <button type="button" disabled={locked} onClick={() => void controller.remove(memory, transport)}>{t('global_coach.memory_delete')}</button>
          </div>
        </article>)}
        <label>{t(editing ? 'global_coach.memory_text' : 'global_coach.memory_new')}<textarea rows={2} maxLength={400} value={text} disabled={locked} onChange={event => setText(event.target.value)} /></label>
        <button type="button" disabled={locked || !text.trim()} onClick={() => { void controller.propose(text, transport, editing); }}>{t('global_coach.review_change')}</button>
        {editing && <button type="button" disabled={locked} onClick={() => { setEditing(undefined); setText(''); }}>{t('general.cancel')}</button>}
      </>}
    </>}
    {state.pending && <p role="status">{t('global_coach.pending')}</p>}
    {state.error && !state.uncertain && !state.receipt && <div role="status"><p>{t('global_coach.memory_failed')}</p><button type="button" disabled={state.pending} onClick={() => { setEditing(undefined); void controller.read(transport); }}>{t('global_coach.memory_load')}</button></div>}
  </section>;
}
