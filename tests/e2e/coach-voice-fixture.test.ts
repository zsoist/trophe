import { expect, it } from 'vitest';
import { readAudioDurationMs } from '@/lib/server/audio-duration';
import { VALID_SILENT_WEBM } from '@/tests/fixtures/voice-audio';

it('keeps the isolated browser recorder fixture parseable by the real server boundary', async () => {
  const file = new File([Buffer.from(VALID_SILENT_WEBM, 'base64')], 'recording.webm', { type: 'audio/webm;codecs=opus' });
  await expect(readAudioDurationMs(file)).resolves.toBeGreaterThanOrEqual(100);
});
