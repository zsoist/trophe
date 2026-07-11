import { callGeminiMessages } from '@/agents/clients/google';
import { invokeDeepSeekText } from './deepseek';
import { invokeAnthropicJson } from './anthropic';
import { AiProviderError } from './errors';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ProviderResult } from '../types';

export async function invokeTextProvider(input: {
  policy: RoutingPolicy;
  system: string;
  prompt: string;
  signal: AbortSignal;
  maxTokens?: number;
  disableThinking?: boolean;
  userId?: string;
}): Promise<ProviderResult<string>> {
  if (input.signal.aborted) throw new Error('AI request aborted');

  if (input.policy.provider === 'deepseek') {
    return invokeDeepSeekText({
      model: input.policy.model as 'deepseek-v4-flash' | 'deepseek-v4-pro',
      system: input.system,
      prompt: input.prompt,
      maxTokens: input.maxTokens ?? input.policy.maxTokens,
      signal: input.signal,
      userId: input.userId,
    });
  }

  if (input.policy.provider === 'anthropic') {
    const result = await invokeAnthropicJson<{
      content?: Array<{ type?: string; text?: string }>;
    }>({
      signal: input.signal,
      body: {
        model: input.policy.model,
        max_tokens: input.maxTokens ?? input.policy.maxTokens,
        system: input.policy.cacheSystem
          ? [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }]
          : input.system,
        messages: [{ role: 'user', content: input.prompt }],
      },
    });
    const content = Array.isArray(result.output.content) ? result.output.content : [];
    const text = content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new AiProviderError({
        provider: 'anthropic',
        message: 'Anthropic text response missing text content',
        status: result.rawStatus,
        errorType: 'provider_protocol_error',
        errorCode: 'missing_text_content',
        providerRequestId: result.providerRequestId,
        providerGenerationId: result.providerGenerationId,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });
    }
    return { ...result, output: text };
  }

  if (input.policy.provider !== 'google') {
    throw new Error(`Text provider not supported: ${input.policy.provider}`);
  }

  const result = await callGeminiMessages({
    model: input.policy.model,
    system: input.system,
    userMessage: input.prompt,
    maxTokens: input.maxTokens ?? input.policy.maxTokens,
    disableThinking: input.disableThinking,
  });

  if (result.rawError || result.rawStatus === 0) {
    throw new Error(result.rawError ?? 'Provider request failed');
  }

  return {
    output: result.text,
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      cacheReadTokens: result.usage.cache_read_input_tokens,
      cacheWriteTokens: result.usage.cache_creation_input_tokens,
    },
    latencyMs: result.latencyMs,
    rawStatus: result.rawStatus,
  };
}
