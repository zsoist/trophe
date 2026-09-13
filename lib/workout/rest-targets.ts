'use client';

/**
 * Per-exercise rest-timer targets (Strong-style), persisted in localStorage.
 *
 * Defaults follow the evidence-based split top apps use: compound lifts get
 * longer recovery (150s), isolation work shorter (90s). The user can override
 * per exercise from the rest chip; overrides survive across sessions.
 */

const STORAGE_KEY = 'trophe_rest_targets';

export const REST_CHOICES = [60, 90, 120, 150, 180] as const;

const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 3600;

export function defaultRestSeconds(isCompound: boolean | null | undefined): number {
  return isCompound ? 150 : 90;
}

// The parsed override map is cached against the raw stored string. Storage is
// still read on every call (cheap, browser-cached), so a write from another tab
// is reflected, but unchanged data is no longer re-parsed for every exercise
// rendered — the live screen calls getRestTarget once per exercise per render.
let cachedRaw: string | null | undefined;
let cachedMap: Record<string, number> = {};

function readMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === cachedRaw) return cachedMap;
  cachedRaw = raw;
  if (!raw) {
    cachedMap = {};
    return cachedMap;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    cachedMap = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, number>
      : {};
  } catch {
    cachedMap = {};
  }
  return cachedMap;
}

export function getRestTarget(exerciseId: string, isCompound?: boolean | null): number {
  const stored = readMap()[exerciseId];
  return typeof stored === 'number' && Number.isInteger(stored) && stored >= MIN_REST_SECONDS && stored <= MAX_REST_SECONDS
    ? stored
    : defaultRestSeconds(isCompound);
}

export function setRestTarget(exerciseId: string, seconds: number): void {
  if (typeof window === 'undefined') return;
  if (!exerciseId.trim() || !Number.isInteger(seconds) || seconds < MIN_REST_SECONDS || seconds > MAX_REST_SECONDS) return;
  const map = { ...readMap(), [exerciseId]: seconds };
  const raw = JSON.stringify(map);
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    // Only advance the cache once the write is durable, so a quota failure
    // cannot leave an override that was never stored visible in this session.
    cachedRaw = raw;
    cachedMap = map;
  } catch {
    /* quota errors are non-fatal — target just won't persist */
  }
}
