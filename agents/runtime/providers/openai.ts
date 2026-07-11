import type { z } from 'zod';
import type { ProviderResult } from '../types';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

export async function invokeOpenAiStructured<T>(input: {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
  strict?: boolean;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const startedAt = Date.now();
  const body = JSON.stringify({
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      max_completion_tokens: input.maxTokens,
      reasoning_effort: 'none',
      tools: [{
        type: 'function',
        function: {
          name: input.toolName,
          description: input.description,
          parameters: input.schema,
          ...(input.strict ? { strict: true } : {}),
        },
      }],
      tool_choice: { type: 'function', function: { name: input.toolName } },
  });
  type OpenAiResponse = {
    id?: string;
    choices?: Array<{
      finish_reason?: string;
      message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
    error?: { message?: string };
  };
  let response: Response | undefined;
  let data: OpenAiResponse = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: input.signal,
    });
    data = await response.json() as OpenAiResponse;
    if (response.ok) break;
    const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt === 4) {
      throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}`);
    }
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds * 1_000)
      : 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (!response) throw new Error('OpenAI request failed before receiving a response');
  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}`);
  }

  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (call) => call.function?.name === input.toolName,
  );
  const rawArguments = toolCall?.function?.arguments;
  if (!rawArguments) throw new Error('OpenAI structured response missing tool call');
  if (choice?.finish_reason !== 'tool_calls') {
    throw new Error(`OpenAI structured response ended with ${choice?.finish_reason ?? 'unknown reason'}`);
  }

  return {
    output: input.validator.parse(JSON.parse(rawArguments)),
    providerGenerationId: data.id,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}
