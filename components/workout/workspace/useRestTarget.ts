'use client';

import { useCallback, useState } from 'react';
import { defaultRestSeconds, getRestTargetOverride, setRestTarget } from '@/lib/workout/rest-targets';

export interface RestTargetHandle {
  /** Effective countdown target for the current exercise, in seconds. */
  seconds: number;
  /** True when the last `choose` could not be durably stored. */
  failed: boolean;
  /** Persist an override for the current exercise; returns whether it stuck. */
  choose: (seconds: number) => boolean;
}

/**
 * Wires the canonical `getRestTarget`/`setRestTarget` storage to a live surface.
 *
 * Precedence: an explicit stored override wins; otherwise the caller's plan
 * prescription (`fallbackSeconds`) is used, falling back to the compound /
 * isolation default. Presence is read through `getRestTargetOverride`, so an
 * override equal to the exercise's default (150s pick on a 150s-default compound
 * whose plan prescribed 90s) still wins after a remount — it is never inferred
 * from equality with the fallback.
 *
 * Storage is synchronous and may silently fail (quota/private mode). We never
 * claim a durable save on failure: the displayed value is only advanced to a
 * selection that reads back from storage, and `failed` flags the rest.
 */
export function useRestTarget(
  exerciseId: string | null | undefined,
  isCompound?: boolean | null,
  fallbackSeconds?: number | null,
): RestTargetHandle {
  const [revision, setRevision] = useState(0);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const id = exerciseId ?? null;

  const canonicalDefault = defaultRestSeconds(isCompound);
  // Bumping `revision` after a durable write forces this component to re-render;
  // the value itself is always read fresh from the canonical cache below.
  void revision;
  const storedOverride = id ? getRestTargetOverride(id) : undefined;
  const seconds = id ? storedOverride ?? fallbackSeconds ?? canonicalDefault : canonicalDefault;

  const choose = useCallback((next: number) => {
    if (!id) return false;
    setRestTarget(id, next);
    const persisted = getRestTargetOverride(id) === next;
    if (persisted) {
      setFailedFor((current) => (current === id ? null : current));
      setRevision((current) => current + 1);
    } else {
      setFailedFor(id);
    }
    return persisted;
  }, [id]);

  return { seconds, failed: failedFor === id && failedFor !== null, choose };
}
