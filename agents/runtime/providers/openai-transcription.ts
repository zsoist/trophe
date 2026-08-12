import type { ProviderResult } from '@/agents/runtime/types';
import type { TranscriptionLocale, TranscriptionOutput } from '@/agents/schemas/transcribe';
import { transcriptionOutputSchema } from '@/agents/schemas/transcribe';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '@/agents/runtime/provider-access';
import { estimateModelCostUsd } from '@/agents/router/pricing';
import { debitPaidTransportAttempt } from '@/scripts/safety/require-paid-ai-approval';
import { normalizeAudioMediaType } from '@/lib/server/audio-duration';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

const EXTENSIONS_BY_MEDIA_TYPE: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
};

export class OpenAiTranscriptionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'OpenAiTranscriptionError';
    this.status = status;
    this.code = code;
  }
}

function normalizeLanguages(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return [fallback];
  const languages = value.flatMap(item => {
    if (typeof item === 'string') return [item.trim()];
    if (item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string') {
      return [(item as { code: string }).code.trim()];
    }
    return [];
  }).filter(Boolean);
  return languages.length > 0 ? [...new Set(languages)].slice(0, 8) : [fallback];
}

export async function invokeOpenAiTranscription(input: {
  model: string;
  file: File;
  locale: TranscriptionLocale;
  prompt?: string;
  durationMs: number;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  beforeTransportAttempt?: (endpoint: string) => unknown;
}): Promise<ProviderResult<TranscriptionOutput>> {
  const accessMode = assertPaidProviderAccess({
    provider: 'openai',
    transportWasInjected: input.fetchImpl != null,
  });
  const apiKey = accessMode === 'offline'
    ? PAID_PROVIDER_OFFLINE_CREDENTIAL
    : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const mediaType = normalizeAudioMediaType(input.file.type);
  const extension = EXTENSIONS_BY_MEDIA_TYPE[mediaType];
  if (!extension) {
    throw new OpenAiTranscriptionError('Unsupported transcription media type', 415, 'unsupported_audio');
  }

  const body = new FormData();
  body.set('file', new File([input.file], `recording.${extension}`, { type: mediaType }));
  body.set('model', input.model);
  body.set('language', input.locale);
  if (input.prompt) body.set('prompt', input.prompt);

  debitPaidTransportAttempt(input.beforeTransportAttempt, OPENAI_TRANSCRIPTIONS_URL);
  const startedAt = performance.now();
  const response = await (input.fetchImpl ?? fetch)(OPENAI_TRANSCRIPTIONS_URL, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal: input.signal,
  });
  const responseText = await response.text();
  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new OpenAiTranscriptionError(
      `OpenAI transcription request failed with ${response.status}`,
      response.status,
      'transcription_provider_error',
    );
  }

  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const usageRecord = record.usage && typeof record.usage === 'object'
    ? record.usage as Record<string, unknown>
    : {};
  const parsed = transcriptionOutputSchema.safeParse({
    text: record.text,
    languages: normalizeLanguages(record.languages, input.locale),
  });
  if (!parsed.success) {
    throw new OpenAiTranscriptionError(
      'OpenAI returned invalid transcription output',
      response.status,
      'invalid_transcription_output',
    );
  }

  const inputTokens = typeof usageRecord.input_tokens === 'number'
    ? usageRecord.input_tokens
    : Number.NaN;
  const outputTokens = typeof usageRecord.output_tokens === 'number'
    ? usageRecord.output_tokens
    : Number.NaN;
  if (
    !Number.isSafeInteger(inputTokens)
    || inputTokens < 0
    || !Number.isSafeInteger(outputTokens)
    || outputTokens < 0
  ) {
    throw new OpenAiTranscriptionError(
      'OpenAI returned invalid transcription usage',
      response.status,
      'invalid_transcription_usage',
    );
  }
  const actualCostUsd = estimateModelCostUsd(input.model, inputTokens, outputTokens);
  return {
    output: parsed.data,
    usage: {
      inputTokens,
      outputTokens,
      actualCostUsd,
    },
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    rawStatus: response.status,
    providerGenerationId: response.headers.get('x-request-id') ?? undefined,
  };
}
