'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from '@/components/ui';

type SuggestionType = 'concern' | 'progression' | 'check_in';

interface Suggestion {
  icon: IconName;
  text: string;
  type: SuggestionType;
}

interface SmartNoteSuggestionsProps {
  suggestions: Suggestion[];
  onSelect?: (text: string) => void;
}

const TYPE_STYLES: Record<SuggestionType, { bg: string; border: string }> = {
  concern: {
    bg: 'var(--status-danger-bg)',
    border: 'var(--status-danger-bg)',
  },
  progression: {
    bg: 'var(--status-success-bg)',
    border: 'var(--status-success-bg)',
  },
  check_in: {
    bg: 'var(--status-warning-bg)',
    border: 'var(--status-warning-bg)',
  },
};

export default memo(function SmartNoteSuggestions({
  suggestions,
  onSelect,
}: SmartNoteSuggestionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-3">
        Quick Notes
      </h3>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => {
          const style = TYPE_STYLES[s.type];
          return (
            <motion.button
              key={`${s.text}-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              onClick={() => onSelect?.(s.text)}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[var(--content-secondary)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
              style={{
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <Icon name={s.icon} size={13} className="flex-shrink-0" aria-hidden />
              <span>{s.text}</span>
            </motion.button>
          );
        })}
      </div>

      {suggestions.length === 0 && (
        <p className="text-[var(--content-muted)] text-xs text-center py-4">
          No suggestions available
        </p>
      )}
    </motion.div>
  );
});
