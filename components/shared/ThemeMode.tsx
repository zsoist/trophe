'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import {
  applyThemeMode,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/lib/theme';

// PERF: no framer-motion here — this provider wraps every page and the icon
// swap is a 200ms CSS animation (.theme-icon-in in globals.css).

// ═══════════════════════════════════════════════
// Theme Mode Context
// ═══════════════════════════════════════════════

interface ThemeModeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'dark',
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

// ═══════════════════════════════════════════════
// Provider — wraps the app, manages <html> class
// ═══════════════════════════════════════════════

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof document === 'undefined') return 'dark';
    return resolveInitialTheme(readStoredTheme(), document.documentElement.className);
  });

  const toggleMode = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    persistTheme(next);
    applyThemeMode(next, document);
  }, [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Theme changes still apply when storage is unavailable.
  }
}

// ═══════════════════════════════════════════════
// Toggle Button — Sun/Moon animated swap
// ═══════════════════════════════════════════════

export function ThemeModeToggle({ className = '' }: { className?: string }) {
  const { toggleMode } = useThemeMode();

  return (
    <button
      onClick={toggleMode}
      className={`relative min-h-11 min-w-11 rounded-xl border border-[var(--border-default)] flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] ${className}`}
      title="Toggle color theme"
      aria-label="Toggle color theme"
    >
      <div
        data-theme-icon="dark"
        aria-hidden="true"
        className="theme-icon-in [.light_&]:hidden"
      >
        <Moon size={16} className="text-[var(--content-muted)]" />
      </div>
      <div
        data-theme-icon="light"
        aria-hidden="true"
        className="theme-icon-in hidden [.light_&]:block"
      >
        <Sun size={16} className="text-amber-500" />
      </div>
    </button>
  );
}
