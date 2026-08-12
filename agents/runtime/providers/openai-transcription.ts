import type { ProviderResult } from '@/agents/runtime/types';
import type { TranscriptionLocale, TranscriptionOutput } from '@/agents/schemas/transcribe';
import { transcriptionOutputSchema } from '@/agents/schemas/transcribe';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '@/agents/runtime/provider-access';
import { debitPaidTransportAttempt } from '@/scripts/safety/require-paid-ai-approval';

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_USD_PER_MINUTE = 0.0045;
const MAX_TRANSCRIPTION_COST_USD = 0.00225;

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
  prompt: string;
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

  const extension = EXTENSIONS_BY_MEDIA_TYPE[input.file.type];
  if (!extension) {
    throw new OpenAiTranscriptionError('Unsupported transcription media type', 415, 'unsupported_audio');
  }

  const body = new FormData();
  body.set('file', new File([input.file], `recording.${extension}`, { type: input.file.type }));
  body.set('model', input.model);
  body.set('languages[]', input.locale);
  body.set('prompt', input.prompt);

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

  const actualCostUsd = Math.min(
    MAX_TRANSCRIPTION_COST_USD,
    Math.max(0, input.durationMs) / 60_000 * TRANSCRIPTION_USD_PER_MINUTE,
  );
  return {
    output: parsed.data,
    usage: {
      inputTokens: typeof usageRecord.input_tokens === 'number' ? usageRecord.input_tokens : 0,
      outputTokens: typeof usageRecord.output_tokens === 'number' ? usageRecord.output_tokens : 0,
      actualCostUsd,
    },
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    rawStatus: response.status,
    providerGenerationId: response.headers.get('x-request-id') ?? undefined,
  };
}
