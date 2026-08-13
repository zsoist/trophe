'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Palette, X, Check, Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/components/shared/AppearanceProvider';
import { ACCENTS } from '@/lib/appearance';
import { useThemeMode } from '@/components/shared/ThemeMode';
import { useI18n } from '@/lib/i18n';

interface ThemePickerProps {
  onClose: () => void;
}

export default function ThemePicker({ onClose }: ThemePickerProps) {
  const { prefs, setPrefs } = useAppearance();
  const { mode, toggleMode } = useThemeMode();
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();

  const handleSelect = (id: string) => {
    setPrefs({ ...prefs, accent: id });
  };

  return (
    <motion.div
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: reducedMotion ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.15 }}
      className="fixed inset-0 z-50 bg-[var(--surface-overlay)] flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25 }}
        role="dialog"
        aria-modal="true"
        aria-label="Appearance"
        className="w-full max-w-md bg-[var(--surface-1)] rounded-t-2xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
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
          aria-pressed={mode === 'dark'}
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
              aria-label={t(theme.labelKey)}
              aria-pressed={prefs.accent === theme.id}
              className={`min-h-11 min-w-11 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                prefs.accent === theme.id
                  ? 'border-[var(--border-focus)] bg-[var(--surface-2)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center"
                style={{ backgroundColor: theme.value }}
              >
                {prefs.accent === theme.id && <Check size={14} className="text-[var(--content-inverse)]" />}
              </div>
              <p className="text-xs text-[var(--content-secondary)] text-center">{t(theme.labelKey)}</p>
            </button>
          ))}
        </div>

        <button onClick={onClose} className="btn-gold min-h-11 w-full py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}
