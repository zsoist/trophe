import type { WorkoutSetResult } from './set-contracts';
import { datetime, enumeration, hash, literal, nullable, object, stringLength, uuid } from './result-reader-checks';

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const positiveInteger = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const version = stringLength(1, 128);
const values = object({
  sessionId: uuid,
  exerciseId: uuid,
  exerciseName: stringLength(1, 200),
  setNumber: positiveInteger,
  reps: nullable(value => Number.isInteger(value)),
  weightKg: nullable(finite),
  rpe: nullable(finite),
  isWarmup: nullable(value => typeof value === 'boolean'),
  isPr: nullable(value => typeof value === 'boolean'),
});
const proposal = object({
  id: uuid,
  hash,
  action: literal('workout.set.reps.update'),
  resource: object({ kind: literal('workout_set'), id: uuid, version }),
  before: values,
  after: values,
  expectedVersion: version,
  precondition: version,
  expiresAt: datetime,
  reviewRequired: literal(true),
});
const receipt = object({
  id: uuid,
  actionId: uuid,
  proposalId: uuid,
  status: enumeration(['applied', 'rejected', 'uncertain']),
  resourceVersion: nullable(version),
  recordedAt: datetime,
});
const refresh = object({
  setId: uuid,
  sessionId: uuid,
  exerciseId: uuid,
  previousVersion: version,
  version,
  strategy: literal('refetch'),
});
const base = { version: literal('coach-assistant.v2'), storage: literal('database') };
const variants = [
  object({ ...base, ok: literal(false), error: enumeration(['invalid_input', 'forbidden', 'not_found', 'session_completed', 'ambiguous_selection', 'version_conflict', 'expired', 'idempotency_conflict', 'cancelled', 'uncertain']) }),
  object({ ...base, ok: literal(true), snapshot: object({
    sessionId: uuid, exerciseId: uuid, exerciseName: stringLength(1, 200), setNumber: positiveInteger,
    reps: nullable(value => Number.isInteger(value)), weightKg: nullable(finite), rpe: nullable(finite),
    isWarmup: nullable(value => typeof value === 'boolean'), isPr: nullable(value => typeof value === 'boolean'),
    setId: uuid, version,
  }) }),
  object({ ...base, ok: literal(true), proposal }),
  object({ ...base, ok: literal(true), receipt, refresh }, ['refresh']),
];

/** Parses browser JSON only. Authorization and mutation stay server-side. */
export function readWorkoutSetResult(value: unknown): WorkoutSetResult | null {
  return variants.some(check => check(value)) ? value as WorkoutSetResult : null;
}
