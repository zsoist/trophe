import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const css = source('app/globals.css');

const workoutSources = [
  ...[
    'ExerciseBrowser', 'ExerciseSetLogger', 'FinishWorkoutDialog', 'LiveCardio',
    'LiveWorkout', 'RetrospectiveWorkoutLogger', 'RoutedExerciseDetail',
    'WorkoutBuilder', 'WorkoutHome', 'WorkoutReview', 'WorkoutWorkspaceHeader',
  ].map((name) => `components/workout/workspace/${name}.tsx`),
  'components/workout/ExercisePicker.tsx',
  'components/workout/ExerciseDetail.tsx',
  'components/workout/PainFlagModal.tsx',
  'components/workout/PlateCalculator.tsx',
  'components/workout/MovementVisual.tsx',
  'components/workout/muscle-groups.ts',
] as const;

describe('Workout Workspace V2 theme contract', () => {
  it('defines every shared workspace surface and motion role', () => {
    for (const token of [
      '--workout-canvas', '--workout-surface', '--workout-surface-raised',
      '--workout-surface-subtle', '--workout-rail', '--workout-shadow',
      '--workout-motion-duration', '--workout-motion-ease',
    ]) {
      expect(css, `${token} must be part of the semantic workspace contract`).toContain(`${token}:`);
    }
    expect(css).toMatch(/\.light\s*\{[\s\S]*--workout-canvas:/);
  });

  it('uses contained transparent artwork on semantic fields without raw black card recipes', () => {
    expect(css).toMatch(/\.movement-visual\s*\{[\s\S]*object-fit:\s*contain/);
    const workoutCss = css.slice(css.indexOf('.workout-entry-panel'), css.indexOf('/* Prevent iOS auto-zoom'));
    expect(workoutCss).not.toMatch(/#(?:000000|000|050606|070806)\b/gi);
    expect(workoutCss).not.toMatch(/object-fit:\s*cover/i);
    expect(source('components/workout/MovementVisual.tsx')).toContain("backgroundColor: 'var(--workout-visual-surface)'" );
  });

  it('keeps component color decisions behind semantic variables', () => {
    const violations = workoutSources.flatMap((path) => {
      const body = source(path);
      return (body.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((match) => `${path}: ${match}`);
    });
    expect(violations).toEqual([]);
  });

  it('owns narrow viewport and reduced-motion behavior without nav overlap', () => {
    expect(css).toMatch(/\.client-shell__nav\s*\{[\s\S]*bottom:\s*0/);
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)[\s\S]*\.workout-workspace/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.workout-workspace/);
    expect(css).toContain('overflow-x: clip');
  });
});
