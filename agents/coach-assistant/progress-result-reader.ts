import type { ProgressResult } from './progress-contracts';
import { array, datetime, enumeration, hash, literal, nullable, object, pattern, stringLength, uuid } from './result-reader-checks';

const revision = pattern(/^[1-9][0-9]{0,18}$/);
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const nonNegativeInt = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const boundedInt = (max: number) => (value: unknown) => nonNegativeInt(value) && (value as number) <= max;
const positive = (value: unknown) => finite(value) && (value as number) > 0;
const percentage = (value: unknown) => finite(value) && (value as number) >= 0 && (value as number) <= 100;
const values = object({ measuredDate: date, weightKg: positive, bodyFatPct: nullable(percentage), waistCm: nullable(positive) });
const measurement = object({ id: uuid, measuredDate: date, weightKg: nullable(finite), bodyFatPct: nullable(finite), waistCm: nullable(finite) });
const point = object({ date, value: finite, sourceIds: array(uuid, 250) });
const trend = object({ metric: enumeration(['weightKg', 'bodyFatPct', 'waistCm']), unit: enumeration(['kg', 'percentage_points', 'cm']), observations: boundedInt(250), days: boundedInt(250), first: nullable(point), last: nullable(point), change: nullable(finite), aggregation: literal('daily_mean'), status: enumeration(['available', 'insufficient_dates']) });
const trends = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(trend);
const base = { version: literal('coach-assistant.v2'), storage: literal('database') };
const variants = [
  object({ ...base, ok: literal(false), error: enumeration(['invalid_input', 'forbidden', 'not_found', 'not_connected', 'version_conflict', 'expired', 'idempotency_conflict', 'uncertain', 'cancelled']) }),
  object({ ...base, ok: literal(true), snapshot: object({ subjectId: uuid, version: revision, window: object({ start: date, end: date, timezone: stringLength(1, 100), days: (value: unknown) => value === 30 || value === 90 || value === 365 }), measurements: array(measurement, 250), trends, truncated: (value: unknown) => typeof value === 'boolean', duplicateRowsDropped: boundedInt(250), invalidValuesExcluded: boundedInt(750), limitations: array(stringLength(0, 500), 12) }) }),
  object({ ...base, ok: literal(true), proposal: object({ id: uuid, hash, action: literal('measurement.create'), resource: object({ kind: literal('measurement'), id: uuid, version: revision }), before: literal(null), after: values, precondition: revision, expiresAt: datetime, reviewRequired: literal(true), inputSource: literal('explicit_user') }) }),
  object({ ...base, ok: literal(true), receipt: object({ id: uuid, actionId: uuid, proposalId: uuid, status: literal('applied'), resourceVersion: revision, recordedAt: datetime, action: literal('measurement.create') }), refresh: object({ measurementId: uuid, measuredDate: date, previousVersion: revision, version: revision, strategy: literal('refetch') }) }),
];

export function readProgressResult(value: unknown): ProgressResult | null {
  return variants.some(check => check(value)) ? value as ProgressResult : null;
}
