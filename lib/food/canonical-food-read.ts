import { localDateStr, localToday } from '@/lib/utils/dates';
import { parseClientViewPrefs, type ClientViewPanelId } from '@/lib/display-prefs';

/**
 * Actor-bound authoritative read of the canonical Food log — the SAME authorized read the Food
 * surface (`app/dashboard/log`) renders, extracted so any route can refresh it without the Food
 * page being mounted. It returns real, validated state (the relevant day's full entries, the week
 * totals, the profile targets/preferences and the streak), never a bare row-existence boolean:
 * the previous `id,user_id`-only placeholder refreshed no nutrition/date/totals/context.
 *
 * It never writes, never retries and never invents ids — only the caller-supplied actor/entry/date
 * inputs are used. RLS is the real boundary; the explicit `user_id` scoping makes the actor binding
 * obvious. The read is pure: it returns its snapshot to the caller and retains/publishes nothing, so
 * there is no retained cache, subscription or invalidation surface for stale state, cross-actor
 * leakage or request reordering to regress. Every consumer (the Food surface reloading on mount, or
 * a host confirming that a committed entry is now current) runs its own actor-bound read.
 */

export interface CanonicalFoodTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CanonicalFoodWeekDay {
  date: string;
  calories: number;
  entries: number;
}

/** One relevant day of the canonical log, with its derived macro totals. */
export interface CanonicalFoodDay<TEntry = Record<string, unknown>> {
  date: string;
  entries: TEntry[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CanonicalFoodSnapshot<TEntry = Record<string, unknown>> {
  actorId: string;
  /** Primary date (the requested/seeded day), always present in `days`. */
  date: string;
  /** Every date touched by the requested entry ids (plus the primary date), ascending. */
  dates: string[];
  days: CanonicalFoodDay<TEntry>[];
  week: CanonicalFoodWeekDay[];
  targets: CanonicalFoodTargets;
  viewPrefs: Partial<Record<ClientViewPanelId, boolean>>;
  streak: number;
  /** Ids from the requested entry set that were observed in the authorized read. */
  presentEntryIds: string[];
  readAt: string;
}

export interface CanonicalFoodReadResult<TEntry = Record<string, unknown>> {
  ok: boolean;
  /** Every requested entry id was observed in the authorized read (true when none requested). */
  found: boolean;
  snapshot?: CanonicalFoodSnapshot<TEntry>;
  /** The actor has no client profile yet; the Food surface routes to onboarding. */
  missingProfile?: boolean;
}

const STREAK_LOOKBACK_DAYS = 60;

function macroSum(entries: Array<Record<string, unknown>>, column: string): number {
  return entries.reduce((sum, entry) => {
    const value = entry?.[column];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
}

/** Monday-started week containing `date`, as ascending local date strings. */
function weekDates(date: string): string[] {
  const anchor = new Date(`${date}T12:00:00`);
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return localDateStr(day);
  });
}

/**
 * Consecutive days (from today) with >= 3 entries. Mirrors the Food surface's streak rule.
 *
 * Stepping must be *calendar* days, not fixed 24h spans. A 24h subtraction skips a
 * local date across a spring-forward DST transition (e.g. Athens 2026-03-29:
 * 2026-03-30T00:30 local minus 24h lands on 2026-03-28), so a qualifying day is
 * never inspected and the user's streak is silently broken/undercounted. `setDate`
 * keeps the same local wall-clock day, matching `weekDates` and the previously
 * shipped page rule.
 */
function streakFromDates(counts: Map<string, number>): number {
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    if ((counts.get(localDateStr(cursor)) ?? 0) >= 3) streak++;
    else if (i > 0) break; // today may still be empty without breaking the streak
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Calendar start of the streak lookback window (today minus 60 local days). */
function streakLookbackStart(): string {
  const start = new Date();
  start.setDate(start.getDate() - STREAK_LOOKBACK_DAYS);
  return localDateStr(start);
}

/**
 * Read the canonical Food state for the actor, covering every requested receipt entry (resolved to
 * its own `logged_date`) so a multi-entry/multi-date receipt is never only first-checked.
 */
export async function readCanonicalFoodState<TEntry = Record<string, unknown>>(
  actorId: string,
  options: { date?: string; entryIds?: string[] } = {},
): Promise<CanonicalFoodReadResult<TEntry>> {
  const entryIds = [...new Set((options.entryIds ?? []).filter(Boolean))];
  try {
    // Loaded lazily: a host that injects its own reader never constructs the browser client, and
    // this module stays importable without auth env at module-evaluation time.
    const { supabase } = await import('@/lib/supabase');

    // Resolve each requested entry to its date so derivations cover the actual receipt location.
    let resolvedDates: string[] = [];
    if (entryIds.length) {
      const { data: rows, error: rowsError } = await supabase
        .from('food_log').select('id, logged_date').eq('user_id', actorId).in('id', entryIds);
      if (rowsError || !rows) return { ok: false, found: false };
      resolvedDates = (rows as Array<{ logged_date?: string | null }>)
        .map(row => row.logged_date)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    }
    const primaryDate = options.date ?? resolvedDates[0] ?? localToday();
    const dates = [...new Set([primaryDate, ...resolvedDates])].sort();

    const week = weekDates(primaryDate);
    const [entriesRes, weekRes, profileRes, streakRes] = await Promise.all([
      supabase.from('food_log').select('*')
        .eq('user_id', actorId).in('logged_date', dates)
        .order('created_at', { ascending: true }),
      supabase.from('food_log').select('logged_date, calories')
        .eq('user_id', actorId)
        .gte('logged_date', week[0]).lte('logged_date', week[6]),
      supabase.from('client_profiles')
        .select('target_calories, target_protein_g, target_carbs_g, target_fat_g, client_view_prefs')
        .eq('user_id', actorId).maybeSingle(),
      supabase.from('food_log').select('logged_date')
        .eq('user_id', actorId)
        .gte('logged_date', streakLookbackStart())
        .order('logged_date', { ascending: false }),
    ]);

    const failure = [entriesRes.error, weekRes.error, profileRes.error, streakRes.error].find(Boolean);
    if (failure || !entriesRes.data || !weekRes.data || !streakRes.data) return { ok: false, found: false };
    if (!profileRes.data) return { ok: false, found: false, missingProfile: true };

    const rows = entriesRes.data as TEntry[];
    const asRecord = (entry: TEntry) => entry as unknown as Record<string, unknown>;
    const days: CanonicalFoodDay<TEntry>[] = dates.map(date => {
      const dayEntries = rows.filter(entry => asRecord(entry)?.logged_date === date);
      const records = dayEntries.map(asRecord);
      return {
        date,
        entries: dayEntries,
        calories: macroSum(records, 'calories'),
        protein_g: macroSum(records, 'protein_g'),
        carbs_g: macroSum(records, 'carbs_g'),
        fat_g: macroSum(records, 'fat_g'),
      };
    });
    const presentEntryIds = entryIds.filter(id => rows.some(entry => asRecord(entry)?.id === id));

    const weekRows = weekRes.data as Array<{ logged_date?: string | null; calories?: number | null }>;
    const counts = new Map<string, number>();
    for (const row of streakRes.data as Array<{ logged_date?: string | null }>) {
      if (typeof row.logged_date === 'string') counts.set(row.logged_date, (counts.get(row.logged_date) ?? 0) + 1);
    }
    const snapshot: CanonicalFoodSnapshot<TEntry> = {
      actorId,
      date: primaryDate,
      dates,
      days,
      week: week.map(date => {
        const dayRows = weekRows.filter(row => row.logged_date === date);
        return { date, calories: dayRows.reduce((sum, row) => sum + (row.calories ?? 0), 0), entries: dayRows.length };
      }),
      targets: {
        calories: profileRes.data.target_calories || 0,
        protein_g: profileRes.data.target_protein_g || 0,
        carbs_g: profileRes.data.target_carbs_g || 0,
        fat_g: profileRes.data.target_fat_g || 0,
      },
      viewPrefs: parseClientViewPrefs(profileRes.data.client_view_prefs),
      streak: streakFromDates(counts),
      presentEntryIds,
      readAt: new Date().toISOString(),
    };

    return { ok: true, found: entryIds.length === 0 || presentEntryIds.length === entryIds.length, snapshot };
  } catch {
    return { ok: false, found: false };
  }
}

/**
 * Narrow compatibility seam used by hosts that only need to confirm that the just-committed entry
 * (and its derived day/week/context) is now current. It performs the FULL canonical read above and
 * reports `found` from the observed entry set — never a `id,user_id`-only existence check.
 */
export async function confirmCanonicalFoodEntry(actorId: string, entryId: string): Promise<{ ok: boolean; found: boolean }> {
  const result = await readCanonicalFoodState(actorId, { entryIds: [entryId] });
  return { ok: result.ok, found: result.found };
}
