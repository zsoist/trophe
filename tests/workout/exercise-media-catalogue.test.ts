import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED_MUSCLE_ACTIVATIONS, slugForExerciseName } from '@/lib/workout/anatomy';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';

/**
 * Media honesty is only meaningful against the catalogue users actually see.
 * These rows are parsed from the real seed sources so the registry cannot
 * drift into canonical names that no seeded exercise ever carries.
 */
interface SeededExercise { name: string; muscleGroup: string; equipment: string; source: string }

function seedScriptRows(): SeededExercise[] {
  const source = readFileSync(join(process.cwd(), 'scripts/seed-exercises.js'), 'utf8');
  const pattern = /\{\s*name:\s*'([^']+)'[^}]*?muscle_group:\s*'([^']+)'[^}]*?equipment:\s*'([^']+)'/g;
  return Array.from(source.matchAll(pattern), ([, name, muscleGroup, equipment]) => ({
    name, muscleGroup, equipment, source: 'scripts/seed-exercises.js',
  }));
}

function migrationRows(): SeededExercise[] {
  const source = readFileSync(join(process.cwd(), 'drizzle/0055_expand_exercise_library.sql'), 'utf8');
  const pattern = /^\s*\('([^']+)',\s*'[^']*',\s*'[^']*',\s*'([^']+)',\s*'\{[^}]*\}',\s*'([^']+)',\s*(?:true|false)\)/gm;
  return Array.from(source.matchAll(pattern), ([, name, muscleGroup, equipment]) => ({
    name, muscleGroup, equipment, source: 'drizzle/0055_expand_exercise_library.sql',
  }));
}

const seeded = [...seedScriptRows(), ...migrationRows()];
const resolve = (row: SeededExercise) => resolveExerciseMedia({ name: row.name, equipment: row.equipment, muscleGroup: row.muscleGroup });

describe('exercise media against the seeded catalogue', () => {
  it('parses both seed sources', () => {
    expect(seedScriptRows().length).toBeGreaterThanOrEqual(100);
    expect(migrationRows().length).toBeGreaterThanOrEqual(50);
    expect(seeded.find((row) => row.name === 'Bench Press')).toMatchObject({ equipment: 'barbell' });
    expect(seeded.find((row) => row.name === 'Rope Pushdown')).toMatchObject({ equipment: 'cable' });
  });

  it.each([
    'bench-press',
    'squat',
    'deadlift',
    'overhead-press',
    'curl',
    'triceps-extension',
  ])('reaches verified technique media for %s from at least one real seeded row', (slug) => {
    const matches = seeded.filter((row) => {
      const record = resolve(row);
      return record.slug === slug && record.tier === 'verified-technique';
    });
    expect(matches, `no seeded row with its real equipment resolves ${slug}`).not.toEqual([]);
    for (const row of matches) {
      expect(resolve(row)).toMatchObject({
        motionSrc: `/workout-v3/motion/${slug}.webm`,
        posterSrc: `/workout-v3/posters/${slug}.webp`,
      });
    }
  });

  it('does not lend back-squat technique media to squats with other equipment or bar positions', () => {
    for (const input of [
      { name: 'Squat', equipment: 'dumbbell', muscleGroup: 'quads' },
      { name: 'Squat', equipment: 'Dumbbell', muscleGroup: 'quads' },
      { name: 'Front Squat', equipment: 'barbell', muscleGroup: 'quads' },
      { name: 'Goblet Squat', equipment: 'dumbbell', muscleGroup: 'quads' },
    ]) {
      const record = resolveExerciseMedia(input);
      expect(record.tier, input.name).not.toBe('verified-technique');
      expect(record.motionSrc, input.name).toBeUndefined();
      expect(record.posterSrc, input.name).not.toBe('/workout-v3/posters/squat.webp');
    }
  });

  it('keeps a cable crossover honest: it is not the standing cable fly', () => {
    const record = resolveExerciseMedia({ name: 'Cable Crossover', equipment: 'cable', muscleGroup: 'chest' });
    expect(record.slug).not.toBe('cable-fly');
    expect(record.tier).not.toBe('verified-technique');
    expect(slugForExerciseName('Cable Crossover')).toBeUndefined();
  });

  it('claims verified anatomy only for curated movements, never from a muscle-group guess', () => {
    for (const row of seeded) {
      const record = resolve(row);
      const slug = slugForExerciseName(row.name);
      const curated = slug ? CURATED_MUSCLE_ACTIVATIONS[slug] : undefined;
      if (curated) {
        expect(['verified-technique', 'verified-anatomy'], `${row.name} (${row.source})`).toContain(record.tier);
        expect(record.activations.every((activation) => activation.confidence === 'curated'), row.name).toBe(true);
      } else {
        expect(record.tier, `${row.name} (${row.source}) must not claim verified anatomy`).not.toBe('verified-anatomy');
        expect(record.tier, row.name).not.toBe('verified-technique');
        expect(record.activations.some((activation) => activation.confidence === 'curated'), row.name).toBe(false);
        if (record.tier === 'group-estimate') {
          expect(record.activations.length, row.name).toBeGreaterThan(0);
          for (const activation of record.activations) {
            expect(activation, row.name).toMatchObject({ confidence: 'group', group: row.muscleGroup });
          }
        }
      }
    }
  });
});
