import { describe, expect, it } from 'vitest';
import { chunkIds, fetchAllTerminalSessionPages } from '@/lib/workout/analytics-data';

describe('analytics terminal pagination', () => {
  it('fetches beyond one page, stops on the short page, and dedupes ids', async () => {
    const calls: Array<[number, number]> = [];
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), session_date: '2026-09-01', completed_at: index === 3 ? null : '2026-09-01T12:00:00Z' }));
    const result = await fetchAllTerminalSessionPages(async (from, to) => { calls.push([from, to]); return rows.slice(from, to + 1); });
    expect(result).toHaveLength(1000); expect(calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(chunkIds(Array.from({ length: 1001 }, (_, index) => String(index)))).toHaveLength(3);
  });
});
