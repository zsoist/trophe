import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'components/workout/workspace/WorkoutBuilder.tsx',
  'components/workout/workspace/RoutedExerciseDetail.tsx',
  'components/workout/workspace/ExerciseSetLogger.tsx',
  'components/workout/workspace/LiveWorkout.tsx',
  'components/workout/PainFlagModal.tsx',
  'components/workout/PlateCalculator.tsx',
] as const;
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('Workout Workspace V2 icon contract', () => {
  it('does not substitute Unicode arrows, checks, warnings, or crosses for icons', () => {
    const violations = files.flatMap((file) => (source(file).match(/[←→✓✕⚠]/g) ?? []).map((glyph) => `${file}: ${glyph}`));
    expect(violations).toEqual([]);
  });

  it('keeps destructive exercise removal visibly labeled', () => {
    const card = source('components/workout/workspace/PlanExerciseCard.tsx');
    expect(card).toMatch(/<Trash2[\s\S]{0,220}\{t\('workout\.remove_exercise'\)\}/);
  });

  it('uses the project icon family for workout controls', () => {
    for (const file of files) {
      const body = source(file);
      if (/<(?:ChevronLeft|Trash2|AlertTriangle|X|Square|Pause|Play)\b/.test(body)) {
        expect(body, `${file} must import its icons from lucide-react`).toContain("from 'lucide-react'");
      }
    }
  });
});
