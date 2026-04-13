'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, SkipForward, Undo2, Trash2, Pencil, Check, X, Lock, Unlock, Star, MessageSquare } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { FoodLogEntry, MealType } from '@/lib/types';
import { calculateMealScore, getScoreBgColor } from '@/lib/meal-score';
import QuickFoodInput from './QuickFoodInput';

export interface MealSlot {
  id: string;
  mealType: MealType;
  label: string;
  emoji: string;
  order: number;
}

interface FavoriteFood {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

interface MealSlotCardProps {
  slot: MealSlot;
  entries: FoodLogEntry[];
  userId: string;
  date: string;
  skipped: boolean;
  locked: boolean;
  favorites: FavoriteFood[];
  onLogged: () => void;
  onSkip: () => void;
  onUndoSkip: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onDeleteEntry: (id: string) => void;
  onToggleFavorite: (entry: FoodLogEntry) => void;
}

export default function MealSlotCard({
  slot,
  entries,
  userId,
  date,
  skipped,
  locked,
  favorites,
  onLogged,
  onSkip,
  onUndoSkip,
  onLock,
  onUnlock,
  onDeleteEntry,
  onToggleFavorite,
}: MealSlotCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [inputActive, setInputActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [saving, setSaving] = useState(false);

  // F24: Meal notes
  const noteKey = `trophe_notes_${date}_${slot.id}`;
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  // Load note from localStorage on expand
  const toggleExpand = () => {
    if (!expanded) {
      const stored = localStorage.getItem(noteKey);
      if (stored) setNote(stored);
    }
    setExpanded(!expanded);
  };

  const saveNote = (text: string) => {
    setNote(text);
    if (text.trim()) {
      localStorage.setItem(noteKey, text);
    } else {
      localStorage.removeItem(noteKey);
    }
  };

  const totalCalories = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein_g ?? 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.fat_g ?? 0), 0);
  const hasFoods = entries.length > 0;
  const isEmpty = !hasFoods && !skipped;

  // F10: Meal quality score
  const mealScore = calculateMealScore(entries);

  // Skipped state
  if (skipped && !hasFoods) {
    return (
      <motion.div
        layout
        className="glass p-3 opacity-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{slot.emoji}</span>
            <span className="text-stone-500 text-sm line-through">{slot.label}</span>
            <span className="text-stone-600 text-xs">— {t('food.skipped')}</span>
          </div>
          <button
            onClick={onUndoSkip}
            className="text-stone-600 hover:text-stone-300 text-xs flex items-center gap-1 transition-colors"
          >
            <Undo2 size={12} />
            {t('food.undo_skip')}
          </button>
        </div>
      </motion.div>
    );
  }

