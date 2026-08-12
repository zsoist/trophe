import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLastSetsMap } from '@/components/workout/workout-persistence';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('workout ghost-set history', () => {
  it('orders joined sessions newest-first before applying the safety cap', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/workout/workout-persistence.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function loadLastSetsMap');
    const end = source.indexOf('export async function loadPrMap');
    const implementation = source.slice(start, end);
    const orderAt = implementation.indexOf(".order('session_date'");
    const limitAt = implementation.indexOf('.limit(600)');

    expect(orderAt).toBeGreaterThan(-1);
    expect(implementation).toContain("referencedTable: 'workout_sessions'");
    expect(orderAt).toBeLessThan(limitAt);
  });

  it('does not merge two sessions performed on the same local date', () => {
    const rows = [
      {
        exercise_id: 'bench',
        weight_kg: 100,
        reps: 5,
        rpe: 8,
        set_number: 1,
        session_id: 'new-session',
        workout_sessions: {
          session_date: '2026-07-29',
          created_at: '2026-07-29T18:00:00Z',
        },
      },
      {
        exercise_id: 'bench',
        weight_kg: 80,
        reps: 8,
        rpe: 7,
        set_number: 1,
        session_id: 'morning-session',
        workout_sessions: {
          session_date: '2026-07-29',
          created_at: '2026-07-29T10:00:00Z',
        },
      },
    ];

    expect(buildLastSetsMap(rows)).toEqual({
      bench: [{ weight_kg: 100, reps: 5, rpe: 8 }],
    });
  });
});
