'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';

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
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'dark' ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            <Moon size={16} className="text-stone-400" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            <Sun size={16} className="text-amber-500" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