  // Empty state — tap to log
  if (isEmpty && !inputActive) {
    return (
      <motion.div
        layout
        whileTap={{ scale: 0.98 }}
        onClick={() => setInputActive(true)}
        className="glass p-4 cursor-pointer hover:border-[#D4A853]/30 transition-colors border border-transparent"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{slot.emoji}</span>
            <span className="text-stone-200 text-sm font-medium">{slot.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onSkip(); }}
              className="text-stone-600 hover:text-stone-400 text-xs flex items-center gap-1 transition-colors"
            >
              <SkipForward size={12} />
              {t('food.skip_meal')}
            </button>
          </div>
        </div>
        <p className="text-stone-600 text-xs mt-1 ml-8">{t('food.tap_to_log')}</p>
      </motion.div>
    );
  }

  // Active input state
  if (inputActive && !hasFoods) {
    return (
      <motion.div layout className="glass p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{slot.emoji}</span>
            <span className="text-stone-200 text-sm font-medium">{slot.label}</span>
          </div>
          <button
            onClick={() => setInputActive(false)}
            className="text-stone-600 hover:text-stone-300 text-xs transition-colors"
          >
            {t('general.cancel')}
          </button>
        </div>
        <QuickFoodInput
          userId={userId}
          mealType={slot.mealType}
          date={date}
          onLogged={() => {
            setInputActive(false);
            onLogged();
          }}
          onSearchMode={() => {}}
        />
      </motion.div>
    );
  }

  // Locked state — compact, no editing
  if (locked && hasFoods) {
    return (
      <motion.div layout className="glass p-3 border border-green-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg opacity-70">{slot.emoji}</span>
            <span className="text-stone-300 text-sm font-medium">{slot.label}</span>
            <Lock size={12} className="text-green-500/60" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="gold-text font-medium">{Math.round(totalCalories)}</span>
              <span className="text-red-400">P{Math.round(totalProtein)}</span>
              <span className="text-blue-400">C{Math.round(totalCarbs)}</span>
              <span className="text-purple-400">F{Math.round(totalFat)}</span>
            </div>
            <button
              onClick={onUnlock}
              className="text-stone-600 hover:text-stone-300 p-1 transition-colors"
              title={t('food.unlock')}
            >
              <Unlock size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Filled state — show logged items with macros
  return (
    <motion.div layout className="glass p-3">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{slot.emoji}</span>
          <span className="text-stone-200 text-sm font-medium">{slot.label}</span>
          <span className="text-stone-500 text-xs">({entries.length})</span>
          {/* F10: Meal quality score badge */}
          {mealScore && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${mealScore.color} ${getScoreBgColor(mealScore.score)}`}>
              {mealScore.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <span className="gold-text font-medium">{Math.round(totalCalories)}</span>
            <span className="text-red-400">P{Math.round(totalProtein)}</span>
            <span className="text-blue-400">C{Math.round(totalCarbs)}</span>
            <span className="text-purple-400">F{Math.round(totalFat)}</span>
          </div>
          {expanded ? <ChevronUp size={14} className="text-stone-500" /> : <ChevronDown size={14} className="text-stone-500" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1 overflow-hidden"
          >
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              const origQty = entry.quantity || 1;

              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.03]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-300 text-xs truncate">{entry.food_name}</p>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number"
                          value={editQty}
                          onChange={(e) => setEditQty(parseFloat(e.target.value) || 1)}
                          min={0.25}
                          step={0.25}
                          className="input-dark text-xs w-14 py-0.5 text-center"
                          autoFocus
                        />
                        <span className="text-stone-500 text-[10px]">{entry.unit}</span>
                        <button
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            const factor = editQty / origQty;
                            const { error } = await supabase
                              .from('food_log')
                              .update({
                                quantity: editQty,
                                calories: Math.round((entry.calories ?? 0) * factor),
                                protein_g: Math.round((entry.protein_g ?? 0) * factor * 10) / 10,
                                carbs_g: Math.round((entry.carbs_g ?? 0) * factor * 10) / 10,
                                fat_g: Math.round((entry.fat_g ?? 0) * factor * 10) / 10,
                              })
                              .eq('id', entry.id);
                            setSaving(false);
                            setEditingId(null);
                            if (!error) onLogged();
                          }}
                          className="p-1 text-green-500 hover:text-green-400"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-stone-600 hover:text-stone-300"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 text-[10px] text-stone-500 mt-0.5">
                        <span>{entry.quantity} {entry.unit}</span>
                        <span>{Math.round(entry.calories ?? 0)} kcal</span>
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => onToggleFavorite(entry)}
                        className={`p-1.5 transition-colors ${favorites.some(f => f.food_name === entry.food_name) ? 'text-[#D4A853]' : 'text-stone-600 hover:text-[#D4A853]'}`}
                        title={t('food.favorite_added')}
                      >
                        <Star size={11} fill={favorites.some(f => f.food_name === entry.food_name) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => { setEditingId(entry.id); setEditQty(origQty); }}
                        className="p-1.5 text-stone-600 hover:text-stone-300 transition-colors"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => onDeleteEntry(entry.id)}
                        className="p-1.5 text-stone-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* F24: Meal notes */}
            {showNote ? (
              <div className="pt-1">
                <textarea
                  value={note}
                  onChange={(e) => saveNote(e.target.value)}
                  placeholder="Add a note about this meal..."
                  className="input-dark w-full text-xs resize-none min-h-[36px] py-1.5"
                  rows={1}
                  autoFocus
                  onBlur={() => { if (!note.trim()) setShowNote(false); }}
                />
              </div>
            ) : note ? (
              <button
                onClick={() => setShowNote(true)}
                className="pt-1 text-stone-500 text-[10px] italic truncate block w-full text-left"
              >
                📝 {note}
              </button>
            ) : null}

            {/* Actions row */}
            <div className="pt-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!inputActive ? (
                  <button
                    onClick={() => setInputActive(true)}
                    className="text-stone-500 hover:gold-text text-xs transition-colors text-left py-1"
                  >
                    + Add more
                  </button>
                ) : (
                  <div className="pt-2 w-full">
                    <QuickFoodInput
                      userId={userId}
                      mealType={slot.mealType}
                      date={date}
                      onLogged={() => {
                        setInputActive(false);
                        onLogged();
                      }}
                      onSearchMode={() => {}}
                    />
                    <button
                      onClick={() => setInputActive(false)}
                      className="text-stone-600 hover:text-stone-300 text-xs transition-colors mt-1"
                    >
                      {t('general.cancel')}
                    </button>
                  </div>
                )}
              </div>
              {!inputActive && (
                <div className="flex items-center gap-1.5">
                  {/* F24: Note toggle */}
                  {!showNote && !note && (
                    <button
                      onClick={() => setShowNote(true)}
                      className="text-stone-600 hover:text-stone-400 p-1 transition-colors"
                      title="Add note"
                    >
                      <MessageSquare size={11} />
                    </button>
                  )}
                  {/* Lock */}
                  <button
                    onClick={onLock}
                    className="text-stone-600 hover:text-green-400 text-xs flex items-center gap-1 transition-colors py-1"
                  >
                    <Lock size={11} />
                    {t('food.lock_meal')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
