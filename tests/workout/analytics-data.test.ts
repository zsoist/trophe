import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chunkIds,
  expandScheduledDates,
  fetchAllTerminalSessionPages,
  fetchBoundedTerminalSessionPages,
  loadWorkoutAnalyticsData,
  terminalSessionCursorFilter,
} from '@/lib/workout/analytics-data';

describe('analytics terminal pagination', () => {
  it('builds a strict three-column keyset cursor for stable history pagination', () => {
    expect(terminalSessionCursorFilter({
      id: 'session-30',
      session_date: '2026-08-02',
      completed_at: '2026-08-02T12:00:00Z',
    })).toBe('session_date.lt.2026-08-02,and(session_date.eq.2026-08-02,completed_at.lt.2026-08-02T12:00:00Z),and(session_date.eq.2026-08-02,completed_at.eq.2026-08-02T12:00:00Z,id.lt.session-30)');
  });

  it('fetches beyond one page, stops on the short page, and dedupes ids', async () => {
    const calls: Array<[number, number]> = [];
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), session_date: '2026-09-01', completed_at: index === 3 ? null : '2026-09-01T12:00:00Z' }));
    const result = await fetchAllTerminalSessionPages(async (from, to) => { calls.push([from, to]); return rows.slice(from, to + 1); });
    expect(result).toHaveLength(1000); expect(calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(chunkIds(Array.from({ length: 1001 }, (_, index) => String(index)))).toHaveLength(3);
  });

  it('returns deterministic newest-first order when dates tie across pages', async () => {
    const pages = [
      [
        { id: 'b', session_date: '2026-09-03', completed_at: '2026-09-03T10:00:00Z' },
        { id: 'older', session_date: '2026-09-02', completed_at: '2026-09-02T12:00:00Z' },
      ],
      [
        { id: 'c', session_date: '2026-09-03', completed_at: '2026-09-03T11:00:00Z' },
        { id: 'd', session_date: '2026-09-03', completed_at: '2026-09-03T11:00:00Z' },
      ],
      [
        { id: 'b', session_date: '2026-09-03', completed_at: '2026-09-03T10:00:00Z' },
        { id: 'older', session_date: '2026-09-02', completed_at: '2026-09-02T12:00:00Z' },
      ],
      [],
    ];
    let page = 0;

    const result = await fetchAllTerminalSessionPages(async () => pages[page++] ?? [], 2);

    expect(result.map((row) => row.id)).toEqual(['d', 'c', 'b', 'older']);
  });

  it('caps the initial analytics window and reports older evidence honestly', async () => {
    const calls: Array<[number, number]> = [];
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index), session_date: `2026-09-${String(8 - index).padStart(2, '0')}`, completed_at: '2026-09-08T12:00:00Z' }));

    const result = await fetchBoundedTerminalSessionPages(async (from, to) => {
      calls.push([from, to]);
      return rows.slice(from, to + 1);
    }, 2, 3);

    expect(result.rows.map((row) => row.id)).toEqual(['0', '1', '2']);
    expect(result.truncated).toBe(true);
    expect(calls).toEqual([[0, 2], [2, 3]]);
  });

  it('expands active program weekdays for the selected month and respects starts_on', () => {
    expect(expandScheduledDates([{
      starts_on: '2026-09-10',
      workout_program_days: [{ weekday: 1 }, { weekday: 4 }],
    }], '2026-09')).toEqual(['2026-09-10', '2026-09-14', '2026-09-17', '2026-09-21', '2026-09-24', '2026-09-28']);
    expect(expandScheduledDates([], '2026-09')).toEqual([]);
  });

  it('loads user-scoped terminal evidence with stable pagination, safe set batches, and partial issue classification', async () => {
    const calls: Array<{ table: string; steps: Array<[string, ...unknown[]]> }> = [];
    const terminalRows = [
      { id: 'session-2', user_id: 'user-1', session_date: '2026-09-03', completed_at: '2026-09-03T12:00:00Z' },
      { id: 'session-1', user_id: 'user-1', session_date: '2026-09-01', completed_at: '2026-09-01T12:00:00Z' },
      { id: 'session-0', user_id: 'user-1', session_date: '2026-08-30', completed_at: '2026-08-30T12:00:00Z' },
    ];
    const from = vi.fn((table: string) => {
      const call = { table, steps: [] as Array<[string, ...unknown[]]> };
      calls.push(call);
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'limit', 'in', 'abortSignal']) {
        query[method] = vi.fn((...args: unknown[]) => { call.steps.push([method, ...args]); return query; });
      }
      const result = () => {
        if (table === 'workout_sets') return { data: [], error: null };
        if (table === 'measurements') return { data: [{ measured_date: '2026-09-01', weight_kg: 80 }], error: null };
        if (table === 'workout_programs') return { data: null, error: new Error('schedule unavailable') };
        return { data: [], error: null };
      };
      query.range = vi.fn((fromIndex: number, toIndex: number) => {
        call.steps.push(['range', fromIndex, toIndex]);
        return Promise.resolve({ data: terminalRows.slice(fromIndex, toIndex + 1), error: null });
      });
      query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve);
      return query;
    });

    const result = await loadWorkoutAnalyticsData({ client: { from } as unknown as SupabaseClient, userId: 'user-1', pageSize: 2, setBatchSize: 2 });

    expect(result.sessions.map((session) => session.id)).toEqual(['session-2', 'session-1', 'session-0']);
    expect(result.measurements).toEqual([{ measured_date: '2026-09-01', weight_kg: 80 }]);
    expect(result.issues).toEqual({ schedule: true, measurements: false, historyTruncated: false, measurementsTruncated: false });
    const sessionCalls = calls.filter((call) => call.table === 'workout_sessions');
    expect(sessionCalls.map((call) => call.steps.find(([method]) => method === 'range')?.slice(1))).toEqual([[0, 2], [2, 4]]);
    expect(sessionCalls[0].steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(sessionCalls[0].steps).toContainEqual(['not', 'completed_at', 'is', null]);
    expect(sessionCalls[0].steps.filter(([method]) => method === 'order')).toEqual([
      ['order', 'session_date', { ascending: false }],
      ['order', 'completed_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    expect(calls.filter((call) => call.table === 'workout_sets').map((call) => call.steps.find(([method]) => method === 'in')?.[2])).toEqual([
      ['session-2', 'session-1'],
      ['session-0'],
    ]);
    expect(calls.find((call) => call.table === 'measurements')?.steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(calls.find((call) => call.table === 'measurements')?.steps).toContainEqual(['limit', 251]);
    expect(calls.find((call) => call.table === 'workout_programs')?.steps).toContainEqual(['eq', 'client_id', 'user-1']);
    expect(calls.find((call) => call.table === 'workout_programs')?.steps).toContainEqual(['eq', 'status', 'active']);
  });

  it('caps body-weight evidence and reports measurement truncation', async () => {
    const measurements = Array.from({ length: 251 }, (_, index) => ({
      measured_date: `2026-${String(1 + Math.floor(index / 28)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`,
      weight_kg: 80 - index / 100,
    }));
    const from = vi.fn((table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'in']) query[method] = vi.fn(() => query);
      query.limit = vi.fn((limit: number) => {
        query.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: measurements.slice(0, limit), error: null }).then(resolve);
        return query;
      });
      query.range = vi.fn(() => Promise.resolve({ data: [], error: null }));
      query.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: table === 'workout_programs' ? [] : [], error: null }).then(resolve);
      return query;
    });

    const result = await loadWorkoutAnalyticsData({ client: { from } as unknown as SupabaseClient, userId: 'user-1', measurementLimit: 250 });

    expect(result.measurements).toHaveLength(250);
    expect(result.issues.measurementsTruncated).toBe(true);
  });
});
