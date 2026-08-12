import { NextRequest, NextResponse } from 'next/server';
import { runTranscription } from '@/agents/transcribe';
import {
  SUPPORTED_TRANSCRIPTION_LOCALES,
  transcriptionOutputSchema,
  type TranscriptionContext,
  type TranscriptionLocale,
} from '@/agents/schemas/transcribe';
import { guardAiRoute } from '@/lib/security/api-guard';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';
import { normalizeAudioMediaType, readAudioDurationMs } from '@/lib/server/audio-duration';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_MS = 30_000;
const TRANSCRIPTION_LIMIT = 10;
const TRANSCRIPTION_WINDOW_SECONDS = 15 * 60;
const SUPPORTED_MEDIA_TYPES = new Set([
  'audio/mp4', 'audio/webm', 'video/mp4',
]);
const SUPPORTED_CONTEXTS = new Set<TranscriptionContext>(['food', 'intake']);

function errorResponse(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ code, message }, { status, headers });
}

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  const rateLimit = await consumeRateLimit(
    `transcribe:${guard.userId}`,
    TRANSCRIPTION_LIMIT,
    TRANSCRIPTION_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return errorResponse(
      'rate_limited',
      'Too many transcription requests. Please wait a few minutes.',
      429,
      { 'Retry-After': String(rateLimit.retryAfter) },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    const locale = form.get('locale');
    const context = form.get('context');
    const durationMs = Number(form.get('durationMs'));

    if (!(file instanceof File) || file.size === 0) {
      return errorResponse('invalid_audio', 'A recording is required.', 400);
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return errorResponse('invalid_audio', 'Recording is too large.', 413);
    }
    const mediaType = normalizeAudioMediaType(file.type);
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
      return errorResponse('unsupported_audio', 'This recording format is not supported.', 415);
    }
    if (
      typeof locale !== 'string'
      || !SUPPORTED_TRANSCRIPTION_LOCALES.includes(locale as TranscriptionLocale)
      || typeof context !== 'string'
      || !SUPPORTED_CONTEXTS.has(context as TranscriptionContext)
      || !Number.isInteger(durationMs)
      || durationMs <= 0
      || durationMs > MAX_DURATION_MS
    ) {
      return errorResponse('invalid_request', 'Recording details are invalid.', 400);
    }

    let measuredDurationMs: number;
    try {
      measuredDurationMs = await readAudioDurationMs(file);
    } catch {
      return errorResponse('invalid_audio', 'Recording could not be verified.', 400);
    }
    if (measuredDurationMs > MAX_DURATION_MS) {
      return errorResponse('invalid_audio', 'Recording is longer than 30 seconds.', 413);
    }

    const generation = await runTranscription(
      {
        file,
        locale: locale as TranscriptionLocale,
        context: context as TranscriptionContext,
        durationMs: measuredDurationMs,
      },
      {
        userId: guard.userId,
        requestId: request.headers.get('x-request-id') ?? undefined,
        metadata: { context },
      },
    );
    const parsed = transcriptionOutputSchema.safeParse(generation.output);
    if (!parsed.success) {
      return errorResponse(
        'transcription_failed',
        'We could not transcribe that recording. Please try again.',
        502,
      );
    }
    return NextResponse.json(parsed.data);
  } catch (error) {
    console.error('[transcribe] request failed', safeErrorMetadata(error));
    return errorResponse(
      'transcription_failed',
      'We could not transcribe that recording. Please try again.',
      502,
    );
  }
}
