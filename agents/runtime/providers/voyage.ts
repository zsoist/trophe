import type { ProviderResult } from '../types';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '../provider-access';

export async function invokeVoyageEmbedding(input: {
  model: string;
  text: string;
  inputType: 'query' | 'document';
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ProviderResult<number[]>> {
  const accessMode = assertPaidProviderAccess({
    provider: 'voyage',
    transportWasInjected: input.fetchImpl != null,
  });
  const apiKey = accessMode === 'offline'
    ? PAID_PROVIDER_OFFLINE_CREDENTIAL
    : process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not configured');
  const fetchImpl = input.fetchImpl ?? fetch;

  const startedAt = Date.now();
  const response = await fetchImpl('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: input.model, input: [input.text], input_type: input.inputType }),
    signal: input.signal,
  });
  const latencyMs = Date.now() - startedAt;
  const data = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
    usage?: { total_tokens?: number };
    detail?: string;
  };
  if (!response.ok || !data.data?.[0]?.embedding) {
    throw new Error(data.detail ?? `Voyage request failed with ${response.status}`);
  }
  return {
    output: data.data[0].embedding,
    usage: { inputTokens: data.usage?.total_tokens ?? 0, outputTokens: 0 },
    latencyMs,
    rawStatus: response.status,
  };
}
