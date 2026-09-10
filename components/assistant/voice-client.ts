import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { ReviewedVoiceTurnResult } from '@/agents/coach-assistant/voice-turn';
import type { CoachConversationRequest } from '@/agents/coach-assistant/contracts';

export function coachVoiceTranscriptionEnabled(flags: { fixture?: string; live?: string }) {
  return flags.fixture === '1' || flags.live === '1';
}

export type VoiceRecording = { blob: Blob; durationMs: number };
export type VoiceTranscriptionTransport = (
  recording: VoiceRecording,
  metadata: { conversationId: string; turnId: string; locale: string },
  signal: AbortSignal,
) => Promise<CoachVoiceResult>;

export type ReviewedVoiceTransport = (
  input: {
    voice: Extract<CoachVoiceResult, { ok: true }>;
    editedText: string;
    reviewed: true;
    request: Omit<CoachConversationRequest, 'message'>;
    offerSpeech: boolean;
  },
  signal: AbortSignal,
) => Promise<ReviewedVoiceTurnResult>;

export const requestVoiceTranscript: VoiceTranscriptionTransport = async (recording, metadata, signal) => {
  const body = new FormData();
  body.set('file', new File([recording.blob], 'recording.webm', { type: recording.blob.type || 'audio/webm' }));
  body.set('conversationId', metadata.conversationId);
  body.set('turnId', metadata.turnId);
  body.set('locale', metadata.locale);
  body.set('durationMs', String(Math.round(recording.durationMs)));
  const response = await fetch('/api/coach-assistant/voice', {
    method: 'PUT', credentials: 'same-origin', redirect: 'error', signal, headers: { Accept: 'application/json' }, body,
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('ok' in value) || !('status' in value)) throw new Error('invalid_output');
  return value as CoachVoiceResult;
};

export const requestReviewedVoiceTurn: ReviewedVoiceTransport = async (input, signal) => {
  const response = await fetch('/api/coach-assistant/voice', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('ok' in value) || !('status' in value)) throw new Error('invalid_output');
  return value as ReviewedVoiceTurnResult;
};
