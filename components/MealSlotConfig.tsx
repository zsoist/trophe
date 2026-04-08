'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { MealSlot } from './MealSlotCard';
import type { MealType } from '@/lib/types';

interface MealSlotConfigProps {
  slots: MealSlot[];
  onSave: (slots: MealSlot[]) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['🌅', '🍎', '☀️', '🥜', '🌙', '💪', '🏋️', '🥗', '🍌', '☕', '🥤', '🍳'];
const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'snack', label: 'Snack' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'pre_workout', label: 'Pre-WO' },
  { value: 'post_workout', label: 'Post-WO' },
];

export default function MealSlotConfig({ slots: initialSlots, onSave, onClose }: MealSlotConfigProps) {
  const { t } = useI18n();
  const [slots, setSlots] = useState<MealSlot[]>(initialSlots);
  const [editingEmoji, setEditingEmoji] = useState<string | null>(null);

  const addSlot = () => {
    const id = `custom_${Date.now()}`;
    setSlots([...slots, {
      id,
      mealType: 'snack',
      label: 'New Meal',
      emoji: '🍽️',
      order: slots.length,
    }]);
  };

  const removeSlot = (id: string) => {
    if (slots.length <= 2) return;
    setSlots(slots.filter(s => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<MealSlot>) => {
    setSlots(slots.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const moveSlot = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= slots.length) return;
    const newSlots = [...slots];
    [newSlots[index], newSlots[newIndex]] = [newSlots[newIndex], newSlots[index]];
    newSlots.forEach((s, i) => s.order = i);
    setSlots(newSlots);
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
        className="w-full max-w-md bg-stone-900 rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-stone-100 font-semibold">Customize Meals</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 p-2 -mr-2">
            <X size={20} />
          </button>
        </div>

        {/* Slot list — mobile-friendly stacked layout */}
        <div className="space-y-2 mb-4">
          {slots.map((slot, index) => (
            <div key={slot.id} className="glass p-3 relative">
              {/* Top row: emoji + label + reorder */}
              <div className="flex items-center gap-2 mb-2">
                {/* Emoji button */}
                <button
                  onClick={() => setEditingEmoji(editingEmoji === slot.id ? null : slot.id)}
                  className="text-2xl hover:scale-110 transition-transform flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-white/[0.05]"
                >
                  {slot.emoji}
                </button>

                {/* Label input */}
                <input
                  type="text"
                  value={slot.label}
                  onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                  className="input-dark flex-1 text-sm py-2 min-w-0"
                  maxLength={20}
                  placeholder="Meal name"
                />

                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => moveSlot(index, -1)}
                    disabled={index === 0}
                    className="text-stone-600 hover:text-stone-300 disabled:opacity-20 p-0.5"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveSlot(index, 1)}
                    disabled={index === slots.length - 1}
                    className="text-stone-600 hover:text-stone-300 disabled:opacity-20 p-0.5"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {/* Bottom row: type selector + delete */}
              <div className="flex items-center gap-2 pl-12">
                <select
                  value={slot.mealType}
                  onChange={(e) => updateSlot(slot.id, { mealType: e.target.value as MealType })}
                  className="input-dark text-xs py-1.5 flex-1"
                >
                  {MEAL_TYPES.map(mt => (
                    <option key={mt.value} value={mt.value}>{mt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeSlot(slot.id)}
                  disabled={slots.length <= 2}
                  className="text-stone-600 hover:text-red-400 disabled:opacity-20 p-2 flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Emoji picker — positioned inside the card, below the emoji button */}
              <AnimatePresence>
                {editingEmoji === slot.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 glass-elevated p-2 rounded-lg grid grid-cols-6 gap-2 overflow-hidden"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { updateSlot(slot.id, { emoji }); setEditingEmoji(null); }}
                        className="text-xl hover:scale-125 transition-transform p-1.5 rounded-lg hover:bg-white/[0.1] flex items-center justify-center"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Add slot button */}
        {slots.length < 8 && (
          <button
            onClick={addSlot}
            className="w-full glass p-3 text-stone-500 hover:text-stone-300 text-sm flex items-center justify-center gap-2 transition-colors mb-4"
          >
            <Plus size={14} />
            Add Meal Slot
          </button>
        )}

        {/* Action buttons — sticky at bottom */}
        <div className="flex gap-2 sticky bottom-0 pt-2 bg-stone-900">
          <button onClick={onClose} className="btn-ghost flex-1 py-3 text-sm">
            {t('general.cancel')}
          </button>
          <button
            onClick={() => { onSave(slots); onClose(); }}
            className="btn-gold flex-1 py-3 text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
