import { expect, it } from 'vitest';
import { workoutSetResultSchema } from './set-actions';
import { readWorkoutSetResult } from './set-result-reader';

const id = '11111111-1111-4111-8111-111111111111';
const values = { sessionId: id, exerciseId: id, exerciseName: 'Bench Press', setNumber: 2, reps: 8, weightKg: 80, rpe: null, isWarmup: false, isPr: false };

it('keeps the browser reader in parity with the authoritative workout set result schema', () => {
  const snapshot = { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...values, setId: id, version: '1' } };
  const proposal = { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
    id, hash: 'a'.repeat(64), action: 'workout.set.reps.update', resource: { kind: 'workout_set', id, version: '1' },
    before: values, after: { ...values, reps: 10 }, expectedVersion: '1', precondition: '1', expiresAt: '2026-09-08T12:00:00Z', reviewRequired: true,
  } };
  for (const value of [snapshot, proposal, { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'ambiguous_selection' }]) {
    expect(workoutSetResultSchema.safeParse(value).success).toBe(true);
    expect(readWorkoutSetResult(value)).toEqual(value);
  }
  expect(readWorkoutSetResult({ ...snapshot, snapshot: { ...snapshot.snapshot, exerciseName: '' } })).toBeNull();
  expect(readWorkoutSetResult({ ...proposal, proposal: { ...proposal.proposal, expectedVersion: undefined } })).toBeNull();
});
