'use client';

import { motion } from 'framer-motion';
import { Palette, X, Check, Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/components/shared/AppearanceProvider';
import { ACCENTS } from '@/lib/appearance';
import { useThemeMode } from '@/components/shared/ThemeMode';

interface ThemePickerProps {
  onClose: () => void;
}

export default function ThemePicker({ onClose }: ThemePickerProps) {
  const { prefs, setPrefs } = useAppearance();
  const { mode, toggleMode } = useThemeMode();

  const handleSelect = (id: string) => {
    setPrefs({ ...prefs, accent: id });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="w-full max-w-md bg-[var(--surface-1)] rounded-t-2xl p-4 safe-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-[var(--content-secondary)]" />
            <h2 className="text-[var(--content-primary)] font-semibold">Appearance</h2>
          </div>
          <button onClick={onClose} aria-label="Close appearance picker" className="min-h-11 min-w-11 text-[var(--content-muted)] hover:text-[var(--content-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <X size={18} />
          </button>
        </div>

        <button
          onClick={toggleMode}
          className="mb-4 flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--border-default)] bg-[var(--surface-2)] px-3 text-sm text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <span>{mode === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          {mode === 'dark' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        </button>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {ACCENTS.map(theme => (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              aria-pressed={prefs.accent === theme.id}
              className={`min-h-11 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                prefs.accent === theme.id
                  ? 'border-[var(--border-focus)] bg-[var(--surface-2)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center"
                style={{ backgroundColor: theme.value }}
              >
                {prefs.accent === theme.id && <Check size={14} className="text-black" />}
              </div>
              <p className="text-xs text-[var(--content-secondary)] text-center">{theme.id}</p>
            </button>
          ))}
        </div>

        <button onClick={onClose} className="btn-gold w-full py-2.5 text-sm">
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}
