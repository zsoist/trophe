import { describe, expect, it } from 'vitest';
import { coachVoiceTranscriptionEnabled } from '@/components/assistant/voice-client';

describe('AccountCoach voice transcription gate', () => {
  it('connects only an explicit fixture or live Preview client flag', () => {
    expect(coachVoiceTranscriptionEnabled({})).toBe(false);
    expect(coachVoiceTranscriptionEnabled({ NEXT_PUBLIC_COACH_VOICE_FIXTURE_ENABLED: '1' })).toBe(true);
    expect(coachVoiceTranscriptionEnabled({ NEXT_PUBLIC_COACH_VOICE_LIVE_ENABLED: '1' })).toBe(true);
    expect(coachVoiceTranscriptionEnabled({ NEXT_PUBLIC_COACH_VOICE_LIVE_ENABLED: 'true' })).toBe(false);
  });
});
