'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

type SuggestionType = 'concern' | 'progression' | 'check_in';

interface Suggestion {
  emoji: string;
  text: string;
  type: SuggestionType;
}

interface SmartNoteSuggestionsProps {
  suggestions: Suggestion[];
  onSelect?: (text: string) => void;
}

const TYPE_STYLES: Record<SuggestionType, { bg: string; border: string }> = {
  concern: {
    bg: 'rgba(248, 113, 113, 0.08)',
    border: 'rgba(248, 113, 113, 0.2)',
  },
  progression: {
    bg: 'rgba(74, 222, 128, 0.08)',
    border: 'rgba(74, 222, 128, 0.2)',
  },
  check_in: {
    bg: 'rgba(212, 168, 83, 0.08)',
    border: 'rgba(212, 168, 83, 0.2)',
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
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-stone-300 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              style={{
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <span className="text-sm">{s.emoji}</span>
              <span>{s.text}</span>
            </motion.button>
          );
        })}
      </div>

      {suggestions.length === 0 && (
        <p className="text-stone-500 text-xs text-center py-4">
          No suggestions available
        </p>
      )}
    </motion.div>
  );
});
