import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeAiTask: vi.fn(),
  invokeOpenAiTranscription: vi.fn(),
}));

vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));
vi.mock('@/agents/runtime/providers/openai-transcription', () => ({
  invokeOpenAiTranscription: mocks.invokeOpenAiTranscription,
}));

import { runTranscription } from '@/agents/transcribe';

describe('runTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeAiTask.mockImplementation(async input => ({
      output: { text: 'plain yogurt', languages: ['en'] },
      generationId: 'generation-1',
      estimatedCostUsd: 0.00075,
      selectedPolicy: { model: 'gpt-transcribe' },
      isFallback: false,
      usage: { inputTokens: 0, outputTokens: 0, actualCostUsd: 0.00075 },
      latencyMs: 30,
      rawStatus: 200,
      ...(await input.invoke({
        policy: { model: 'gpt-transcribe' },
        signal: new AbortController().signal,
      })),
    }));
    mocks.invokeOpenAiTranscription.mockResolvedValue({
      output: { text: 'plain yogurt', languages: ['en'] },
      usage: { inputTokens: 0, outputTokens: 0, actualCostUsd: 0.00075 },
      latencyMs: 30,
      rawStatus: 200,
    });
  });

  it('uses the governed transcribe policy and a literal-only food prompt', async () => {
    const file = new File(['audio'], 'recording.webm', { type: 'audio/webm' });
    const fetchImpl = vi.fn();
    await runTranscription(
      { file, locale: 'en', context: 'food', durationMs: 10_000 },
      { userId: 'user-1', requestId: 'request-1' },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(mocks.executeAiTask).toHaveBeenCalledWith(expect.objectContaining({
      task: 'transcribe',
      context: { userId: 'user-1', requestId: 'request-1' },
    }));
    expect(mocks.invokeOpenAiTranscription).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-transcribe',
      file,
      locale: 'en',
      durationMs: 10_000,
      fetchImpl,
      prompt: expect.stringMatching(/only.*spoken|spoken.*only/i),
    }));
    expect(mocks.invokeOpenAiTranscription.mock.calls[0][0].prompt).toMatch(/never (infer|invent).*brand/i);
  });
});
