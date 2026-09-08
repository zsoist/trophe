import { expect, it } from 'vitest';
import { readProgressResult } from './progress-result-reader';

const id = '00000000-0000-4000-8000-000000000001';
const trend = (metric: 'weightKg' | 'bodyFatPct' | 'waistCm', unit: 'kg' | 'percentage_points' | 'cm') => ({ metric, unit, observations: 0, days: 0, first: null, last: null, change: null, aggregation: 'daily_mean' as const, status: 'insufficient_dates' as const });
const snapshot = { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { subjectId: id, version: '1', window: { start: '2026-06-10', end: '2026-09-07', timezone: 'America/Bogota', days: 90 }, measurements: [], trends: [trend('weightKg', 'kg'), trend('bodyFatPct', 'percentage_points'), trend('waistCm', 'cm')], truncated: false, duplicateRowsDropped: 0, invalidValuesExcluded: 0, limitations: [] } };
it('keeps the browser reader in strict parity with canonical Progress results', () => {
  expect(readProgressResult(snapshot)).toEqual(snapshot);
  expect(readProgressResult({ ...snapshot, snapshot: { ...snapshot.snapshot, trends: [] } })).toBeNull();
  expect(readProgressResult({ ...snapshot, snapshot: { ...snapshot.snapshot, window: { ...snapshot.snapshot.window, end: '2026-02-30' } } })).toBeNull();
  expect(readProgressResult({ version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { id, hash: 'a'.repeat(64), action: 'measurement.create', resource: { kind: 'measurement', id, version: '1' }, before: null, after: { measuredDate: '2026-09-07', weightKg: -1, bodyFatPct: null, waistCm: null }, precondition: '1', expiresAt: '2026-09-07T10:00:00Z', reviewRequired: true, inputSource: 'explicit_user' } })).toBeNull();
});
