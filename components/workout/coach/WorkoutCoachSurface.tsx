'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, Sparkles, X } from 'lucide-react';
import type { CoachIntent, CoachRequest, CoachResponse } from '@/agents/coach-assistant/contracts';
import { useI18n } from '@/lib/i18n';
import type { CoachTransport } from './WorkoutCoachEntry';
import { readCoachResponse, requestWorkoutCoach } from './client';

const button = 'min-h-11 rounded-xl px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50';

export default function WorkoutCoachSurface({ example }: { example: CoachTransport | null }) {
  const { t, lang } = useI18n();
  const id = useId();
  const [intent, setIntent] = useState<CoachIntent | null>(null);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'result' | 'error' | 'cancelled'>('idle');
  const [result, setResult] = useState<CoachResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<CoachRequest | null>(null);
  const [retryable, setRetryable] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const triggers = useRef<Partial<Record<CoachIntent, HTMLButtonElement | null>>>({});
  const questionInput = useRef<HTMLTextAreaElement>(null);

  const stop = () => { generation.current++; controller.current?.abort(); controller.current = null; };
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  const ask = async (request: CoachRequest) => {
    stop();
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setLastRequest(request); setResult(null); setStatus('loading'); setRetryable(true);
    let deadline = false;
    const timeout = setTimeout(() => { deadline = true; abort.abort(); }, 50000);
    let onAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const response = readCoachResponse(await Promise.race([(example ?? requestWorkoutCoach)(request, abort.signal), cancelled]));
      if (current !== generation.current || abort.signal.aborted) return;
      setResult(response); setRetryable(response.error?.retryable ?? true);
      setStatus(response.ok ? 'result' : 'error');
    } catch {
      if (current !== generation.current) return;
      setStatus(abort.signal.aborted && !deadline ? 'cancelled' : 'error');
    } finally {
      clearTimeout(timeout);
      abort.signal.removeEventListener('abort', onAbort);
      if (current === generation.current) {
        // A transport that resolves after an abort is also a failed deadline.
        if (deadline) setStatus('error');
        controller.current = null;
      }
    }
  };

  const choose = (next: CoachIntent) => {
    stop(); setIntent(next); setResult(null); setStatus('idle'); setLastRequest(null);
    if (next === 'plan') requestAnimationFrame(() => questionInput.current?.focus());
    else void ask({ intent: next, message: t(`coach_assistant.${next}_prompt`) });
  };
  const close = () => {
    stop(); setIntent(null); setResult(null); setStatus('idle'); setQuestion('');
    if (intent) triggers.current[intent]?.focus();
  };
  const evidence = result?.evidence.filter(item => result.output?.evidenceRefs.includes(item.id)) ?? [];
  const errorKey = result?.error?.code === 'unauthenticated' ? 'auth' : result?.error?.code === 'disabled' ? 'disabled' : 'error';

  return <section aria-labelledby={`${id}-title`} className="overflow-hidden rounded-2xl border border-[var(--workout-rail)] bg-[var(--workout-surface)]">
    <div className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--content-secondary)]"><Sparkles size={15} aria-hidden="true" className="text-[var(--action-primary)]" />{t('coach_assistant.ai')}</div>
      <h2 id={`${id}-title`} className="mt-2 text-lg font-bold tracking-tight text-[var(--content-primary)]">{t('coach_assistant.title')}</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--content-secondary)]">{t('coach_assistant.intro')}</p>
      {example ? <p className="mt-2 text-xs font-medium text-[var(--action-primary)]">{t('coach_assistant.example')}</p> : null}
      <div className="mt-3 grid grid-cols-3 gap-2">{(['today', 'week', 'plan'] as const).map(item => <button key={item} ref={node => { triggers.current[item] = node; }} type="button" onClick={() => choose(item)} aria-pressed={intent === item} aria-controls={`${id}-answer`} className={`${button} ${intent === item ? 'btn-gold' : 'border border-[var(--workout-rail)] text-[var(--content-primary)]'}`}>{t(`coach_assistant.${item}`)}</button>)}</div>
    </div>
    {intent ? <div id={`${id}-answer`} className="border-t border-[var(--workout-rail)] p-4" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[var(--content-primary)]">{t(`coach_assistant.${intent}`)}</h3><button type="button" className={`${button} -mr-2`} aria-label={t('coach_assistant.close')} onClick={close}><X size={18} /></button></div>
      {intent === 'plan' ? <form className="mb-4 space-y-2" onSubmit={event => { event.preventDefault(); if (question.trim() && status !== 'loading') void ask({ intent: 'plan', message: question.trim() }); }}>
        <label htmlFor={`${id}-question`} className="block text-sm text-[var(--content-secondary)]">{t('coach_assistant.question')}</label>
        <textarea id={`${id}-question`} ref={questionInput} value={question} onChange={event => setQuestion(event.target.value)} maxLength={2000} rows={3} disabled={status === 'loading'} className="w-full resize-y rounded-xl border border-[var(--workout-rail)] bg-[var(--bg-primary)] p-3 text-base text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
        <button type="submit" disabled={!question.trim() || status === 'loading'} className={`${button} btn-gold flex items-center gap-2`}>{t('coach_assistant.ask')}<ArrowUpRight size={16} aria-hidden="true" /></button>
      </form> : null}
      <p role="status" className="text-sm text-[var(--content-secondary)]">{status === 'loading' ? t(example ? 'coach_assistant.example_loading' : 'coach_assistant.loading') : status === 'cancelled' ? t('coach_assistant.cancelled') : ''}</p>
      {status === 'loading' ? <button type="button" className={`${button} mt-2 border border-[var(--workout-rail)]`} onClick={() => { stop(); setStatus('cancelled'); }}>{t('coach_assistant.cancel')}</button> : null}
      {status === 'error' ? <div role="alert"><p className="text-sm leading-6 text-[var(--content-secondary)]">{t(`coach_assistant.${errorKey}`)}</p>{retryable && lastRequest ? <button type="button" className={`${button} mt-2 border border-[var(--workout-rail)]`} onClick={() => void ask(lastRequest)}>{t('coach_assistant.retry')}</button> : null}</div> : null}
      {status === 'result' && result?.output ? <div className="space-y-4 text-sm leading-6 text-[var(--content-primary)]">
        <p className="text-xs text-[var(--content-secondary)]">{result.mode === 'offline' ? t('coach_assistant.offline') : t('coach_assistant.ai')}{!example && lang !== 'en' ? ` · ${t('coach_assistant.english')}` : ''}</p>
        {!result.evidence.length && result.output.answer !== t('coach_assistant.empty') ? <p>{t('coach_assistant.empty')}</p> : null}
        <p className="whitespace-pre-wrap break-words">{result.output.answer}</p>
        {result.output.suggestions.length ? <div><h4 className="font-semibold">{t('coach_assistant.ideas')}</h4><ul className="mt-1 list-disc space-y-1 pl-5">{result.output.suggestions.map((idea, index) => <li key={index}>{idea}</li>)}</ul></div> : null}
        {result.output.escalation.required ? <div className="rounded-xl border border-[var(--workout-rail)] p-3"><h4 className="font-semibold">{t('coach_assistant.coach')}</h4><p>{result.output.escalation.reason}</p>{result.output.escalation.draft ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('coach_assistant.draft')}</summary><p className="whitespace-pre-wrap">{result.output.escalation.draft}</p></details> : null}</div> : null}
        {evidence.length ? <details><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"><BookOpen size={16} aria-hidden="true" />{t('coach_assistant.sources')}<ChevronDown size={16} aria-hidden="true" className="ml-auto" /></summary><ul className="divide-y divide-[var(--workout-rail)]">{evidence.map(item => <li key={item.id} className="py-2"><p>{item.statement}</p><p className="text-xs text-[var(--content-secondary)]">{item.window.start} — {item.window.end} · {item.window.timezone}</p>{item.completeness === 'partial' ? <p className="text-xs text-[var(--content-secondary)]">{t('coach_assistant.partial')}</p> : null}</li>)}</ul></details> : null}
        {result.output.limitations.length ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('coach_assistant.limits')}</summary><ul className="list-disc space-y-1 pl-5">{result.output.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details> : null}
      </div> : null}
      <p className="mt-4 text-xs leading-5 text-[var(--content-secondary)]">{t('coach_assistant.readonly')}</p>
    </div> : null}
  </section>;
}
