import { describe, expect, it, vi } from 'vitest';
import {
  TranscriptionClientError,
  transcribeRecording,
} from '@/lib/microphone/transcription-client';

describe('transcribeRecording', () => {
  it('uploads only the bounded recording contract and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: 'two eggs and toast',
      languages: ['en'],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await expect(transcribeRecording(blob, {
      locale: 'en', context: 'food', durationMs: 9_500,
    }, fetchMock as unknown as typeof fetch)).resolves.toEqual({
      text: 'two eggs and toast', languages: ['en'],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/transcribe');
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('locale')).toBe('en');
    expect(body.get('context')).toBe('food');
    expect(body.get('durationMs')).toBe('9500');
    expect(body.has('model')).toBe(false);
  });

  it('rejects oversized audio before making a request', async () => {
    const fetchMock = vi.fn();
    await expect(transcribeRecording(
      new Blob(['x'.repeat(2 * 1024 * 1024 + 1)], { type: 'audio/webm' }),
      { locale: 'en', context: 'food', durationMs: 30_000 },
      fetchMock as unknown as typeof fetch,
    )).rejects.toBeInstanceOf(TranscriptionClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces stable server errors and rejects malformed success bodies', async () => {
    const denied = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'rate_limited', message: 'Please wait.',
    }), { status: 429 }));
    await expect(transcribeRecording(
      new Blob(['audio'], { type: 'audio/webm' }),
      { locale: 'en', context: 'food', durationMs: 1_000 },
      denied as unknown as typeof fetch,
    )).rejects.toMatchObject({ status: 429, code: 'rate_limited', message: 'Please wait.' });

    const malformed = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '' }), { status: 200 }));
    await expect(transcribeRecording(
      new Blob(['audio'], { type: 'audio/webm' }),
      { locale: 'en', context: 'intake', durationMs: 1_000 },
      malformed as unknown as typeof fetch,
    )).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
