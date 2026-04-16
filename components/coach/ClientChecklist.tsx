'use client';

import { memo, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  emoji: string;
  completed: boolean;
  clientName: string;
  priority: 'high' | 'medium' | 'low';
}

interface ClientChecklistProps {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
}

const PRIORITY_COLORS: Record<ChecklistItem['priority'], { dot: string; border: string }> = {
  high: { dot: '#f87171', border: 'rgba(248, 113, 113, 0.3)' },
  medium: { dot: '#D4A853', border: 'rgba(212, 168, 83, 0.3)' },
  low: { dot: '#78716c', border: 'rgba(120, 113, 108, 0.2)' },
};

export default memo(function ClientChecklist({ items, onToggle }: ClientChecklistProps) {
  const completedCount = useMemo(() => items.filter((i) => i.completed).length, [items]);
  const total = items.length;
  const progress = total > 0 ? completedCount / total : 0;

  const sorted = useMemo(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...items].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return order[a.priority] - order[b.priority];
    });
  }, [items]);

  const handleToggle = useCallback(
    (id: string) => {
      onToggle(id);
    },
    [onToggle],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Today&apos;s Checklist
        </h3>
        <span className="text-[#D4A853] text-xs font-semibold">
          {completedCount}/{total} done
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: '#D4A853' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="space-y-1">
        {sorted.length === 0 && (
          <p className="text-stone-500 text-xs text-center py-6">No tasks for today</p>
        )}

        {sorted.map((item, i) => {
          const pColors = PRIORITY_COLORS[item.priority];
          return (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              onClick={() => handleToggle(item.id)}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left group"
            >
              {/* Checkbox */}
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors"
                style={{
                  borderColor: item.completed ? '#D4A853' : pColors.border,
                  backgroundColor: item.completed ? 'rgba(212, 168, 83, 0.2)' : 'transparent',
                }}
              >
                {item.completed && <Check size={12} style={{ color: '#D4A853' }} />}
              </div>

              {/* Priority dot */}
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: pColors.dot }}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-snug transition-colors ${
                    item.completed
                      ? 'text-stone-600 line-through'
                      : 'text-stone-200'
                  }`}
                >
                  <span className="mr-1.5">{item.emoji}</span>
                  {item.text}
                </p>
                <p className="text-stone-500 text-[10px] truncate">{item.clientName}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
});
