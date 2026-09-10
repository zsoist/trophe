'use client';
import { useState } from 'react';
import { prepareReviewedVoiceMessage, type CoachVoiceResult, type CoachVoiceScope } from '@/agents/coach-assistant/voice-contract';
import { hasAmbiguousSpokenNumber } from '@/agents/coach-assistant/voice-ambiguity';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

/** A transcript is editable text until the user explicitly places it in the
 * composer. This component never submits a turn or uploads the recording. */
export function VoiceTranscriptReview({ result, scope, onUse, onSend, onDiscard, onRerecord }: {
  result: Extract<CoachVoiceResult, { ok: true }>;
  scope: CoachVoiceScope;
  onUse: (message: string) => boolean;
  onSend?: (message: string) => Promise<'sent' | 'ambiguous' | 'failed'>;
  onDiscard: () => void;
  onRerecord?: () => void;
}) {
  const { t } = useGlobalCoachI18n();
  const [text, setText] = useState(result.transcript.text);
  const [error, setError] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const [sending, setSending] = useState(false);
  const prepared = prepareReviewedVoiceMessage(result, scope, text, true);
  return <section className={styles.attachments} aria-label={t('global_coach.voice_review')}>
    <p>{t(result.transcript.source === 'provider_transcript' ? 'global_coach.voice_provider' : 'global_coach.voice_fixture')}</p>
    <label>{t('global_coach.voice_edit')}<textarea rows={3} maxLength={2000} value={text} onChange={event => { setText(event.target.value); setError(false); setAmbiguous(false); }} /></label>
    <p>{t('global_coach.voice_review_help')}</p>
    {onSend ? <button type="button" disabled={!prepared.ok || sending} onClick={async () => {
      if (!prepared.ok) return;
      if (hasAmbiguousSpokenNumber(prepared.message)) { setAmbiguous(true); return; }
      setSending(true);
      const outcome = await onSend(prepared.message);
      setSending(false);
      if (outcome === 'sent') onDiscard();
      else if (outcome === 'ambiguous') setAmbiguous(true);
      else setError(true);
    }}>{sending ? t('global_coach.voice_sending') : t('global_coach.voice_send')}</button> : <button type="button" disabled={!prepared.ok} onClick={() => {
      if (!prepared.ok) return;
      if (onUse(prepared.message)) onDiscard(); else setError(true);
    }}>{t('global_coach.voice_use')}</button>}
    {onRerecord && <button type="button" disabled={sending} onClick={onRerecord}>{t('global_coach.voice_rerecord')}</button>}
    <button type="button" onClick={onDiscard}>{t('general.cancel')}</button>
    {ambiguous && <p role="alert">{t('global_coach.voice_ambiguous')}</p>}
    {error && <p role="status">{t('global_coach.voice_composer_full')}</p>}
  </section>;
}
