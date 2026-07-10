'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp, SkipForward, Undo2, Trash2, Pencil, Check, X, Lock, Unlock, Star, MessageSquare, Minus, Plus, Loader2 } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc/client';
import type { FoodLogEntry, MealType } from '@/lib/types';
import { calculateMealScore, getScoreBgColor } from '@/lib/food/meal-score';
import { MACRO_COLORS } from '@/lib/macro-colors';
import QuickFoodInput from '@/components/food/QuickFoodInput';

/** Phase 4 columns present on `select('*')` rows but not yet on FoodLogEntry. */
type EntryExtras = { qty_g?: number | string | null; parse_confidence?: number | null };

interface DetailsForm {
  name: string;
  grams: number | null;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string;
}

const EMPTY_FORM: DetailsForm = {
  name: '', grams: null, calories: '', protein: '', carbs: '', fat: '', sugar: '',
};

/** Mono 10px field label — type system (BodyCompCalculator / MealBadges pattern). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-[10px] uppercase tracking-wider text-stone-500 mb-0.5"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </span>
  );
}

export interface MealSlot {
  id: string;
  mealType: MealType;
  label: string;
  /** @deprecated use icon instead — Brand Master v1.0 */
  emoji?: string;
  icon?: IconName;
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
  /** W10: THE one next-expected empty slot — breathing gold ring + invitation caption. */
  isNext?: boolean;
  /** W10: protein-first caption for the next slot (page computes it; kcal-gated there). */
  nextHint?: string | null;
  /** Coach's showCalories gate — threaded to QuickFoodInput so the parse-review
   *  list shows kcal for coach-enabled clients (default false = hidden). */
  showCalories?: boolean;
  /** ids ride along after a batch AI log (QuickFoodInput) so the page can offer batch undo. */
  onLogged: (ids?: string[]) => void;
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
  isNext = false,
  nextHint = null,
  showCalories = false,
  onLogged,
  onSkip,
  onUndoSkip,
  onLock,
  onUnlock,
  onDeleteEntry,
  onToggleFavorite,
}: MealSlotCardProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [inputActive, setInputActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [saving, setSaving] = useState(false);

  // Full edit form ("Edit details" expander) — one editor open at a time.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [form, setForm] = useState<DetailsForm>(EMPTY_FORM);
  const [dirty, setDirty] = useState<Set<keyof DetailsForm>>(new Set());
  const [flashId, setFlashId] = useState<string | null>(null);

  // W10: the breathing ring is THE one ambient loop on the page — pause it
  // when the tab is hidden so it never burns cycles in a background tab.
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    if (!isNext) return;
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isNext]);

  const editMutation = trpc.food.log.edit.useMutation();

  const markDirty = (key: keyof DetailsForm) =>
    setDirty((d) => (d.has(key) ? d : new Set(d).add(key)));

  const setField = (key: keyof DetailsForm, value: string | number | null) => {
    setForm((f) => ({ ...f, [key]: value }));
    markDirty(key);
  };

  const triggerFlash = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  const openEditor = (entry: FoodLogEntry) => {
    const ext = entry as FoodLogEntry & EntryExtras;
    setEditingId(entry.id);
    setEditQty(entry.quantity || 1);
    setDetailsOpen(false);
    setDirty(new Set());
    setForm({
      name: entry.food_name,
      grams: ext.qty_g != null && Number(ext.qty_g) > 0 ? Math.round(Number(ext.qty_g)) : null,
      calories: entry.calories != null ? String(Math.round(entry.calories)) : '',
      protein: entry.protein_g != null ? String(Math.round(entry.protein_g * 10) / 10) : '',
      carbs: entry.carbs_g != null ? String(Math.round(entry.carbs_g * 10) / 10) : '',
      fat: entry.fat_g != null ? String(Math.round(entry.fat_g * 10) / 10) : '',
      sugar: entry.sugar_g != null ? String(Math.round(entry.sugar_g * 10) / 10) : '',
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    setDetailsOpen(false);
    setDirty(new Set());
  };

  // Quick path (default view): quantity-only edit — server rescales macros
  // by the quantity factor and captures a correction row when AI-sourced.
  const saveQuick = async (entry: FoodLogEntry) => {
    if (saving) return;
    setSaving(true);
    try {
      await editMutation.mutateAsync({ entryId: entry.id, quantity: editQty });
      closeEditor();
      triggerFlash(entry.id);
      onLogged();
    } catch {
      // Keep the editor open so the user can retry.
    } finally {
      setSaving(false);
    }
  };

  // Full form: send ONLY dirty fields so the server can derive the rest
  // (e.g. grams-only edit rescales macros; explicit macros win per-field).
  const saveDetails = async (entry: FoodLogEntry) => {
    if (saving) return;
    const payload: {
      entryId: string; foodName?: string; grams?: number; calories?: number;
      proteinG?: number; carbsG?: number; fatG?: number; sugarG?: number;
    } = { entryId: entry.id };

    if (dirty.has('name')) {
      const name = form.name.trim();
      if (name && name !== entry.food_name) payload.foodName = name;
    }
    if (dirty.has('grams') && form.grams != null && form.grams > 0) {
      payload.grams = form.grams;
    }
    const numField = (raw: string): number | undefined => {
      const v = parseFloat(raw);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    if (dirty.has('calories')) payload.calories = numField(form.calories);
    if (dirty.has('protein')) payload.proteinG = numField(form.protein);
    if (dirty.has('carbs')) payload.carbsG = numField(form.carbs);
    if (dirty.has('fat')) payload.fatG = numField(form.fat);
    if (dirty.has('sugar')) payload.sugarG = numField(form.sugar);

    const hasChanges = Object.keys(payload).length > 1;
    if (!hasChanges) {
      closeEditor();
      return;
    }
    setSaving(true);
    try {
      await editMutation.mutateAsync(payload);
      closeEditor();
      triggerFlash(entry.id);
      onLogged();
    } catch {
      // Keep the editor open so the user can retry.
    } finally {
      setSaving(false);
    }
  };

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
            {slot.icon ? <Icon name={slot.icon} size={20} /> : <span className="text-lg">{slot.emoji}</span>}
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

  // Empty state — tap to log. The ONE next-expected slot (W10) breathes a
  // gold invitation ring and floats its icon; every other empty slot is calm.
  if (isEmpty && !inputActive) {
    const invite = isNext && !locked;
    const ambient = invite && !reduceMotion && pageVisible;
    const slotGlyph = slot.icon ? <Icon name={slot.icon} size={20} /> : <span className="text-lg">{slot.emoji}</span>;
    return (
      <motion.div
        layout
        whileTap={{ scale: 0.98 }}
        onClick={() => setInputActive(true)}
        className={`relative glass p-4 cursor-pointer transition-colors border ${
          invite ? 'border-[#D4A853]/20' : 'border-transparent hover:border-[#D4A853]/30'
        }`}
      >
        {/* W10: breathing gold ring — stacked child ring (never the glass layer),
            opacity 0.14→0.30 over 3s; freezes when the tab is hidden */}
        {invite && !reduceMotion && (
          <motion.span
            aria-hidden
            style={{
              position: 'absolute', inset: -1, borderRadius: 16, pointerEvents: 'none',
              border: '1px solid var(--gold-300, #D4A853)',
              boxShadow: '0 0 18px rgba(212,168,83,.22)',
            }}
            animate={ambient ? { opacity: [0.14, 0.3, 0.14] } : { opacity: 0.14 }}
            transition={ambient ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          />
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {invite && !reduceMotion ? (
              <motion.span
                className="inline-flex"
                animate={ambient ? { y: [0, -3, 0] } : { y: 0 }}
                transition={ambient ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              >
                {slotGlyph}
              </motion.span>
            ) : (
              slotGlyph
            )}
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
        {/* W10: protein-first invitation replaces the generic caption on the next slot */}
        <p className={`text-xs mt-1 ml-8 ${invite && nextHint ? 'text-[#D4A853]/80' : 'text-stone-600'}`}>
          {invite && nextHint ? nextHint : t('food.tap_to_log')}
        </p>
      </motion.div>
    );
  }

  // Active input state
  if (inputActive && !hasFoods) {
    return (
      <motion.div layout className="glass p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {slot.icon ? <Icon name={slot.icon} size={20} /> : <span className="text-lg">{slot.emoji}</span>}
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
          showCalories={showCalories}
          onLogged={(ids) => {
            setInputActive(false);
            onLogged(ids);
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
            {slot.icon ? <Icon name={slot.icon} size={20} className="opacity-70" /> : <span className="text-lg opacity-70">{slot.emoji}</span>}
            <span className="text-stone-300 text-sm font-medium">{slot.label}</span>
            <Lock size={12} className="text-green-500/60" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="gold-text font-medium">{Math.round(totalCalories)}</span>
              <span style={{ color: MACRO_COLORS.protein }}>P{Math.round(totalProtein)}</span>
              <span style={{ color: MACRO_COLORS.carbs }}>C{Math.round(totalCarbs)}</span>
              <span style={{ color: MACRO_COLORS.fat }}>F{Math.round(totalFat)}</span>
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
          {/* Audit fix: default slots have icon (no emoji) — the old bare
              {slot.emoji} vanished as soon as food was logged */}
          {slot.icon ? <Icon name={slot.icon} size={20} /> : <span className="text-lg">{slot.emoji}</span>}
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
            <span style={{ color: MACRO_COLORS.protein }}>P{Math.round(totalProtein)}</span>
            <span style={{ color: MACRO_COLORS.carbs }}>C{Math.round(totalCarbs)}</span>
            <span style={{ color: MACRO_COLORS.fat }}>F{Math.round(totalFat)}</span>
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
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="mt-2 space-y-1 overflow-hidden"
          >
            {entries.map((entry, entryIndex) => {
              const isEditing = editingId === entry.id;

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{
                    type: 'spring', stiffness: 420, damping: 32,
                    delay: Math.min(entryIndex * 0.04, 0.25),
                  }}
                  onClick={() => { if (!isEditing) openEditor(entry); }}
                  className={`relative flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.03] ${isEditing ? '' : 'cursor-pointer'}`}
                >
                  {/* One-shot gold flash after a saved edit */}
                  {flashId === entry.id && (
                    <motion.div
                      initial={{ opacity: reduceMotion ? 0 : 0.35 }}
                      animate={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded bg-[#D4A853] pointer-events-none"
                      aria-hidden
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-300 text-xs truncate">{entry.food_name}</p>
                    {isEditing ? (
                      <div className="mt-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                        {/* Quick quantity path (default) */}
                        <div className="flex items-center gap-1.5">
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
                            onClick={() => void saveQuick(entry)}
                            className="p-1 text-green-500 hover:text-green-400 disabled:opacity-50"
                            aria-label={t('food.edit.saveQuantity')}
                          >
                            {saving && !detailsOpen ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button
                            onClick={closeEditor}
                            className="p-1 text-stone-600 hover:text-stone-300"
                            aria-label={t('general.cancel')}
                          >
                            <X size={12} />
                          </button>
                          <button
                            onClick={() => setDetailsOpen((o) => !o)}
                            className="ml-auto flex items-center gap-1 text-[10px] text-stone-500 hover:text-[#D4A853] transition-colors py-1"
                            aria-expanded={detailsOpen}
                          >
                            {t('food.edit.details')}
                            {detailsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        </div>

                        {/* Bottom-sheet-lite: full editor inside the card */}
                        <AnimatePresence>
                          {detailsOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="rounded-lg bg-white/[0.04] border border-white/5 p-2.5 space-y-2.5">
                                <div>
                                  <FieldLabel>{t('food.edit.name')}</FieldLabel>
                                  <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setField('name', e.target.value)}
                                    maxLength={200}
                                    className="input-dark w-full text-xs py-1.5"
                                  />
                                </div>

                                {form.grams != null && (
                                  <div>
                                    <FieldLabel>{t('food.edit.grams')}</FieldLabel>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => setField('grams', Math.max(1, (form.grams ?? 10) - 10))}
                                        className="w-11 h-11 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-stone-300 hover:border-[#D4A853]/40 active:scale-95 transition-all"
                                        aria-label={t('food.edit.decreaseGrams')}
                                      >
                                        <Minus size={14} />
                                      </button>
                                      <div className="flex-1 text-center">
                                        <span className="text-stone-100 text-sm font-medium tabular-nums">{form.grams}</span>
                                        <span className="text-stone-500 text-[10px] ml-1">g</span>
                                      </div>
                                      <button
                                        onClick={() => setField('grams', Math.min(10000, (form.grams ?? 0) + 10))}
                                        className="w-11 h-11 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-stone-300 hover:border-[#D4A853]/40 active:scale-95 transition-all"
                                        aria-label={t('food.edit.increaseGrams')}
                                      >
                                        <Plus size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-3 gap-1.5">
                                  {([
                                    ['calories', 'food.edit.kcal'],
                                    ['protein', 'food.edit.protein'],
                                    ['carbs', 'food.edit.carbs'],
                                    ['fat', 'food.edit.fat'],
                                    ['sugar', 'food.edit.sugar'],
                                  ] as const).map(([key, labelKey]) => (
                                    <div key={key}>
                                      <FieldLabel>{t(labelKey)}</FieldLabel>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        value={form[key]}
                                        onChange={(e) => setField(key, e.target.value)}
                                        className="input-dark w-full text-xs py-1.5 text-center"
                                      />
                                    </div>
                                  ))}
                                </div>

                                <button
                                  disabled={saving}
                                  onClick={() => void saveDetails(entry)}
                                  className="w-full py-2 rounded-lg bg-[#D4A853] text-stone-950 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
                                >
                                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  {t('food.edit.save')}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
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
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry); }}
                        className={`p-1.5 transition-colors ${favorites.some(f => f.food_name === entry.food_name) ? 'text-[#D4A853]' : 'text-stone-600 hover:text-[#D4A853]'}`}
                        aria-label={`${favorites.some(f => f.food_name === entry.food_name) ? 'Remove from' : 'Add to'} favorites: ${entry.food_name}`}
                      >
                        <Star size={11} fill={favorites.some(f => f.food_name === entry.food_name) ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditor(entry); }}
                        className="p-1.5 text-stone-600 hover:text-stone-300 transition-colors"
                        aria-label={`Edit ${entry.food_name}`}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteEntry(entry.id); }}
                        className="p-1.5 text-stone-600 hover:text-red-400 transition-colors"
                        aria-label={`Delete ${entry.food_name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </motion.div>
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
                {note}
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
                      showCalories={showCalories}
                      onLogged={(ids) => {
                        setInputActive(false);
                        onLogged(ids);
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
