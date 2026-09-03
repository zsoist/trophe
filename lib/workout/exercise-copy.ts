import type { Exercise, Language } from '@/lib/types';

/** Resolve one authored instruction block; never splice prose across languages. */
export function resolveExerciseInstructionBlock(
  exercise: Pick<Exercise, 'instructions' | 'instructions_es' | 'instructions_el'>,
  lang: Language,
): { value: string | null; englishFallback: boolean } {
  if (lang === 'en') return { value: exercise.instructions ?? null, englishFallback: false };
  if (lang === 'es' && exercise.instructions_es) return { value: exercise.instructions_es, englishFallback: false };
  if (lang === 'el' && exercise.instructions_el) return { value: exercise.instructions_el, englishFallback: false };
  return { value: exercise.instructions ?? null, englishFallback: Boolean(exercise.instructions) };
}
