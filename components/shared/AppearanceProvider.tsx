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
  // Once the user edits, the mount-time remote fetch must not overwrite their
  // choice (the "slow profiles fetch reverts my accent" race).
  const dirtyRef = useRef(false);

  // 1) Local first — applies before any network round-trip.
  useEffect(() => {
    const local = loadLocalAppearance();
    setPrefsState(local);
    applyAppearance(local);
  }, []);

  // 2) DB sync, driven by auth state so client-side LOGIN (no root remount)
  //    still wires userIdRef + pulls cross-device prefs. onAuthStateChange
  //    fires immediately with the current session, covering initial load too.
  useEffect(() => {
    let cancelled = false;

    const pull = async (uid: string) => {
      userIdRef.current = uid;
      const { data } = await supabase.from('profiles').select('display_prefs').eq('id', uid).maybeSingle();
      const remote = (data?.display_prefs as { appearance?: unknown } | null)?.appearance;
      // Don't clobber an edit the user made while this fetch was in flight.
      if (remote && !cancelled && !dirtyRef.current) {
        const parsed = parseAppearance(remote);
        setPrefsState(parsed);
        applyAppearance(parsed);
        saveLocalAppearance(parsed);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void pull(session.user.id);
      } else {
        userIdRef.current = null;
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const setPrefs = useCallback((next: AppearancePrefs) => {
    dirtyRef.current = true;
    setPrefsState(next);
    applyAppearance(next);
    saveLocalAppearance(next);
    // Debounced ATOMIC persist — jsonb_set on just the 'appearance' key (RPC,
    // migration 0054) so a concurrent writer to another display_prefs key
    // (coach panel prefs) can't clobber this and vice-versa.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      const { error } = await supabase.rpc('set_display_prefs_key', {
        p_key: 'appearance',
        p_value: next as unknown as Record<string, unknown>,
      });
      if (error) console.error('appearance save failed:', error.message);
    }, 600);
  }, []);

  return (
    <AppearanceContext.Provider value={{ prefs, setPrefs }}>
      {children}
    </AppearanceContext.Provider>
  );
}
