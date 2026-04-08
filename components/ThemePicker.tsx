'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, X, Check } from 'lucide-react';

interface ThemePickerProps {
  onClose: () => void;
}

const THEMES = [
  { id: 'gold', label: 'Gold', primary: '#D4A853', dark: '#B8923E', light: '#E8C878' },
  { id: 'blue', label: 'Ocean', primary: '#3b82f6', dark: '#2563eb', light: '#60a5fa' },
  { id: 'green', label: 'Forest', primary: '#22c55e', dark: '#16a34a', light: '#4ade80' },
  { id: 'purple', label: 'Amethyst', primary: '#a855f7', dark: '#9333ea', light: '#c084fc' },
  { id: 'rose', label: 'Rose', primary: '#f43f5e', dark: '#e11d48', light: '#fb7185' },
  { id: 'amber', label: 'Amber', primary: '#f59e0b', dark: '#d97706', light: '#fbbf24' },
];

export function loadTheme(): string {
  if (typeof window === 'undefined') return 'gold';
  return localStorage.getItem('trophe_theme') || 'gold';
}

export function applyTheme(themeId: string) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  document.documentElement.style.setProperty('--color-gold', theme.primary);
  document.documentElement.style.setProperty('--color-gold-dark', theme.dark);
  document.documentElement.style.setProperty('--color-gold-light', theme.light);
  localStorage.setItem('trophe_theme', themeId);
}

// Auto-apply on load
export function useTheme() {
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);
}

export default function ThemePicker({ onClose }: ThemePickerProps) {
  const [selected, setSelected] = useState(loadTheme());

  const handleSelect = (id: string) => {
    setSelected(id);
    applyTheme(id);
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
        className="w-full max-w-md bg-stone-900 rounded-t-2xl p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-stone-300" />
            <h2 className="text-stone-100 font-semibold">Accent Color</h2>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              className={`p-3 rounded-xl border transition-all ${
                selected === theme.id
                  ? 'border-white/20 bg-white/[0.05]'
                  : 'border-white/[0.05] hover:border-white/10'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center"
                style={{ backgroundColor: theme.primary }}
              >
                {selected === theme.id && <Check size={14} className="text-black" />}
              </div>
              <p className="text-xs text-stone-400 text-center">{theme.label}</p>
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
