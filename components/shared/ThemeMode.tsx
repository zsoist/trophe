'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

// PERF: no framer-motion here — this provider wraps every page and the icon
// swap is a 200ms CSS animation (.theme-icon-in in globals.css).

// ═══════════════════════════════════════════════
// Theme Mode Context
// ═══════════════════════════════════════════════

type ThemeMode = 'dark' | 'light';

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
  const [mode, setMode] = useState<ThemeMode>('dark');

  // Read from localStorage on mount and apply
  useEffect(() => {
    const stored = localStorage.getItem('trophe_theme_mode') as ThemeMode | null;
    const initial = stored === 'light' ? 'light' : 'dark';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(initial);
    applyModeClass(initial);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('trophe_theme_mode', next);
      applyModeClass(next);
      return next;
    });
  }, []);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeModeContext.Provider>
  );
}

function applyModeClass(mode: ThemeMode) {
  const html = document.documentElement;
  if (mode === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
  }
}

// ═══════════════════════════════════════════════
// Toggle Button — Sun/Moon animated swap
// ═══════════════════════════════════════════════

export function ThemeModeToggle({ className = '' }: { className?: string }) {
  const { mode, toggleMode } = useThemeMode();

  return (
    <button
      onClick={toggleMode}
      className={`relative w-9 h-9 rounded-xl border border-white/10 dark:border-white/10 light:border-stone-200 flex items-center justify-center transition-colors hover:bg-white/5 dark:hover:bg-white/5 ${className}`}
      title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {mode === 'dark' ? (
        <div key="moon" className="theme-icon-in">
          <Moon size={16} className="text-stone-400" />
        </div>
      ) : (
        <div key="sun" className="theme-icon-in">
          <Sun size={16} className="text-amber-500" />
        </div>
      )}
    </button>
  );
}
