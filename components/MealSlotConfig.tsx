'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
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
  { value: 'pre_workout', label: 'Pre-Workout' },
  { value: 'post_workout', label: 'Post-Workout' },
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
    if (slots.length <= 2) return; // Minimum 2 slots
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-stone-100 font-semibold">Customize Meals</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {slots.map((slot, index) => (
            <div key={slot.id} className="glass p-3 flex items-center gap-2">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveSlot(index, -1)}
                  disabled={index === 0}
                  className="text-stone-600 hover:text-stone-300 disabled:opacity-20"
                >
                  <GripVertical size={12} />
                </button>
              </div>

              {/* Emoji picker */}
              <button
                onClick={() => setEditingEmoji(editingEmoji === slot.id ? null : slot.id)}
                className="text-xl hover:scale-110 transition-transform"
              >
                {slot.emoji}
              </button>

              {/* Label */}
              <input
                type="text"
                value={slot.label}
                onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                className="input-dark flex-1 text-sm py-1.5"
                maxLength={20}
              />

              {/* Meal type */}
              <select
                value={slot.mealType}
                onChange={(e) => updateSlot(slot.id, { mealType: e.target.value as MealType })}
                className="input-dark text-xs py-1.5 w-24"
              >
                {MEAL_TYPES.map(mt => (
                  <option key={mt.value} value={mt.value}>{mt.label}</option>
                ))}
              </select>

              {/* Delete */}
              <button
                onClick={() => removeSlot(slot.id)}
                disabled={slots.length <= 2}
                className="text-stone-600 hover:text-red-400 disabled:opacity-20 p-1"
              >
                <Trash2 size={14} />
              </button>

              {/* Emoji picker dropdown */}
              <AnimatePresence>
                {editingEmoji === slot.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute mt-10 ml-8 glass-elevated p-2 rounded-lg grid grid-cols-6 gap-1 z-10"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { updateSlot(slot.id, { emoji }); setEditingEmoji(null); }}
                        className="text-lg hover:scale-125 transition-transform p-1"
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

        {slots.length < 8 && (
          <button
            onClick={addSlot}
            className="w-full glass p-3 text-stone-500 hover:text-stone-300 text-sm flex items-center justify-center gap-2 transition-colors mb-4"
          >
            <Plus size={14} />
            Add Meal Slot
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">
            {t('general.cancel')}
          </button>
          <button
            onClick={() => { onSave(slots); onClose(); }}
            className="btn-gold flex-1 py-2.5 text-sm"
          >
            Save
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
