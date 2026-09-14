import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { insertEntryForDate } from '@/components/food/log-entry-restore';

// Regression (data integrity): the food-log Undo path re-injected a soft-deleted
// entry into whatever day was currently selected. Counterexample — delete an item
// on 2026-09-12, tap "Previous day" (the undo toast survived the date change),
// then press Undo: the 09-12 item appeared under 09-11 and inflated that day's
// totals and meal card until the next refetch. The sibling restore-on-failed-delete
// path already guarded the date; both now share insertEntryForDate.

type Entry = { id: string; created_at: string; logged_date: string };

const entry = (id: string, logged_date: string, created_at: string): Entry => ({
  id, logged_date, created_at,
});

describe('undo restores an entry only into its own day', () => {
  it('does not inject yesterday\u2019s deleted item into today', () => {
    const yesterday = entry('a', '2026-09-11', '2026-09-11T12:00:00.000Z');
    const todayLog = [entry('b', '2026-09-12', '2026-09-12T08:00:00.000Z')];

    const next = insertEntryForDate(todayLog, yesterday, '2026-09-12');

    expect(next).toBe(todayLog);
    expect(next.some((e) => e.id === 'a')).toBe(false);
  });

  it('restores the entry on its matching day, in created_at order', () => {
    const restored = entry('a', '2026-09-12', '2026-09-12T09:00:00.000Z');
    const todayLog = [
      entry('b', '2026-09-12', '2026-09-12T08:00:00.000Z'),
      entry('c', '2026-09-12', '2026-09-12T10:00:00.000Z'),
    ];

    const next = insertEntryForDate(todayLog, restored, '2026-09-12');

    expect(next.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('is idempotent when the entry is already present', () => {
    const existing = entry('a', '2026-09-12', '2026-09-12T09:00:00.000Z');
    const todayLog = [existing];

    expect(insertEntryForDate(todayLog, existing, '2026-09-12')).toBe(todayLog);
  });
});

describe('the page cannot leave a stale undo affordance across a date change', () => {
  const source = readFileSync(join(process.cwd(), 'app/dashboard/log/page.tsx'), 'utf8');

  it('clears every pending affordance (delete + batch) when the selected date changes', () => {
    const dateBlock = source.slice(
      source.indexOf('const handleDateChange = useCallback'),
      source.indexOf('const saveSkipped ='),
    );
    expect(dateBlock).toContain('clearPending();');
  });

  it('routes every restore through the shared date-scoped helper', () => {
    // Both the delete-failure restore and the Undo re-insert funnel through the
    // hook's single onRestore callback, which is date-scoped by selectedDateRef.
    expect(source).toContain('insertEntryForDate(prev, entry, selectedDateRef.current)');
    expect(source).toContain('onRestore: (entry) => setTodayLog');
  });
});
