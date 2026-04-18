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
  rawError?: string;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function callAnthropicMessages(
  input: AnthropicMessagesInput,
): Promise<AnthropicMessagesResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemBlock = input.cacheSystem
    ? [{ type: 'text' as const, text: input.system, cache_control: { type: 'ephemeral' as const } }]
    : input.system;

  const startTime = Date.now();
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
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
  });
  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    return {
      text: '',
      usage: { input_tokens: 0, output_tokens: 0 },
      latencyMs,
      rawStatus: response.status,
      rawError: errorText.slice(0, 500),
    };
  }

  const data = (await response.json()) as {
    content?: Array<{ text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  const text = data?.content?.[0]?.text ?? '';
  const u = data?.usage ?? {};

  return {
    text,
    usage: {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens,
    },
    latencyMs,
    rawStatus: response.status,
  };
}
