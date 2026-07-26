import { callAnthropicMessages } from '@/agents/clients/anthropic';
import {
  callGeminiMessages,
  type GeminiGenerateContent,
} from '@/agents/clients/google';
import { invokeDeepSeekText } from './deepseek';
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
  /** Test/offline-only Anthropic transport injection. */
  fetchImpl?: typeof fetch;
  /** Test/offline-only Google SDK transport injection. */
  generateContent?: GeminiGenerateContent;
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
      fetchImpl: input.fetchImpl,
    });
  }

  const result = input.policy.provider === 'google'
    ? await callGeminiMessages({
        model: input.policy.model,
        system: input.system,
        userMessage: input.prompt,
        maxTokens: input.maxTokens ?? input.policy.maxTokens,
        disableThinking: input.disableThinking,
        signal: input.signal,
        generateContent: input.generateContent,
      })
    : await callAnthropicMessages({
        model: input.policy.model,
        system: input.system,
        userMessage: input.prompt,
        maxTokens: input.maxTokens ?? input.policy.maxTokens,
        cacheSystem: input.policy.cacheSystem,
        signal: input.signal,
        fetchImpl: input.fetchImpl,
      });

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
