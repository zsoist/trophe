// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { groupWorkoutSessionsByMonth } from '@/components/workout/analytics/history-grouping';

describe('groupWorkoutSessionsByMonth', () => {
  it('groups sessions into descending, labelled calendar months', () => {
    const grouped = groupWorkoutSessionsByMonth([
      { id: 'old', session_date: '2026-08-31' },
      { id: 'new', session_date: '2026-09-03' },
      { id: 'same', session_date: '2026-09-01' },
    ]);

    expect(grouped.map((group) => group.month)).toEqual(['September 2026', 'August 2026']);
    expect(grouped[0].sessions.map((session) => session.id)).toEqual(['new', 'same']);
  });
});
