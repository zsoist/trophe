import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeOpenAiTranscription } from '@/agents/runtime/providers/openai-transcription';

const SENSITIVE_SENTINEL = 'SENSITIVE_TRANSCRIPTION_KEY';

describe('invokeOpenAiTranscription', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
    vi.stubEnv('OPENAI_API_KEY', SENSITIVE_SENTINEL);
    vi.stubGlobal('fetch', () => { throw new Error('unexpected global fetch'); });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('blocks live provider access outside production before global fetch', async () => {
    await expect(invokeOpenAiTranscription({
      model: 'gpt-transcribe',
      file: new File(['audio'], 'voice.webm', { type: 'audio/webm' }),
      locale: 'en',
      prompt: 'Transcribe only spoken words.',
      durationMs: 10_000,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'paid_provider_access_blocked' });
  });

  it('sends one bounded multipart request and normalizes provider output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: '  two eggs and toast  ',
      languages: [{ code: 'en' }],
      usage: { input_tokens: 12, output_tokens: 7 },
    }), { status: 200, headers: { 'x-request-id': 'req_transcribe_1' } }));

    const result = await invokeOpenAiTranscription({
      model: 'gpt-transcribe',
      file: new File(['spoken audio'], 'untrusted-name.bin', { type: 'audio/webm' }),
      locale: 'en',
      prompt: 'Transcribe only spoken food words. Never invent a brand.',
      durationMs: 15_000,
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { Authorization: 'Bearer trophe-offline-placeholder' },
    });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('model')).toBe('gpt-transcribe');
    expect(body.get('languages[]')).toBe('en');
    expect(body.get('prompt')).toContain('Never invent a brand');
    const file = body.get('file') as File;
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm');
    expect(result.output).toEqual({ text: 'two eggs and toast', languages: ['en'] });
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 7, actualCostUsd: 0.001125 });
    expect(result.providerGenerationId).toBe('req_transcribe_1');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(SENSITIVE_SENTINEL);
  });

  it('rejects malformed successful output without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '' }), { status: 200 }));
    await expect(invokeOpenAiTranscription({
      model: 'gpt-transcribe',
      file: new File(['audio'], 'voice.mp4', { type: 'audio/mp4' }),
      locale: 'es',
      prompt: 'Transcribe.',
      durationMs: 5_000,
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: 'invalid_transcription_output', status: 200 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
