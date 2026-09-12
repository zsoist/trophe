'use client';
import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { HistoryList, HistoryPage, HistoryTransport } from './history-client';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import { ResponseText } from './ResponseText';
import { HistoryDelete } from './HistoryDelete';
import { HistoryRename } from './HistoryRename';
import styles from './GlobalCoach.module.css';

/** Mounted under the authenticated subject key. Closing/unmounting aborts all reads. */
export function HistoryPanel({ transport, onResume, onInvalidate }: { transport: HistoryTransport; onResume?: (page: HistoryPage) => void; onInvalidate?: (threadId: string) => void }) {
  const { t, lang } = useGlobalCoachI18n();
  const [list, setList] = useState<HistoryList | null>(null);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const request = new AbortController(); active.current = request;
    void transport.list(request.signal).then(result => {
      if (active.current === request && !request.signal.aborted) setList(result);
    }).catch(() => {
      if (active.current === request && !request.signal.aborted) setError(true);
    }).finally(() => {
      if (active.current === request && !request.signal.aborted) { active.current = null; setPending(false); }
    });
    return () => { request.abort(); active.current?.abort(); active.current = null; };
  }, [transport]);
  const selectedId = page?.thread.id;
  useEffect(() => { if (selectedId) heading.current?.focus(); }, [selectedId]);
  async function load(kind: 'list' | 'read', threadId?: string, more = false, resume = false) {
    active.current?.abort();
    const request = new AbortController(); active.current = request;
    setPending(true); setError(false);
    if (kind === 'read' && !more) setPage(null);
    try {
      if (kind === 'list') {
        const result = await transport.list(request.signal, more ? list?.nextCursor : undefined);
        if (active.current !== request || request.signal.aborted) return;
        setList(previous => ({ ...result, threads: more && previous ? [...previous.threads, ...result.threads.filter(item => !previous.threads.some(old => old.id === item.id))] : result.threads }));
      } else {
        const result = await transport.read(threadId!, request.signal, more ? page?.nextSequence ?? 0 : 0);
        if (active.current !== request || request.signal.aborted) return;
        if (more && (!page || result.thread.revision !== page.thread.revision || result.messages.some(item => page.messages.some(old => old.id === item.id)))) {
          setPage(null); throw new Error('history_changed');
        }
        setPage(previous => ({ ...result, messages: more && previous?.thread.id === result.thread.id ? [...previous.messages, ...result.messages] : result.messages }));
        if (resume && result.nextSequence === null) onResume?.(result);
      }
    } catch { if (active.current === request && !request.signal.aborted) setError(true); }
    finally { if (active.current === request) { active.current = null; setPending(false); } }
  }
  const deletion = (thread: HistoryPage['thread']) => <HistoryDelete thread={thread} transport={transport} onBusy={setPending} onStart={() => {
    setDeletingId(thread.id); onInvalidate?.(thread.id);
    setPage(current => current?.thread.id === thread.id ? { ...current, messages: [] } : current);
  }} onResult={result => {
    setPage(current => current?.thread.id === result.id ? null : current);
    setList(current => current ? { ...current, threads: result.state === 'deleted' ? current.threads.filter(item => item.id !== result.id) : current.threads.map(item => item.id === result.id ? result : item) } : current);
    setDeletingId(null);
  }} />;
  return <section className={`${styles.foodReview} ${styles.historyPanel}`} aria-label={t('global_coach.saved_chats')}>

    {list?.threads.map(item => item.state === 'cleanup_pending' ? <div key={item.id}>{deletion(item)}</div> : <div key={item.id} className={styles.historyListRow}><button type="button" disabled={pending} aria-pressed={page?.thread.id === item.id} onClick={() => void load('read', item.id, false, true)} className={styles.historyRow}><span>{item.title}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(item.createdAt))}</time></button><button type="button" className={styles.historyManage} disabled={pending} onClick={() => void load('read', item.id)} aria-label={`${t('global_coach.rename_chat')}: ${item.title}`}><Pencil size={15} aria-hidden="true" /></button></div>)}
    {list && !list.threads.length && <p>{t('global_coach.no_chats')}</p>}
    {list?.nextCursor && <button type="button" disabled={pending} onClick={() => void load('list', undefined, true)}>{t('global_coach.more_chats')}</button>}
    {page && <article>{deletingId !== page.thread.id && <HistoryRename key={`${page.thread.id}:${page.thread.revision}`} thread={page.thread} transport={transport} onSaved={thread => { setPage(current => current?.thread.id === thread.id ? { ...current, thread } : current); setList(current => current ? { ...current, threads: current.threads.map(item => item.id === thread.id ? thread : item) } : current); }} />}<h3 ref={heading} tabIndex={-1}>{page.thread.title}</h3>
      {page.messages.map(item => <div key={item.id}><strong>{t(item.role === 'user' ? 'global_coach.you' : 'global_coach.title')}</strong><ResponseText text={item.text} assistant={item.role === 'assistant'} userStatement={page.messages.find(message => message.turnId === item.turnId && message.role === 'user')?.text} /></div>)}
      {page.nextSequence !== null && <button type="button" disabled={pending} onClick={() => void load('read', page.thread.id, true)}>{t('global_coach.more_messages')}</button>}
      {onResume && deletingId !== page.thread.id && page.nextSequence === null && <button type="button" disabled={pending} onClick={() => onResume(page)}>{t('global_coach.resume_chat')}</button>}
      {deletion(page.thread)}
    </article>}
    {pending && <p role="status">{t('global_coach.pending')}</p>}
    {error && <div role="alert"><p>{t('global_coach.history_unavailable')}</p><button type="button" disabled={pending} onClick={() => void load('list')}>{t('global_coach.load_chats')}</button></div>}
  </section>;
}
