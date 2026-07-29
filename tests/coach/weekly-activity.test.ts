import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { weeklyHabitActivity } from '../../lib/habits/weekly-activity';

describe('coach weekly habit activity', () => {
  it('counts only completed check-ins since Monday in Mon-Sun order', () => {
    expect(weeklyHabitActivity([
      { checked_date: '2026-07-26', completed: true },
      { checked_date: '2026-07-27', completed: true },
      { checked_date: '2026-07-28', completed: false },
      { checked_date: '2026-07-29', completed: true },
      { checked_date: 'invalid', completed: true },
    ], '2026-07-27')).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });

  it('maps Sunday to the final bucket without local-timezone date drift', () => {
    expect(weeklyHabitActivity([
      { checked_date: '2026-08-02', completed: true },
    ], '2026-07-27')).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it('derives the dashboard pulse from the existing seven-day query', () => {
    const source = readFileSync(join(process.cwd(), 'app/coach/page.tsx'), 'utf8');

    expect(source).toContain('weeklyHabitActivity(checkins, mondayStr)');
    expect(source).not.toContain('weekCheckinsRes');
    expect(source.match(/\.from\('habit_checkins'\)/g)).toHaveLength(1);
  });
});
