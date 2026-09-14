/**
 * Optimistic delete/undo bookkeeping for the Food log.
 *
 * A soft-deleted entry only exists on the day it was logged. Restoring it into
 * whatever day happens to be selected would inject a phantom row (and inflate
 * that day's totals/meal cards), so every restore path funnels through this
 * date-scoped insert. Kept pure so the date guard is unit-testable.
 */
export function insertEntryForDate<T extends { id: string; created_at: string; logged_date: string }>(
  entries: T[],
  entry: T,
  selectedDate: string,
): T[] {
  if (entry.logged_date !== selectedDate) return entries;
  if (entries.some((existing) => existing.id === entry.id)) return entries;
  return [...entries, entry].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
