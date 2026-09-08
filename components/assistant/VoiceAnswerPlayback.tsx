'use client';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CoachSpeechDescriptor } from '@/agents/coach-assistant/voice-turn';
import { COACH_VOICE_STOP_PLAYBACK, stopCoachVoicePlayback } from './voice-playback';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function VoiceAnswerPlayback({ descriptor, text }: { descriptor: CoachSpeechDescriptor; text: string }) {
  const { t, lang } = useGlobalCoachI18n();
  const [available, setAvailable] = useState(false);
  const [mode, setMode] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [rate, setRate] = useState(1);
  const [restartRequired, setRestartRequired] = useState(false);
  useEffect(() => {
    const ready = window.setTimeout(() => setAvailable(Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance)), 0);
    const stop = () => setMode('idle');
    window.addEventListener(COACH_VOICE_STOP_PLAYBACK, stop);
    return () => { window.clearTimeout(ready); window.removeEventListener(COACH_VOICE_STOP_PLAYBACK, stop); stopCoachVoicePlayback(); };
  }, []);
  if (!available || descriptor.autoplay || descriptor.textSource !== 'validated_final_answer') return null;
  const play = () => {
    stopCoachVoicePlayback();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => setMode('idle');
    utterance.onerror = () => setMode('idle');
    window.speechSynthesis.speak(utterance);
    setRestartRequired(false);
    setMode('playing');
  };
  const pauseSupported = typeof window.speechSynthesis.pause === 'function' && typeof window.speechSynthesis.resume === 'function';
  return <div className={styles.speechControls} aria-label={t('global_coach.voice_speech_controls')}>
    {mode === 'idle' && <button type="button" className={styles.speechControl} onClick={play}><Volume2 size={15} aria-hidden="true" />{t('global_coach.voice_speech_play')}</button>}
    {mode === 'playing' && pauseSupported && <button type="button" className={styles.speechControl} onClick={() => { window.speechSynthesis.pause(); setMode('paused'); }}><Pause size={15} aria-hidden="true" />{t('global_coach.voice_speech_pause')}</button>}
    {mode === 'paused' && pauseSupported && <button type="button" className={styles.speechControl} onClick={() => { window.speechSynthesis.resume(); setMode('playing'); }}><Play size={15} aria-hidden="true" />{t('global_coach.voice_speech_resume')}</button>}
    {mode !== 'idle' && <button type="button" className={styles.speechControl} onClick={stopCoachVoicePlayback}><Square size={14} aria-hidden="true" />{t('global_coach.voice_speech_stop')}</button>}
    <label className={styles.speechRate}>{t('global_coach.voice_speech_speed')}<select value={rate} onChange={event => {
      const next = Number(event.target.value);
      if (mode !== 'idle') { stopCoachVoicePlayback(); setRestartRequired(true); }
      setRate(next);
    }}><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
    {!pauseSupported && <p className={styles.speechNotice}>{t('global_coach.voice_speech_pause_unavailable')}</p>}
    {restartRequired && <p role="status" className={styles.speechNotice}>{t('global_coach.voice_speech_restart')}</p>}
  </div>;
}
