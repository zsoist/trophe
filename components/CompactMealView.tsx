'use client';

import { motion } from 'framer-motion';
import type { FoodLogEntry } from '@/lib/types';
import type { MealSlot } from './MealSlotCard';

interface CompactMealViewProps {
  slots: MealSlot[];
  grouped: Record<string, FoodLogEntry[]>;
  skipped: Set<string>;
  locked: Set<string>;
  onSelectSlot: (slotId: string) => void;
}

// F50: Compact view — emoji + calories only, one row per slot
export default function CompactMealView({ slots, grouped, skipped, locked, onSelectSlot }: CompactMealViewProps) {
  return (
    <div className="glass p-3">
      <div className="space-y-1">
        {slots.map((slot, i) => {
          const entries = grouped[slot.id] || [];
          const totalCal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
          const isSkipped = skipped.has(slot.id);
          const isLocked = locked.has(slot.id);
          const isEmpty = entries.length === 0 && !isSkipped;

          return (
            <motion.button
              key={slot.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onSelectSlot(slot.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                isEmpty ? 'hover:bg-white/[0.03]'
                : isLocked ? 'bg-green-500/5'
                : 'bg-white/[0.03] hover:bg-white/[0.06]'
              } ${isSkipped ? 'opacity-40' : ''}`}
            >
              <span className="text-sm">{slot.emoji}</span>
              <span className={`text-xs flex-1 text-left ${isSkipped ? 'line-through text-stone-600' : 'text-stone-400'}`}>
                {slot.label}
              </span>
              {entries.length > 0 && (
                <>
                  <span className="text-xs text-stone-500">({entries.length})</span>
                  <span className="text-xs gold-text font-medium w-12 text-right">{Math.round(totalCal)}</span>
                </>
              )}
              {isSkipped && <span className="text-[9px] text-stone-600">skip</span>}
              {isLocked && <span className="text-[9px] text-green-500">✓</span>}
              {isEmpty && !isSkipped && <span className="text-[9px] text-stone-700">tap</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
