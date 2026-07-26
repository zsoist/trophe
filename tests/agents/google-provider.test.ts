import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { callGeminiMessages } from '@/agents/clients/google';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import { invokeTextProvider } from '@/agents/runtime/providers/text';

const SENSITIVE_SENTINEL = 'SENSITIVE_SENTINEL_DO_NOT_LOG';

const { googleGenAiConstructor } = vi.hoisted(() => ({
  googleGenAiConstructor: vi.fn(function GoogleGenAiFixture() {
    throw new Error('GoogleGenAI must not be constructed offline');
  }),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: googleGenAiConstructor,
}));

const googlePolicy = {
  provider: 'google' as const,
  model: 'gemini-2.5-flash',
  costClass: 'cheap' as const,
  latencyClass: 'fast' as const,
  maxTokens: 100,
  timeoutMs: 1_000,
  maxInputChars: 1_000,
  maxCostUsd: 1,
  promptVersion: 'test',
};

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
  vi.stubEnv('GEMINI_API_KEY', SENSITIVE_SENTINEL);
  vi.stubEnv('GOOGLE_API_KEY', SENSITIVE_SENTINEL);
  vi.stubGlobal('fetch', () => {
    throw new Error('unexpected global fetch');
  });
  googleGenAiConstructor.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Google paid-provider boundary', () => {
  it('uses injected generateContent with the exact abort signal and no SDK construction', async () => {
    const signal = new AbortController().signal;
    const generateContent = vi.fn().mockResolvedValue({
      text: 'fixture answer',
      usageMetadata: {
        promptTokenCount: 7,
        candidatesTokenCount: 2,
      },
    });

    await expect(callGeminiMessages({
      model: 'gemini-2.5-flash',
      system: 'system',
      userMessage: 'prompt',
      signal,
      generateContent,
    })).resolves.toMatchObject({
      text: 'fixture answer',
      usage: { input_tokens: 7, output_tokens: 2 },
      rawStatus: 200,
    });

    expect(googleGenAiConstructor).not.toHaveBeenCalled();
    expect(generateContent.mock.calls[0]?.[0]).toMatchObject({
      model: 'gemini-2.5-flash',
      config: { abortSignal: signal },
    });
    expect(JSON.stringify(generateContent.mock.calls)).not.toContain(SENSITIVE_SENTINEL);
  });

  it('propagates injected generateContent through the text dispatcher', async () => {
    const signal = new AbortController().signal;
    const generateContent = vi.fn().mockResolvedValue({
      text: 'fixture answer',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    await expect(invokeTextProvider({
      policy: googlePolicy,
      system: 'system',
      prompt: 'prompt',
      signal,
      generateContent,
    })).resolves.toMatchObject({ output: 'fixture answer' });

    expect(generateContent.mock.calls[0]?.[0]?.config?.abortSignal).toBe(signal);
    expect(googleGenAiConstructor).not.toHaveBeenCalled();
  });

  it('propagates injected generateContent through the structured dispatcher', async () => {
    const signal = new AbortController().signal;
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"value":"ok"}',
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 },
    });

    await expect(invokeStructuredProvider({
      policy: googlePolicy,
      system: 'system',
      prompt: 'prompt',
      signal,
      schema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
      validator: z.object({ value: z.string() }),
      generateContent,
    })).resolves.toMatchObject({ output: { value: 'ok' } });

    expect(generateContent.mock.calls[0]?.[0]?.config?.abortSignal).toBe(signal);
    expect(googleGenAiConstructor).not.toHaveBeenCalled();
  });

  it('blocks before SDK construction when no transport is injected', async () => {
    await expect(callGeminiMessages({
      model: 'gemini-2.5-flash',
      system: 'system',
      userMessage: 'prompt',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      name: 'PaidProviderAccessBlockedError',
      code: 'paid_provider_access_blocked',
      provider: 'google',
    });
    expect(googleGenAiConstructor).not.toHaveBeenCalled();
  });
});
