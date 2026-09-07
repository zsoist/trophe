'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { MessageCircle, Send, X } from 'lucide-react';
import { ConversationController, coachSurface, type ConversationTransport } from './conversation-state';
import { requestConversation } from './client';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

type Props = { identity: string; subjectId?: string; example?: ConversationTransport };
export default function GlobalCoach(props: Props) {
  return <CoachSurface key={`${props.identity}:${props.subjectId ?? props.identity}`} {...props} />;
}
function CoachSurface({ identity, subjectId, example }: Props) {
  const { t } = useGlobalCoachI18n();
  const path = usePathname();
  const surface = coachSurface(path);
  const [controller] = useState(() => new ConversationController());
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [open, setOpen] = useState(false);
  const [includeScreen, setIncludeScreen] = useState(true);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [panelTop, setPanelTop] = useState(64);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const scope = `${identity}:${subjectId ?? identity}`;
  useEffect(() => { controller.identify(scope); return () => controller.identify(null); }, [controller, scope]);
  useEffect(() => { setAnchor(document.getElementById('global-coach-anchor')); }, []);
  useEffect(() => {
    if (!open) return;
    const header = anchor?.closest('header');
    const measure = () => setPanelTop(Math.max(64, header?.getBoundingClientRect().bottom ?? 64));
    measure(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [anchor, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    if (followLatest.current && !window.getSelection()?.toString()) log.current?.scrollTo({ top: log.current.scrollHeight });
    else setShowLatest(true);
  }, [open, state.turns, state.pending]);
  const close = () => { controller.cancel(); setOpen(false); launcher.current?.focus(); };
  const send = () => controller.send({ surface, includeScreen, ...(subjectId ? { clientId: subjectId } : {}) }, example ?? requestConversation);
  const launch = <button ref={launcher} type="button" className={styles.launcher} aria-expanded={open} aria-controls="global-coach" onClick={() => open ? close() : setOpen(true)}>
      <MessageCircle size={19} aria-hidden="true" />{t('global_coach.open')}
    </button>;
  return <div className={styles.root}>
    {anchor ? createPortal(launch, anchor) : launch}
    {open && <section id="global-coach" className={styles.panel} style={{ top: panelTop }} aria-labelledby="global-coach-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <header className={styles.header}><div><h2 id="global-coach-title">{t('global_coach.title')}</h2><p>{t(example ? 'global_coach.example' : 'global_coach.identity')}</p></div><button type="button" onClick={close} aria-label={t('global_coach.close')}><X size={22} /></button></header>
      <div ref={log} className={styles.log} role="log" aria-live="polite" aria-relevant="additions text" onScroll={() => {
        const node = log.current; if (!node) return;
        followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
        if (followLatest.current) setShowLatest(false);
      }}>
        {!state.turns.length && <p className={styles.intro}>{t('global_coach.intro')}</p>}
        {state.turns.map(turn => <article className={styles.turn} key={turn.request.turnId}>
          <p className={styles.question}>{turn.request.message}</p>
          <p className={styles.context}>{t(turn.request.context?.includeScreen ? `global_coach.${turn.request.context.surface}` : 'global_coach.detached')}</p>
          {turn.response?.output && <div className={styles.answer}>
            <p>{turn.response.output.answer}</p>
            {!example && turn.response.mode === 'offline' && <p className={styles.context}>{t('global_coach.offline')}</p>}
            {turn.response.evidence.length > 0 && <details><summary>{t('global_coach.sources')}</summary>{turn.response.evidence.map(item => <p key={item.id}>{item.statement}</p>)}{turn.response.output.limitations.length > 0 && <p className={styles.context}>{t('global_coach.limits')}</p>}</details>}
          </div>}
        </article>)}
        {state.pending && <p role="status">{t('global_coach.pending')}</p>}
        {state.error && <p role="status">{t(`global_coach.${state.error}`)}</p>}
      </div>
      {showLatest && <button type="button" className="min-h-11 px-4 text-sm" onClick={() => { followLatest.current = true; setShowLatest(false); log.current?.scrollTo({ top: log.current.scrollHeight }); }}>{t('global_coach.latest')}</button>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className={styles.contextToggle}><input type="checkbox" checked={includeScreen} onChange={event => setIncludeScreen(event.target.checked)} />{t('global_coach.include')}<span>{t(`global_coach.${surface}`)}</span></label>
        <label className="sr-only" htmlFor="global-coach-question">{t('global_coach.question')}</label>
        <textarea id="global-coach-question" ref={input} maxLength={2000} rows={3} value={state.draft} onChange={event => controller.setDraft(event.target.value)} placeholder={t('global_coach.placeholder')} />
        <div className={styles.actions}><span>{state.draft.length}/2000</span>{state.pending ? <button type="button" onClick={() => controller.cancel()}>{t('global_coach.cancel')}</button> : <button type="submit" disabled={!state.draft.trim()}><Send size={17} aria-hidden="true" />{t('global_coach.send')}</button>}</div>
      </form>
    </section>}
  </div>;
}
