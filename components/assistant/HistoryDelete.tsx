'use client';
import { useEffect, useRef, useState } from 'react';
import type { HistoryPage, HistoryTransport } from './history-client';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';

export function HistoryDelete({ thread, transport, onStart, onResult, onBusy }: { thread: HistoryPage['thread']; transport: HistoryTransport; onStart: () => void; onResult: (thread: HistoryPage['thread']) => void; onBusy: (busy: boolean) => void }) {
  const { t } = useGlobalCoachI18n();
  const [review, setReview] = useState(thread.state === 'cleanup_pending');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  if (!transport.remove) return null;
  async function remove() {
    if (pending || !transport.remove) return;
    const request = new AbortController(); active.current = request;
    setPending(true); onBusy(true); onStart();
    try {
      const result = await transport.remove(thread.id, request.signal);
      if (!request.signal.aborted) { onBusy(false); onResult(result.thread); }
    } catch { if (!request.signal.aborted) setUncertain(true); }
    finally { if (!request.signal.aborted) { setPending(false); onBusy(false); } }
  }
  return <section aria-label={t('global_coach.delete_chat')}>
    {!review ? <button type="button" onClick={() => setReview(true)}>{t('global_coach.delete_chat')}</button> : <>
      <p>{t(uncertain ? 'global_coach.delete_uncertain' : thread.state === 'cleanup_pending' ? 'global_coach.cleanup_pending' : 'global_coach.delete_review')}</p>
      <button type="button" disabled={pending} onClick={() => void remove()}>{t(uncertain || thread.state === 'cleanup_pending' ? 'global_coach.retry_cleanup' : 'global_coach.confirm_delete_chat')}</button>
      {!uncertain && thread.state === 'active' && <button type="button" disabled={pending} onClick={() => setReview(false)}>{t('general.cancel')}</button>}
    </>}
  </section>;
}
