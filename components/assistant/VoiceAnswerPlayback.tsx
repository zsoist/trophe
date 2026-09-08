'use client';
import { Pause, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CoachSpeechDescriptor } from '@/agents/coach-assistant/voice-turn';
import { COACH_VOICE_STOP_PLAYBACK, stopCoachVoicePlayback } from './voice-playback';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

export function VoiceAnswerPlayback({ descriptor, text }: { descriptor: CoachSpeechDescriptor; text: string }) {
  const { t, lang } = useGlobalCoachI18n();
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const ready = window.setTimeout(() => setAvailable(Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance)), 0);
    const stop = () => setSpeaking(false);
    window.addEventListener(COACH_VOICE_STOP_PLAYBACK, stop);
    return () => { window.clearTimeout(ready); window.removeEventListener(COACH_VOICE_STOP_PLAYBACK, stop); stopCoachVoicePlayback(); };
  }, []);
  if (!available || descriptor.autoplay || descriptor.textSource !== 'validated_final_answer') return null;
  const play = () => {
    stopCoachVoicePlayback();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };
  return <button type="button" className={styles.speechControl} aria-pressed={speaking} onClick={() => speaking ? stopCoachVoicePlayback() : play()}>
    {speaking ? <Pause size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
    {t(speaking ? 'global_coach.voice_speech_stop' : 'global_coach.voice_speech_play')}
  </button>;
}
