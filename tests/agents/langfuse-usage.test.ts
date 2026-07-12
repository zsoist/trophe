import { describe, expect, it } from 'vitest';
import { normalizeTraceUsage } from '@/agents/observability/langfuse';

describe('Langfuse cache usage normalization', () => {
  it('normalizes Anthropic additive input/cache buckets for trace ratios', () => {
    expect(normalizeTraceUsage('anthropic', {
      input_tokens: 120,
      output_tokens: 8,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 80,
    })).toEqual({
      totalInputTokens: 240,
      cacheReadTokens: 40,
      cacheCreationTokens: 80,
      cacheHitRate: 0.17,
      cacheMissTokens: 200,
    });
  });

  it('keeps OpenAI total-input semantics without double counting cache buckets', () => {
    expect(normalizeTraceUsage('openai', {
      input_tokens: 120,
      output_tokens: 8,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 60,
    })).toMatchObject({ totalInputTokens: 120, cacheMissTokens: 80 });
  });
});
