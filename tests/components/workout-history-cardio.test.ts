import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const history = readFileSync(join(process.cwd(), 'app/dashboard/workout/history/page.tsx'), 'utf8');
const home = readFileSync(join(process.cwd(), 'app/dashboard/workout/page.tsx'), 'utf8');

describe('workout history cardio presentation', () => {
  it('renders typed cardio facts instead of empty strength counts and excludes cardio from volume', () => {
    expect(history).toContain("session.workout_kind === 'cardio'");
    expect(history).toContain('session.cardio_activity');
    expect(history).toContain('session.cardio_distance_km');
    expect(history).toContain('session.cardio_effort');
    expect(history).toMatch(/filter\(\(session\) => session\.workout_kind !== 'cardio'\)/);
    expect(history).toContain("t(`workout.cardio_${session.cardio_activity ?? 'other'}`)");
  });

  it('uses the active locale for an unnamed legacy repeated workout', () => {
    expect(home).toContain("sessionResult.data.name ?? t('workout.title')");
    expect(home).not.toContain("sessionResult.data.name ?? 'Workout'");
  });
});
