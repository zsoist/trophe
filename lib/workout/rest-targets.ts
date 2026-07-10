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

export function defaultRestSeconds(isCompound: boolean | null | undefined): number {
  return isCompound ? 150 : 90;
}

function readMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function getRestTarget(exerciseId: string, isCompound?: boolean | null): number {
  const stored = readMap()[exerciseId];
  return typeof stored === 'number' && stored >= 15 ? stored : defaultRestSeconds(isCompound);
}

export function setRestTarget(exerciseId: string, seconds: number): void {
  if (typeof window === 'undefined') return;
  const map = readMap();
  map[exerciseId] = seconds;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota errors are non-fatal — target just won't persist */
  }
}
