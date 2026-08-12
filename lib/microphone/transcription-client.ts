import { transcriptionOutputSchema } from '@/agents/schemas/transcribe';
import type {
  TranscriptionContext,
  TranscriptionLocale,
  TranscriptionOutput,
} from '@/agents/schemas/transcribe';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_MS = 30_000;

export class TranscriptionClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'TranscriptionClientError';
    this.code = code;
    this.status = status;
  }
}

export async function transcribeRecording(
  blob: Blob,
  input: {
    locale: TranscriptionLocale;
    context: TranscriptionContext;
    durationMs: number;
    signal?: AbortSignal;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TranscriptionOutput> {
  if (
    blob.size === 0
    || blob.size > MAX_AUDIO_BYTES
    || !Number.isInteger(input.durationMs)
    || input.durationMs <= 0
    || input.durationMs > MAX_DURATION_MS
  ) {
    throw new TranscriptionClientError('Recording is outside the supported limits.', 'invalid_audio', 0);
  }

  const form = new FormData();
  form.set('file', blob, 'recording');
  form.set('locale', input.locale);
  form.set('context', input.context);
  form.set('durationMs', String(input.durationMs));
  const response = await fetchImpl('/api/ai/transcribe', {
    method: 'POST',
    body: form,
    signal: input.signal,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    throw new TranscriptionClientError(
      typeof record.message === 'string' ? record.message : 'Transcription failed.',
      typeof record.code === 'string' ? record.code : 'transcription_failed',
      response.status,
    );
  }
  const parsed = transcriptionOutputSchema.safeParse(data);
  if (!parsed.success) {
    throw new TranscriptionClientError('The transcription response was invalid.', 'invalid_response', response.status);
  }
  return parsed.data;
}
