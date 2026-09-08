import { useState } from 'react';
import type { CoachVoiceResult } from '../../../agents/coach-assistant/voice-contract';
import { VoiceTranscriptReview } from '../../../components/assistant/VoiceTranscriptReview';
import { useGlobalCoachI18n } from '../../../components/assistant/useGlobalCoachI18n';
import type { CoachVoiceSlot } from '../../../components/assistant/GlobalCoach';
import { REVIEW_USER } from './store';

/** Explicit text fixture, separate from the user's local recording. No fake STT. */
export function PrivateVoiceReview({ conversationId, onUse, onSend }: Parameters<CoachVoiceSlot>[0]) {
  const { t } = useGlobalCoachI18n();
  const [result, setResult] = useState<Extract<CoachVoiceResult, { ok: true }> | null>(null);
  const scope = { actorId: REVIEW_USER, organizationId: '00000000-0000-4000-8000-000000000002', conversationId };
  if (!result) return <button type="button" onClick={() => setResult({ version: 'coach-assistant.voice.v1', ok: true, status: 'review_required', scope, turnId: crypto.randomUUID(), transcript: { text: t('global_coach.voice_example_text'), locale: 'en', languages: [], source: 'synthetic_fixture', trust: 'untrusted_transcript' }, review: { token: 'offline-ui-fixture', expiresAt: new Date(Date.now() + 60_000).toISOString(), editable: true, audioRetention: 'discarded_after_transcription' }, durationMs: 3000 })}>{t('global_coach.voice_example')}</button>;
  return <VoiceTranscriptReview key={result.turnId} result={result} scope={scope} onUse={onUse} onSend={onSend ? message => onSend(result, message) : undefined} onDiscard={() => setResult(null)} />;
}
