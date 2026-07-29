import { describe, expect, it } from 'vitest';
import {
  supersetGroupFor,
  supersetLabelFor,
} from '@/lib/workout/supersets';

describe('workout superset grouping', () => {
  const exercises = [
    { linkedBelow: true },
    { linkedBelow: false },
    { linkedBelow: false },
    { linkedBelow: true },
    { linkedBelow: false },
  ];

  it('keeps a stable positional id for database persistence', () => {
    expect(exercises.map((_, index) => supersetGroupFor(exercises, index))).toEqual([
      1,
      1,
      null,
      4,
      4,
    ]);
  });

  it('labels independent groups sequentially for people', () => {
    expect(exercises.map((_, index) => supersetLabelFor(exercises, index))).toEqual([
      'A',
      'A',
      null,
      'B',
      'B',
    ]);
  });
});
