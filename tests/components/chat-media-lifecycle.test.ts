import { describe, expect, it } from 'vitest';
import { chatAudioAttachmentDetails } from '@/lib/chat/media-recorder-lifecycle';

describe('chat media resource lifecycle', () => {
  it('maps recorder output to stable upload metadata', () => {
    expect(chatAudioAttachmentDetails('audio/webm;codecs=opus', 61_400)).toEqual({
      duration_s: 61,
      ext: 'webm',
      mime: 'audio/webm',
    });
    expect(chatAudioAttachmentDetails('audio/mp4', 5_000)).toEqual({
      duration_s: 5,
      ext: 'm4a',
      mime: 'audio/mp4',
    });
  });

  it('clamps incomplete timing to a non-negative duration', () => {
    expect(chatAudioAttachmentDetails('audio/webm', -10).duration_s).toBe(0);
  });
});
