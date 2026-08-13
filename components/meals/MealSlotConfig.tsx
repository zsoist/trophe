'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Plus, Trash2, GripVertical, Copy } from 'lucide-react';
import type { MealSlot } from '@/components/meals/MealSlotCard';
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
  const reducedMotion = useReducedMotion();

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
        aria-label="Customize meals"
        className="w-full max-w-md bg-[var(--surface-1)] rounded-t-2xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — iOS-style top bar */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="min-h-11 min-w-11 text-[var(--content-muted)] hover:text-[var(--content-secondary)] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            Cancel
          </button>
          <div>
            <h2 className="text-[var(--content-primary)] font-semibold text-sm">Customize Meals</h2>
            <p className="text-[var(--content-muted)] text-xs text-center">Drag to reorder</p>
          </div>
          <button
            onClick={() => { onSave(slots); onClose(); }}
            className="min-h-11 min-w-11 gold-text font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                <button
                  type="button"
                  className="min-h-11 min-w-11 text-[var(--content-muted)] flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  onTouchStart={e => handleTouchStart(e, index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    const target = index + (event.key === 'ArrowUp' ? -1 : 1);
                    if (target >= 0 && target < slots.length) reorder(index, target);
                  }}
                  aria-label={`Reorder ${slot.label}`}
                >
                  <GripVertical size={18} />
                </button>

                {/* Emoji picker */}
                <button
                  onClick={() => setEditingEmoji(editingEmoji === slot.id ? null : slot.id)}
                  aria-label={`Choose icon for ${slot.label}`}
                  className="text-2xl hover:scale-110 transition-transform flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-lg bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {slot.emoji}
                </button>

                {/* Label input */}
                <input
                  type="text"
                  value={slot.label}
                  onChange={e => updateSlot(slot.id, { label: e.target.value })}
                  className="input-dark flex-1 text-base sm:text-sm py-2 min-w-0"
                  maxLength={20}
                  placeholder="Meal name"
                />

                {/* Duplicate */}
                <button
                  onClick={() => duplicateSlot(slot)}
                  disabled={slots.length >= 8}
                  aria-label={`Duplicate ${slot.label}`}
                  className="text-[var(--content-muted)] hover:text-[#D4A853] disabled:opacity-20 min-w-11 min-h-11 p-1.5 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  title="Duplicate slot"
                >
                  <Copy size={14} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => removeSlot(slot.id)}
                  disabled={slots.length <= 2}
                  aria-label={`Remove ${slot.label}`}
                  className="text-[var(--content-muted)] hover:text-red-400 disabled:opacity-20 min-w-11 min-h-11 p-1.5 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                  className="input-dark text-base sm:text-sm py-1.5 flex-1"
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
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.15 }}
                    className="mt-2 glass-elevated p-2 rounded-lg grid grid-cols-8 gap-1.5 overflow-hidden"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { updateSlot(slot.id, { emoji }); setEditingEmoji(null); }}
                        aria-label={`Select ${emoji} for ${slot.label}`}
                        className="text-xl hover:scale-125 transition-transform min-w-11 min-h-11 p-1 rounded-lg hover:bg-[var(--surface-hover)] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
            className="min-h-11 w-full glass p-3 text-[var(--content-muted)] hover:text-[var(--content-secondary)] text-sm flex items-center justify-center gap-2 transition-colors mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
