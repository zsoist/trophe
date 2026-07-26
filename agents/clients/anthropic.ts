import {
  anthropicUsage,
  malformedAnthropicResponse,
  readAnthropicResponse,
} from '@/agents/runtime/providers/anthropic';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '@/agents/runtime/provider-access';

// Thin Anthropic client with prompt caching support.
// The `system` prompt is passed as a cacheable block — Anthropic caches the
// prefix server-side so subsequent calls within the TTL reuse it at ~10% cost.

export interface AnthropicMessagesInput {
  model: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  cacheSystem?: boolean;
}

export interface AnthropicMessagesResult {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  latencyMs: number;
  rawStatus: number;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function callAnthropicMessages(
  input: AnthropicMessagesInput & {
    signal: AbortSignal;
    fetchImpl?: typeof fetch;
    beforeTransportAttempt?: (endpoint: string) => unknown;
  },
): Promise<AnthropicMessagesResult> {
  const accessMode = assertPaidProviderAccess({
    provider: 'anthropic',
    transportWasInjected: input.fetchImpl != null,
  });
  const apiKey = accessMode === 'offline'
    ? PAID_PROVIDER_OFFLINE_CREDENTIAL
    : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemBlock = input.cacheSystem
    ? [{ type: 'text' as const, text: input.system, cache_control: { type: 'ephemeral' as const } }]
    : input.system;

  const startTime = Date.now();
  input.beforeTransportAttempt?.(ANTHROPIC_API_URL);
  const response = await (input.fetchImpl ?? fetch)(ANTHROPIC_API_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 2048,
      system: systemBlock,
      messages: [{ role: 'user', content: input.userMessage }],
    }),
    signal: input.signal,
  });
  const data = await readAnthropicResponse({
    response,
    startedAt: startTime,
    maxTokens: input.maxTokens ?? 2048,
  });
  const textBlock = Array.isArray(data.content)
    ? data.content.find((content): content is { type?: unknown; text: string } => (
        typeof content === 'object'
        && content !== null
        && 'text' in content
        && typeof content.text === 'string'
      ))
    : undefined;
  if (!textBlock || !textBlock.text) {
    throw malformedAnthropicResponse({ response, startedAt: startTime, data });
  }
  const usage = anthropicUsage(data);
  if (!usage) {
    throw malformedAnthropicResponse({ response, startedAt: startTime, data });
  }

  return {
    text: textBlock.text,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      ...(usage.cacheWriteTokens != null ? { cache_creation_input_tokens: usage.cacheWriteTokens } : {}),
      ...(usage.cacheReadTokens != null ? { cache_read_input_tokens: usage.cacheReadTokens } : {}),
    },
    latencyMs: Date.now() - startTime,
    rawStatus: response.status,
  };
}
