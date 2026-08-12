import { z } from 'zod';

export const SUPPORTED_TRANSCRIPTION_LOCALES = [
  'en', 'es', 'el', 'fr', 'de', 'it', 'pt', 'nl',
] as const;
export type TranscriptionLocale = typeof SUPPORTED_TRANSCRIPTION_LOCALES[number];
export type TranscriptionContext = 'food' | 'intake';

export const transcriptionOutputSchema = z.object({
  text: z.string().trim().min(1).max(12_000),
  languages: z.array(z.string().trim().min(2).max(16)).max(8),
});

export type TranscriptionOutput = z.infer<typeof transcriptionOutputSchema>;
