import { describe, expect, it } from 'vitest';
import { coachVoiceTranscriptionEnabled } from '@/components/assistant/voice-client';

describe('AccountCoach voice transcription gate', () => {
  it('connects only an explicit fixture or live Preview client flag', () => {
    expect(coachVoiceTranscriptionEnabled({})).toBe(false);
    expect(coachVoiceTranscriptionEnabled({ fixture: '1' })).toBe(true);
    expect(coachVoiceTranscriptionEnabled({ live: '1' })).toBe(true);
    expect(coachVoiceTranscriptionEnabled({ live: 'true' })).toBe(false);
  });
});
