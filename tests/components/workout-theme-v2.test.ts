import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const css = source('app/globals.css');

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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
    expect(css).toMatch(/\.workout-workspace\s*\{[\s\S]*min-height:\s*calc\(100dvh - 4rem - env\(safe-area-inset-top, 0px\)\)/);
  });

  it('keeps light gold text above WCAG AA on every warm workspace surface', () => {
    const lightGold = '#765A1D';
    for (const surface of ['#F5F2EA', '#FFFFFF', '#F0EDE4']) {
      expect(contrast(lightGold, surface), `${lightGold} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toMatch(/\.light\s*\{[\s\S]*--action-primary:\s*#765A1D/);
    expect(css).toMatch(/\.light\s*\{[\s\S]*--performance-gold:\s*#765A1D/);
  });

  it('uses the numeric voice for plates, set evidence, and live timers', () => {
    for (const path of [
      'components/workout/PlateCalculator.tsx',
      'components/workout/workspace/ExerciseSetLogger.tsx',
      'components/workout/workspace/LiveCardio.tsx',
      'components/workout/workspace/LiveWorkout.tsx',
    ]) {
      expect(source(path), `${path} must use the committed mono numeric voice`).toContain('font-mono');
    }
  });
});
