'use client';
import { useEffect, useRef, useState } from 'react';
import type { HistoryPage, HistoryTransport } from './history-client';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';

/** Recreated for each server revision; conflicts require reloading the thread. */
export function HistoryRename({ thread, transport, onSaved }: { thread: HistoryPage['thread']; transport: HistoryTransport; onSaved: (thread: HistoryPage['thread']) => void }) {
  const { t } = useGlobalCoachI18n();
  const [title, setTitle] = useState(thread.title);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  if (!transport.rename) return null;
  return <form onSubmit={async event => {
    event.preventDefault(); if (pending || failed || !title.trim() || !transport.rename) return;
    const request = new AbortController(); active.current = request; setPending(true);
    try { const result = await transport.rename(thread.id, title.trim(), thread.revision, request.signal); if (!request.signal.aborted) onSaved(result); }
    catch { if (!request.signal.aborted) setFailed(true); }
    finally { if (!request.signal.aborted) setPending(false); }
  }}>
    <label>{t('global_coach.chat_name')}<input maxLength={80} value={title} disabled={pending || failed} onChange={event => setTitle(event.target.value)} /></label>
    <button type="submit" disabled={pending || failed || !title.trim() || title.trim() === thread.title}>{t('global_coach.rename_chat')}</button>
    {failed && <p role="alert">{t('global_coach.rename_reload')}</p>}
  </form>;
}
