'use client';
import { useEffect } from 'react';
import { publishScreenSelection, type CoachScreenSelection } from './screen-selection';

/** Callers memoize their current loaded selection; cleanup cannot erase a newer route. */
export function useCoachScreenSelection(selection: CoachScreenSelection | null) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED !== '1') return;
    return publishScreenSelection(selection);
  }, [selection]);
}
