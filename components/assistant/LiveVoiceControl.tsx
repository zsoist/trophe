'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AudioLines, Square, VolumeX, X } from 'lucide-react';
import type { createBrowserLiveSession } from '@/lib/voice-live/browser-session';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './LiveVoiceControl.module.css';

export function LiveVoiceControl(props: { conversationId: string; prepareConversation?: () => Promise<string | null>; onQuery: (text: string, signal: AbortSignal) => Promise<string> }) {
  const { t } = useGlobalCoachI18n();
  const [available, setAvailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (expanded && activeConversationId && props.conversationId !== activeConversationId) setExpanded(false);
  }, [props.conversationId, activeConversationId, expanded]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/coach-assistant/live', { credentials: 'same-origin', signal: abort.signal })
      .then(r => r.ok ? r.json() : null).then(value => { if (!abort.signal.aborted) setAvailable(value?.enabled === true); }).catch(() => {});
    return () => abort.abort();
  }, []);
  if (!available) return null;
  return <>
    <button type="button" className={styles.launcher} disabled={preparing} onClick={async () => {
      if (expanded) { setExpanded(false); return; }
      setPreparing(true);
      try {
        const id = props.prepareConversation ? await props.prepareConversation() : props.conversationId;
        if (id) { setActiveConversationId(id); setExpanded(true); }
      } finally { setPreparing(false); }
    }} aria-label={t('global_coach.live_title')} aria-expanded={expanded}><AudioLines size={19} aria-hidden="true" /></button>
    {expanded && activeConversationId && <LiveSession {...props} conversationId={activeConversationId} prepareConversation={undefined} onClose={() => setExpanded(false)} />}
  </>;
}

function LiveSession(props: { conversationId: string; prepareConversation?: () => Promise<string | null>; onQuery: (text: string, signal: AbortSignal) => Promise<string>; onClose(): void }) {
  const { t } = useGlobalCoachI18n();
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const audio = useRef<HTMLAudioElement>(null);
  const [session, setSession] = useState<ReturnType<typeof createBrowserLiveSession> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let instance: ReturnType<typeof createBrowserLiveSession> | undefined;
    void import('@/lib/voice-live/browser-session').then(({ createBrowserLiveSession }) => {
      if (!active || !audio.current) return;
      instance = createBrowserLiveSession({ audio: audio.current, prepareConversation: async () => latest.current.prepareConversation?.() ?? latest.current.conversationId, query: (text, signal) => latest.current.onQuery(text, signal) });
      setSession(instance);
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; instance?.dispose(); };
  }, []);
  return <div className={styles.panel} role="region" aria-label={t('global_coach.live_title')}>
    <header><strong>{t('global_coach.live_title')}</strong><button type="button" onClick={props.onClose} aria-label={t('global_coach.close')}><X size={18} /></button></header>
    <audio ref={audio} autoPlay />
    {loadFailed && <p role="alert">{t('global_coach.live_error')}</p>}
    {session && <LiveSessionState session={session} />}
  </div>;
}

function LiveSessionState({ session }: { session: ReturnType<typeof createBrowserLiveSession> }) {
  const { t } = useGlobalCoachI18n();
  const state = useSyncExternalStore(session.controller.subscribe, session.controller.snapshot, session.controller.snapshot);
  const inactive = ['idle', 'failed', 'closed'].includes(state.phase);
  return <>
    <p role="status" aria-live="polite">{t(inactive ? 'global_coach.live_ready' : state.phase === 'live' ? 'global_coach.live_listening' : state.phase === 'closing' ? 'global_coach.live_ending' : 'global_coach.live_connecting')}</p>
    {state.error && <p role="alert">{t(state.error === 'permission' ? 'global_coach.live_microphone_permission' : state.error === 'unsupported' ? 'global_coach.live_microphone_unavailable' : 'global_coach.live_error')}</p>}
    <div className={styles.controls}>
      {inactive ? <button type="button" onClick={() => void session.controller.startFromGesture()}>{t('global_coach.live_start')}</button>
        : <button type="button" onClick={() => session.controller.stop()}><Square size={15} />{t('global_coach.live_end')}</button>}
      {state.canInterrupt && <button type="button" onClick={() => session.controller.interrupt()}><VolumeX size={17} />{t('global_coach.live_interrupt')}</button>}
      {(state.playbackBlocked || state.interrupted) && <button type="button" onClick={() => state.interrupted ? session.controller.clearInterruption() : session.controller.resumePlayback()}>{t('global_coach.live_resume')}</button>}
    </div>
    {state.busy && <p role="status">{t('global_coach.live_working')}</p>}
    <div className={styles.transcript}>{state.transcript.slice(-4).map((row, index) => <p key={`${row.speaker}-${row.startMs}-${index}`}><strong>{t(row.speaker === 'user' ? 'global_coach.live_you' : 'global_coach.live_assistant')}</strong> {row.text}</p>)}</div>
  </>;
}
