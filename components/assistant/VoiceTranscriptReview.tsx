import { useState } from 'react';
import { prepareReviewedVoiceMessage, type CoachVoiceResult, type CoachVoiceScope } from '@/agents/coach-assistant/voice-contract';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

/** A transcript is editable text until the user explicitly places it in the
 * composer. This component never submits a turn or uploads the recording. */
export function VoiceTranscriptReview({ result, scope, onUse, onDiscard }: {
  result: Extract<CoachVoiceResult, { ok: true }>;
  scope: CoachVoiceScope;
  onUse: (message: string) => boolean;
  onDiscard: () => void;
}) {
  const { t } = useGlobalCoachI18n();
  const [text, setText] = useState(result.transcript.text);
  const [error, setError] = useState(false);
  const prepared = prepareReviewedVoiceMessage(result, scope, text, true);
  return <section className={styles.attachments} aria-label={t('global_coach.voice_review')}>
    <p>{t('global_coach.voice_fixture')}</p>
    <label>{t('global_coach.voice_edit')}<textarea rows={3} maxLength={2000} value={text} onChange={event => { setText(event.target.value); setError(false); }} /></label>
    <p>{t('global_coach.voice_review_help')}</p>
    <button type="button" disabled={!prepared.ok} onClick={() => {
      if (!prepared.ok) return;
      if (onUse(prepared.message)) onDiscard(); else setError(true);
    }}>{t('global_coach.voice_use')}</button>
    <button type="button" onClick={onDiscard}>{t('general.cancel')}</button>
    {error && <p role="status">{t('global_coach.voice_composer_full')}</p>}
  </section>;
}
