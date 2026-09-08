import { expect, it } from 'vitest';
import { COACH_WORKOUT_SET_REFRESH, readWorkoutSetRefresh } from '@/components/assistant/workout-events';

it('accepts only a complete bounded workout-set refresh hint', () => {
  const ids = {
    actorId: '11111111-1111-4111-8111-111111111111',
    setId: '22222222-2222-4222-8222-222222222222',
    sessionId: '33333333-3333-4333-8333-333333333333',
    exerciseId: '44444444-4444-4444-8444-444444444444',
  };
  expect(readWorkoutSetRefresh(new CustomEvent(COACH_WORKOUT_SET_REFRESH, { detail: { ...ids, version: '12' } }))).toEqual({ ...ids, version: '12' });
  expect(readWorkoutSetRefresh(new CustomEvent(COACH_WORKOUT_SET_REFRESH, { detail: { ...ids, setId: 'foreign', version: '12' } }))).toBeNull();
  expect(readWorkoutSetRefresh(new CustomEvent(COACH_WORKOUT_SET_REFRESH, { detail: { ...ids, version: '' } }))).toBeNull();
});
