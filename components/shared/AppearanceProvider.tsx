'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import {
  type AppearancePrefs, DEFAULT_APPEARANCE, applyAppearance,
  loadLocalAppearance, parseAppearance, saveLocalAppearance,
} from '@/lib/appearance';

/**
 * User-owned appearance context. Order of truth:
 *   1. localStorage applies on mount (instant, no network wait)
 *   2. profiles.display_prefs.appearance syncs over it (cross-device)
 *   3. every setPrefs writes CSS vars immediately + persists to both
 * Anonymous/marketing pages never fetch — the DB sync only runs when a
 * Supabase session exists.
 */

interface AppearanceContextValue {
  prefs: AppearancePrefs;
  setPrefs: (next: AppearancePrefs) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  prefs: DEFAULT_APPEARANCE,
  setPrefs: () => {},
});

export function useAppearance() {
  return useContext(AppearanceContext);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);
  const userIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) Local first — applies before any network round-trip.
  useEffect(() => {
    const local = loadLocalAppearance();
    setPrefsState(local);
    applyAppearance(local);
  }, []);

  // 2) DB sync (authenticated users only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (!user || cancelled) return;
      userIdRef.current = user.id;
      const { data } = await supabase.from('profiles').select('display_prefs').eq('id', user.id).maybeSingle();
      const remote = (data?.display_prefs as { appearance?: unknown } | null)?.appearance;
      if (remote && !cancelled) {
        const parsed = parseAppearance(remote);
        setPrefsState(parsed);
        applyAppearance(parsed);
        saveLocalAppearance(parsed);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setPrefs = useCallback((next: AppearancePrefs) => {
    setPrefsState(next);
    applyAppearance(next);
    saveLocalAppearance(next);
    // Debounced remote persist — merge into display_prefs without clobbering
    // any other keys (coach panel prefs live in the same jsonb).
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      const { data } = await supabase.from('profiles').select('display_prefs').eq('id', uid).maybeSingle();
      const merged = { ...((data?.display_prefs as Record<string, unknown>) ?? {}), appearance: next };
      await supabase.from('profiles').update({ display_prefs: merged }).eq('id', uid);
    }, 600);
  }, []);

  return (
    <AppearanceContext.Provider value={{ prefs, setPrefs }}>
      {children}
    </AppearanceContext.Provider>
  );
}
