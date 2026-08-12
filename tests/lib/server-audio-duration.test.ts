import { describe, expect, it } from 'vitest';
import { normalizeAudioMediaType, readAudioDurationMs } from '@/lib/server/audio-duration';

// 108 ms of silent Opus audio in a WebM container, generated with ffmpeg.
const SHORT_WEBM = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAI3EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggFCTbuMU6uEHFO7a1OsggIh7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMkSJiEBbAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgsJ0xZKgl/uJyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQL9AAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBQB8AAAAAABJUw2f9c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2Mi4xMi4xMDJzc9djwItjxYgsJ0xZKgl/uGfIokWjh0VOQ09ERVJEh5VMYXZjNjIuMjguMTAyIGxpYm9wdXNnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEwODAwMDAwMAAfQ7Z12OeBAKOLgQAAgAgL5jsjq2CjioEAFYAICKyzDsajioEAKYAICKyzDsajioEAPYAICKyzDsajioEAUYAICKyzDsaglqGKgQBlAAgIrLMOxpuBB3WihADN/mAcU7trkbuPs4EAt4r3gQHxggHE8IED';
const STREAMING_WEBM = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHNTbuMU6uEElTDZ1OsggE37AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpyrXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLjEyLjEwMhZUrmvlrgEAAAAAAABc14EBc8WIKvf5QiCTZE2cgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4EC4ZGfgQG1iEC/QAAAAAAAYmSBEGOik09wdXNIZWFkAQE4AUAfAAAAAAASVMNn2XNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAyc3OzY8CLY8WIKvf5QiCTZE1nyKJFo4dFTkNPREVSRIeVTGF2YzYyLjI4LjEwMiBsaWJvcHVzH0O2ddjngQCji4EAAIAIC+Y7I6tgo4qBABWACAissw7Go4qBACmACAissw7Go4qBAD2ACAissw7Go4qBAFGACAissw7GoJahioEAZQAICKyzDsabgQd1ooQAzf5g';

describe('server audio duration validation', () => {
  it('normalizes codec-qualified browser MIME types', () => {
    expect(normalizeAudioMediaType('Audio/WebM;codecs=opus')).toBe('audio/webm');
  });

  it('reads duration from a WebM container', async () => {
    const bytes = Buffer.from(SHORT_WEBM, 'base64');
    const file = new File([bytes], 'recording.webm', { type: 'audio/webm;codecs=opus' });
    const durationMs = await readAudioDurationMs(file);
    expect(durationMs).toBeGreaterThanOrEqual(100);
    expect(durationMs).toBeLessThanOrEqual(120);
  });

  it('reads browser-style streaming WebM without a declared duration', async () => {
    const bytes = Buffer.from(STREAMING_WEBM, 'base64');
    const file = new File([bytes], 'recording.webm', { type: 'audio/webm;codecs=opus' });
    const durationMs = await readAudioDurationMs(file);
    expect(durationMs).toBeGreaterThanOrEqual(100);
    expect(durationMs).toBeLessThanOrEqual(140);
  });

  it('rejects bytes that are not a supported media container', async () => {
    const file = new File(['not audio'], 'recording.webm', { type: 'audio/webm' });
    await expect(readAudioDurationMs(file)).rejects.toThrow();
  });
});
