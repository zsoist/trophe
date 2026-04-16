/**
 * Timezone-safe date utilities.
 *
 * All functions use the browser's local timezone (via Date local methods)
 * instead of UTC (via toISOString), so "today" means the user's actual
 * calendar day regardless of their GMT offset.
 */

/** Current local date as YYYY-MM-DD */
export function localToday(): string {
  return localDateStr(new Date());
}

/** Convert a Date to YYYY-MM-DD in the browser's local timezone */
export function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
