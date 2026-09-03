import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';
import { resolveExerciseInstructionBlock } from '@/lib/workout/exercise-copy';
import type { Exercise } from '@/lib/types';

const dictionaries: Record<string, Record<string, string | undefined>> = {
  en: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.en])),
  es: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.es])),
  el: Object.fromEntries(Object.entries(translations).map(([key, value]) => [key, value.el])),
  de, fr, it: italian, nl, pt,
};

const workoutCopyKeys = Object.keys(translations).filter((key) => key.startsWith('workout.')).sort();
const newlyLocalizedHomeKeys = [
  'workout.home_status_label', 'workout.home_source_label', 'workout.home_readiness_label',
  'workout.home_next_step_label', 'workout.home_schedule', 'workout.home_schedule_empty',
  'workout.home_explore_plan', 'workout.home_find_exercise', 'workout.home_plan_cardio',
  'workout.home_training_progress', 'workout.home_saved_plans', 'workout.home_recent_progress',
] as const;

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe('Task 4–10 workout copy inventory', () => {
  it('ships every English workout unit as one complete coherent unit in all eight locales', () => {
    expect(workoutCopyKeys.length).toBeGreaterThan(400);
    for (const key of [...workoutCopyKeys, ...newlyLocalizedHomeKeys]) {
      const english = dictionaries.en[key];
      expect(english, `en:${key}`).toBeTruthy();
      for (const [locale, dictionary] of Object.entries(dictionaries)) {
        expect(dictionary[key], `${locale}:${key}`).toBeTruthy();
        expect(placeholders(dictionary[key] ?? ''), `${locale}:${key} placeholders`).toEqual(placeholders(english ?? ''));
      }
    }
  });

  it('falls back to the complete English exercise prose block instead of mixing fragments', () => {
    const exercise = {
      instructions: 'Brace first. Lower with control. Stop if pain changes.',
      instructions_es: null,
      instructions_el: null,
    } as Exercise;

    expect(resolveExerciseInstructionBlock(exercise, 'fr')).toEqual({
      value: exercise.instructions,
      englishFallback: true,
    });
    expect(resolveExerciseInstructionBlock(exercise, 'es').value).toBe(exercise.instructions);
  });
});
