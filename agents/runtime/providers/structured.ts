import type { z } from 'zod';
import { callGeminiMessages } from '@/agents/clients/google';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ProviderResult } from '../types';

export async function invokeGeminiStructured<T>(input: {
  policy: RoutingPolicy;
  system: string;
  prompt: string;
  signal: AbortSignal;
  responseSchema: Record<string, unknown>;
  validator: z.ZodType<T>;
  maxTokens?: number;
}): Promise<ProviderResult<T>> {
  if (input.signal.aborted) throw new Error('AI request aborted');
  if (input.policy.provider !== 'google') throw new Error('Structured Gemini provider requires a Google policy');

  const result = await callGeminiMessages({
    model: input.policy.model,
    system: input.system,
    userMessage: input.prompt,
    maxTokens: input.maxTokens ?? input.policy.maxTokens,
    disableThinking: true,
    responseSchema: input.responseSchema,
  });
  if (result.rawError || result.rawStatus === 0) throw new Error(result.rawError ?? 'Provider request failed');

  const output = input.validator.parse(JSON.parse(result.text));
  return {
    output,
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
    },
    latencyMs: result.latencyMs,
    rawStatus: result.rawStatus,
  };
}
