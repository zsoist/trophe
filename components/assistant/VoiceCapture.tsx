'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square } from 'lucide-react';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import { VoiceController, type VoiceState } from './voice-state';
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { VoiceTranscriptionTransport } from './voice-client';
import { VoiceTranscriptReview } from './VoiceTranscriptReview';
import styles from './GlobalCoach.module.css';
export function VoiceCapture({ controller, state, disabled, conversationId, transcribe, onUse, onSend }: {
  controller: VoiceController;
  state: VoiceState;
  disabled: boolean;
  conversationId?: string;
  transcribe?: VoiceTranscriptionTransport;
  onUse?: (message: string) => boolean;
  onSend?: (result: Extract<CoachVoiceResult, { ok: true }>, message: string) => Promise<'sent' | 'ambiguous' | 'failed'>;
}) {
  const { t, lang } = useGlobalCoachI18n();
  const active = ['requesting', 'recording', 'stopping'].includes(state.phase);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Extract<CoachVoiceResult, { ok: true }> | null>(null);
  const [flowError, setFlowError] = useState(false);
  const processingRequest = useRef<AbortController | null>(null);
  useEffect(() => () => processingRequest.current?.abort(), []);
  const reset = () => {
    processingRequest.current?.abort(); processingRequest.current = null;
    setProcessing(false); setResult(null); setFlowError(false); controller.reset();
  };
  const start = () => { setResult(null); setFlowError(false); controller.start(); };
  const processRecording = async () => {
    if (!state.recording || !transcribe || !conversationId || processing) return;
    const request = new AbortController(); processingRequest.current = request; setProcessing(true); setFlowError(false);
    try {
      const next = await transcribe({ blob: state.recording.blob, durationMs: state.recording.durationMs }, { conversationId, turnId: crypto.randomUUID(), locale: lang }, request.signal);
      if (request.signal.aborted) return;
      if (!next.ok || next.scope.conversationId !== conversationId) throw new Error('invalid_output');
      controller.reset(); setResult(next);
    } catch { if (!request.signal.aborted) setFlowError(true); }
    finally { if (processingRequest.current === request) processingRequest.current = null; if (!request.signal.aborted) setProcessing(false); }
  };
  if (result && conversationId && onUse) return <VoiceTranscriptReview result={result} scope={{ ...result.scope, conversationId }} onUse={onUse}
    onSend={onSend ? message => onSend(result, message) : undefined} onDiscard={reset} onRerecord={() => { setResult(null); start(); }} />;
  return <details className={styles.attachments} onToggle={event => { if (!event.currentTarget.open && (active || processing)) reset(); }}>
    <summary><Mic size={17} aria-hidden="true" />{t('global_coach.voice')}</summary>
    <p>{t(transcribe ? 'global_coach.voice_connected' : 'global_coach.voice_local')}</p>
    {state.phase === 'idle' && !processing && <button type="button" disabled={disabled} onClick={start}>{t('global_coach.voice_start')}</button>}
    {active && <div role="status"><p>{t(`global_coach.voice_${state.phase}`, { seconds: Math.floor(state.elapsedMs / 1000) })}</p>
      {state.phase === 'recording' && <button type="button" onClick={() => controller.stop()}><Square size={14} aria-hidden="true" />{t('global_coach.voice_stop')}</button>}
      <button type="button" onClick={reset}>{t('global_coach.voice_cancel')}</button>
    </div>}
    {processing && <div role="status"><p>{t('global_coach.voice_processing')}</p><button type="button" onClick={reset}>{t('global_coach.voice_cancel')}</button></div>}
    {state.recording && <div>
      <p>{t('global_coach.voice_ready', { seconds: Math.round(state.recording.durationMs / 1000) })}</p>
      <audio controls preload="metadata" src={state.recording.url} aria-label={t('global_coach.voice_playback')} className="w-full" />
      {transcribe && conversationId && <button type="button" disabled={disabled || processing} onClick={() => void processRecording()}>{t('global_coach.voice_transcribe')}</button>}
      <button type="button" onClick={start}><RotateCcw size={14} aria-hidden="true" />{t('global_coach.voice_rerecord')}</button>
      <button type="button" onClick={reset}>{t('global_coach.voice_discard')}</button>
    </div>}
    {state.error && <p role="status">{t(`global_coach.voice_error_${state.error}`)}</p>}
    {flowError && <p role="alert">{t('global_coach.voice_processing_failed')}</p>}
  </details>;
}
