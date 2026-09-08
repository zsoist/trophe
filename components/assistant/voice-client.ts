import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { ReviewedVoiceTurnResult } from '@/agents/coach-assistant/voice-turn';
import type { CoachConversationRequest } from '@/agents/coach-assistant/contracts';

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
