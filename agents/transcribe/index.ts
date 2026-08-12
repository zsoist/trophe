import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { executeAiTask } from '@/agents/runtime';
import type { AiTaskContext } from '@/agents/runtime';
import { invokeOpenAiTranscription } from '@/agents/runtime/providers/openai-transcription';
import type {
  TranscriptionContext,
  TranscriptionLocale,
  TranscriptionOutput,
} from '@/agents/schemas/transcribe';

const PROMPT_TEMPLATE = readFileSync(
  join(process.cwd(), 'agents/prompts/transcribe.v1.md'),
  'utf8',
).trim();

export interface TranscriptionInput {
  file: File;
  locale: TranscriptionLocale;
  context: TranscriptionContext;
  durationMs: number;
}

export function runTranscription(
  input: TranscriptionInput,
  context: AiTaskContext,
  deps?: {
    fetchImpl?: typeof fetch;
    beforeTransportAttempt?: (endpoint: string) => unknown;
  },
) {
  const auditPrompt = PROMPT_TEMPLATE.replace('{{CONTEXT}}', input.context);
  // OpenAI requires the optional transcription prompt to match the audio
  // language. The English anti-hallucination prompt is therefore only sent
  // for English recordings; other locales rely on literal ASR without a
  // mismatched language bias.
  const providerPrompt = input.locale === 'en' ? auditPrompt : undefined;
  return executeAiTask<TranscriptionOutput>({
    task: 'transcribe',
    prompt: `locale=${input.locale}; context=${input.context}; duration_ms=${input.durationMs}`,
    systemPrompt: auditPrompt,
    context,
    invoke: ({ policy, signal }) => invokeOpenAiTranscription({
      model: policy.model,
      file: input.file,
      locale: input.locale,
      prompt: providerPrompt,
      durationMs: input.durationMs,
      signal,
      fetchImpl: deps?.fetchImpl,
      beforeTransportAttempt: deps?.beforeTransportAttempt,
    }),
  });
}
