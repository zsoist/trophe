'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, GripVertical, Copy } from 'lucide-react';
import type { MealSlot } from './MealSlotCard';
import type { MealType } from '@/lib/types';

interface MealSlotConfigProps {
  slots: MealSlot[];
  onSave: (slots: MealSlot[]) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['🌅', '🍎', '☀️', '🥜', '🌙', '💪', '🏋️', '🥗', '🍌', '☕', '🥤', '🍳', '🥐', '🫐', '🍇', '🥩'];
const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'snack', label: 'Snack' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'pre_workout', label: 'Pre-WO' },
  { value: 'post_workout', label: 'Post-WO' },
];

export default function MealSlotConfig({ slots: initialSlots, onSave, onClose }: MealSlotConfigProps) {
  const [slots, setSlots] = useState<MealSlot[]>(initialSlots);
  const [editingEmoji, setEditingEmoji] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Touch drag state (mobile)
  const touchRef = useRef<{ startY: number; fromIndex: number; slotHeight: number } | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addSlot = () => {
    const id = `custom_${Date.now()}`;
    setSlots(prev => [...prev, {
      id,
      mealType: 'snack',
      label: 'New Meal',
      emoji: '🍽️',
      order: prev.length,
    }]);
  };

  const duplicateSlot = (slot: MealSlot) => {
    const id = `custom_${Date.now()}`;
    setSlots(prev => {
      const srcIdx = prev.findIndex(s => s.id === slot.id);
      const insertAt = srcIdx >= 0 ? srcIdx + 1 : prev.length;
      const copy: MealSlot = { ...slot, id, label: `${slot.label} 2`, order: insertAt };
      const next = [...prev.slice(0, insertAt), copy, ...prev.slice(insertAt)];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  const removeSlot = (id: string) => {
    if (slots.length <= 2) return;
    setSlots(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i })));
  };

  const updateSlot = (id: string, updates: Partial<MealSlot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setSlots(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  // ── Desktop drag handlers ───────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); // Required for drop to fire
    setDragOverIndex(index);
  };

  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null) reorder(dragIndex, toIndex);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ── Touch drag handlers (mobile) ────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent, fromIndex: number) => {
    const firstEl = slotRefs.current[0];
    touchRef.current = {
      startY: e.touches[0].clientY,
      fromIndex,
      slotHeight: firstEl ? firstEl.getBoundingClientRect().height + 8 : 70, // 8 = gap
    };
    setDragIndex(fromIndex);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - touchRef.current.startY;
    const steps = Math.round(dy / touchRef.current.slotHeight);
    const target = Math.max(0, Math.min(slots.length - 1, touchRef.current.fromIndex + steps));
    setDragOverIndex(target);
  };

  const handleTouchEnd = () => {
    if (touchRef.current !== null && dragOverIndex !== null) {
      reorder(touchRef.current.fromIndex, dragOverIndex);
    }
    touchRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
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
        className="w-full max-w-md bg-stone-900 rounded-t-2xl p-4 pb-20 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — iOS-style top bar */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-sm">
            Cancel
          </button>
          <div>
            <h2 className="text-stone-100 font-semibold text-sm">Customize Meals</h2>
            <p className="text-stone-600 text-xs text-center">Drag to reorder</p>
          </div>
          <button
            onClick={() => { onSave(slots); onClose(); }}
            className="gold-text font-semibold text-sm"
          >
            Save
          </button>
        </div>

        {/* Slot list */}
        <div className="space-y-2 mb-4">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              ref={el => { slotRefs.current[index] = el; }}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`glass p-3 relative transition-all duration-150 ${
                dragIndex === index ? 'opacity-40 scale-[0.98]' : 'opacity-100'
              } ${
                dragOverIndex === index && dragIndex !== index
                  ? 'ring-2 ring-[#D4A853]/60 -translate-y-0.5'
                  : ''
              }`}
            >
              {/* Top row: grip + emoji + label + duplicate + delete */}
              <div className="flex items-center gap-2 mb-2">
                {/* Drag handle — touch events for mobile */}
                <div
                  className="text-stone-600 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-1"
                  onTouchStart={e => handleTouchStart(e, index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  aria-label={`Drag to reorder ${slot.label}`}
                  role="button"
                >
                  <GripVertical size={18} />
                </div>

                {/* Emoji picker */}
                <button
                  onClick={() => setEditingEmoji(editingEmoji === slot.id ? null : slot.id)}
                  className="text-2xl hover:scale-110 transition-transform flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.05]"
                >
                  {slot.emoji}
                </button>

                {/* Label input */}
                <input
                  type="text"
                  value={slot.label}
                  onChange={e => updateSlot(slot.id, { label: e.target.value })}
                  className="input-dark flex-1 text-sm py-2 min-w-0"
                  maxLength={20}
                  placeholder="Meal name"
                />

                {/* Duplicate */}
                <button
                  onClick={() => duplicateSlot(slot)}
                  disabled={slots.length >= 8}
                  className="text-stone-600 hover:text-[#D4A853] disabled:opacity-20 p-1.5 flex-shrink-0"
                  title="Duplicate slot"
                >
                  <Copy size={14} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => removeSlot(slot.id)}
                  disabled={slots.length <= 2}
                  className="text-stone-600 hover:text-red-400 disabled:opacity-20 p-1.5 flex-shrink-0"
                  title="Remove slot"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Type selector */}
              <div className="flex items-center gap-2 pl-8">
                <select
                  value={slot.mealType}
                  onChange={e => updateSlot(slot.id, { mealType: e.target.value as MealType })}
                  className="input-dark text-xs py-1.5 flex-1"
                >
                  {MEAL_TYPES.map(mt => (
                    <option key={mt.value} value={mt.value}>{mt.label}</option>
                  ))}
                </select>
              </div>

              {/* Emoji picker panel */}
              <AnimatePresence>
                {editingEmoji === slot.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 glass-elevated p-2 rounded-lg grid grid-cols-8 gap-1.5 overflow-hidden"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { updateSlot(slot.id, { emoji }); setEditingEmoji(null); }}
                        className="text-xl hover:scale-125 transition-transform p-1 rounded-lg hover:bg-white/[0.1] flex items-center justify-center"
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
            className="w-full glass p-3 text-stone-500 hover:text-stone-300 text-sm flex items-center justify-center gap-2 transition-colors mb-2"
          >
            <Plus size={14} />
            Add Meal Slot
          </button>
        )}

        <div className="h-4" />
      </motion.div>
    </motion.div>
  );
}
