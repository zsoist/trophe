import { callAnthropicMessages } from '@/agents/clients/anthropic';
import { callGeminiMessages } from '@/agents/clients/google';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ProviderResult } from '../types';

export async function invokeTextProvider(input: {
  policy: RoutingPolicy;
  system: string;
  prompt: string;
  signal: AbortSignal;
  maxTokens?: number;
  disableThinking?: boolean;
}): Promise<ProviderResult<string>> {
  if (input.signal.aborted) throw new Error('AI request aborted');

  const result = input.policy.provider === 'google'
    ? await callGeminiMessages({
        model: input.policy.model,
        system: input.system,
        userMessage: input.prompt,
        maxTokens: input.maxTokens ?? input.policy.maxTokens,
        disableThinking: input.disableThinking,
      })
    : await callAnthropicMessages({
        model: input.policy.model,
        system: input.system,
        userMessage: input.prompt,
        maxTokens: input.maxTokens ?? input.policy.maxTokens,
        cacheSystem: input.policy.cacheSystem,
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
