import { Mic, Square } from 'lucide-react';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import { VoiceController, type VoiceState } from './voice-state';
import styles from './GlobalCoach.module.css';
export function VoiceCapture({ controller, state, disabled }: { controller: VoiceController; state: VoiceState; disabled: boolean }) {
  const { t } = useGlobalCoachI18n();
  const active = ['requesting', 'recording', 'stopping'].includes(state.phase);
  return <details className={styles.attachments} onToggle={event => { if (!event.currentTarget.open && active) controller.reset(); }}>
    <summary><Mic size={17} aria-hidden="true" />{t('global_coach.voice')}</summary>
    <p>{t('global_coach.voice_local')}</p>
    {state.phase === 'idle' && <button type="button" disabled={disabled} onClick={() => controller.start()}>{t('global_coach.voice_start')}</button>}
    {active && <div role="status"><p>{t(`global_coach.voice_${state.phase}`, { seconds: Math.floor(state.elapsedMs / 1000) })}</p>
      {state.phase === 'recording' && <button type="button" onClick={() => controller.stop()}><Square size={14} aria-hidden="true" />{t('global_coach.voice_stop')}</button>}
      <button type="button" onClick={() => controller.reset()}>{t('general.cancel')}</button>
    </div>}
    {state.recording && <div>
      <p>{t('global_coach.voice_ready', { seconds: Math.round(state.recording.durationMs / 1000) })}</p>
      <audio controls preload="metadata" src={state.recording.url} aria-label={t('global_coach.voice_playback')} className="w-full" />
      <button type="button" onClick={() => controller.reset()}>{t('global_coach.voice_discard')}</button>
    </div>}
    {state.error && <p role="status">{t(`global_coach.voice_error_${state.error}`)}</p>}
  </details>;
}
