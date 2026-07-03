'use client';

import { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles, Pencil, Check, X, Minus, Plus, Loader2 } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { trpc } from '@/lib/trpc/client';
import type { FoodLogEntry } from '@/lib/types';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface MealPatternViewProps {
  entries: FoodLogEntry[];
  /**
   * Client the coach is viewing. When present, entries become editable via
   * food.log.coachEdit (server-side tenant check — coaches are RLS
   * SELECT-only on client logs, so writes must go through tRPC).
   */
  clientId?: string;
}

/** Phase 4 columns present on `select('*')` rows but not yet on FoodLogEntry. */
type EntryExtras = { qty_g?: number | string | null; parse_confidence?: number | null };
type LogEntry = FoodLogEntry & EntryExtras;

/** AI-sourced: modern rows carry parse_confidence; legacy AI rows only source. */
function isAiEntry(e: LogEntry): boolean {
  return (
    e.parse_confidence != null ||
    e.source === 'natural_language' ||
    e.source === 'photo_ai'
  );
}

interface EditForm {
  name: string;
  grams: number | null;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string;
}

const EMPTY_FORM: EditForm = {
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

interface MealPattern {
  mealType: string;
  icon: IconName;
  label: string;
  totalEntries: number;
  topFoods: { name: string; count: number; avgCalories: number }[];
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  uniqueDays: number;
}

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const MEAL_META: Record<string, { icon: IconName; label: string; order: number }> = {
  breakfast: { icon: 'i-sun', label: 'Breakfast', order: 0 },
  lunch: { icon: 'i-bowl', label: 'Lunch', order: 1 },
  dinner: { icon: 'i-moon', label: 'Dinner', order: 2 },
  snack: { icon: 'i-apple', label: 'Snacks', order: 3 },
  pre_workout: { icon: 'i-dumbbell', label: 'Pre-Workout', order: 4 },
  post_workout: { icon: 'i-zap', label: 'Post-Workout', order: 5 },
};

const MAX_CAL_BAR = 800; // max calories for bar scale

// ═══════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════

function MealPatternView({ entries, clientId }: MealPatternViewProps) {
  const { t } = useI18n();
  const [view, setView] = useState<'pattern' | 'daily'>('pattern');
  const reduceMotion = useReducedMotion();

  // ── Coach edit state (one editor open at a time) ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [dirty, setDirty] = useState<Set<keyof EditForm>>(new Set());
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Local optimistic overrides — the parent fetches entries once; after a
  // successful coachEdit we merge the server-returned row over the prop.
  const [overrides, setOverrides] = useState<Record<string, Partial<LogEntry>>>({});

  const coachEditMutation = trpc.food.log.coachEdit.useMutation();

  const merged: LogEntry[] = useMemo(
    () =>
      entries.map((e) => {
        const o = overrides[e.id];
        return (o ? { ...e, ...o } : e) as LogEntry;
      }),
    [entries, overrides],
  );

  const setField = (key: keyof EditForm, value: string | number | null) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty((d) => (d.has(key) ? d : new Set(d).add(key)));
  };

  const openEditor = (entry: LogEntry) => {
    setEditingId(entry.id);
    setDirty(new Set());
    setForm({
      name: entry.food_name,
      grams: entry.qty_g != null && Number(entry.qty_g) > 0 ? Math.round(Number(entry.qty_g)) : null,
      calories: entry.calories != null ? String(Math.round(entry.calories)) : '',
      protein: entry.protein_g != null ? String(Math.round(entry.protein_g * 10) / 10) : '',
      carbs: entry.carbs_g != null ? String(Math.round(entry.carbs_g * 10) / 10) : '',
      fat: entry.fat_g != null ? String(Math.round(entry.fat_g * 10) / 10) : '',
      sugar: entry.sugar_g != null ? String(Math.round(entry.sugar_g * 10) / 10) : '',
    });
  };

  const closeEditor = () => {
    setEditingId(null);
    setDirty(new Set());
  };

  const saveEdit = async (entry: LogEntry) => {
    if (saving || !clientId) return;
    const payload: {
      clientId: string; entryId: string; foodName?: string; grams?: number;
      calories?: number; proteinG?: number; carbsG?: number; fatG?: number; sugarG?: number;
    } = { clientId, entryId: entry.id };

    if (dirty.has('name')) {
      const name = form.name.trim();
      if (name && name !== entry.food_name) payload.foodName = name;
    }
    if (dirty.has('grams') && form.grams != null && form.grams > 0) payload.grams = form.grams;
    const numField = (raw: string): number | undefined => {
      const v = parseFloat(raw);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    if (dirty.has('calories')) payload.calories = numField(form.calories);
    if (dirty.has('protein')) payload.proteinG = numField(form.protein);
    if (dirty.has('carbs')) payload.carbsG = numField(form.carbs);
    if (dirty.has('fat')) payload.fatG = numField(form.fat);
    if (dirty.has('sugar')) payload.sugarG = numField(form.sugar);

    if (Object.keys(payload).length <= 2) {
      closeEditor();
      return;
    }
    setSaving(true);
    try {
      const updated = await coachEditMutation.mutateAsync(payload);
      setOverrides((prev) => ({
        ...prev,
        [entry.id]: {
          food_name: updated.foodName,
          quantity: updated.quantity,
          qty_g: updated.qtyG,
          calories: updated.calories,
          protein_g: updated.proteinG,
          carbs_g: updated.carbsG,
          fat_g: updated.fatG,
          sugar_g: updated.sugarG,
        },
      }));
      closeEditor();
      setFlashId(entry.id);
      window.setTimeout(() => setFlashId((cur) => (cur === entry.id ? null : cur)), 900);
    } catch {
      // Keep the editor open so the coach can retry.
    } finally {
      setSaving(false);
    }
  };

  const patterns = useMemo(() => {
    const grouped: Record<string, FoodLogEntry[]> = {};

    merged.forEach((entry) => {
      const key = entry.meal_type || 'snack';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    });

    const result: MealPattern[] = Object.entries(grouped).map(([mealType, items]) => {
      // Count food frequencies + sum calories per food name
      const foodStats: Record<string, { count: number; calTotal: number }> = {};
      items.forEach((item) => {
        const name = item.food_name.toLowerCase().trim();
        if (!foodStats[name]) foodStats[name] = { count: 0, calTotal: 0 };
        foodStats[name].count += 1;
        foodStats[name].calTotal += item.calories || 0;
      });
      const topFoods = Object.entries(foodStats)
        .map(([name, s]) => ({
          name,
          count: s.count,
          avgCalories: Math.round(s.calTotal / s.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Calculate average per meal occasion (group by date)
      const byDate: Record<string, { cal: number; p: number; c: number; f: number }> = {};
      items.forEach((item) => {
        if (!byDate[item.logged_date]) byDate[item.logged_date] = { cal: 0, p: 0, c: 0, f: 0 };
        byDate[item.logged_date].cal += item.calories || 0;
        byDate[item.logged_date].p += item.protein_g || 0;
        byDate[item.logged_date].c += item.carbs_g || 0;
        byDate[item.logged_date].f += item.fat_g || 0;
      });

      const dayCount = Object.keys(byDate).length || 1;
      const totals = Object.values(byDate).reduce(
        (acc, d) => ({
          cal: acc.cal + d.cal,
          p: acc.p + d.p,
          c: acc.c + d.c,
          f: acc.f + d.f,
        }),
        { cal: 0, p: 0, c: 0, f: 0 }
      );

      const meta = MEAL_META[mealType] || { icon: 'i-bowl' as IconName, label: mealType, order: 99 };

      return {
        mealType,
        icon: meta.icon,
        label: meta.label,
        totalEntries: items.length,
        topFoods,
        avgCalories: Math.round(totals.cal / dayCount),
        avgProtein: Math.round(totals.p / dayCount),
        avgCarbs: Math.round(totals.c / dayCount),
        avgFat: Math.round(totals.f / dayCount),
        uniqueDays: dayCount,
      };
    });

    // Sort by meal order
    result.sort((a, b) => {
      const orderA = MEAL_META[a.mealType]?.order ?? 99;
      const orderB = MEAL_META[b.mealType]?.order ?? 99;
      return orderA - orderB;
    });

    return result;
  }, [merged]);

  // Daily view: group by date (existing behavior)
  const foodByDate = useMemo(() => {
    const byDate: Record<string, LogEntry[]> = {};
    merged.forEach((entry) => {
      const key = entry.logged_date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(entry);
    });
    return byDate;
  }, [merged]);

  const maxAvgCal = useMemo(
    () => Math.max(...patterns.map((p) => p.avgCalories), MAX_CAL_BAR),
    [patterns]
  );

  if (entries.length === 0) {
    return <p className="text-stone-600 text-sm text-center py-4">No food logged recently</p>;
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] mb-4 w-fit">
        <button
          onClick={() => setView('pattern')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === 'pattern'
              ? 'bg-[#D4A853]/15 text-[#D4A853]'
              : 'text-stone-500 hover:text-stone-300'
          }`}
        >
          Pattern View
        </button>
        <button
          onClick={() => setView('daily')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === 'daily'
              ? 'bg-[#D4A853]/15 text-[#D4A853]'
              : 'text-stone-500 hover:text-stone-300'
          }`}
        >
          Daily View
        </button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'pattern' ? (
          <motion.div
            key="pattern"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {patterns.map((pattern) => {
              const maxFoodCount = Math.max(...pattern.topFoods.map((f) => f.count), 1);
              return (
                <div
                  key={pattern.mealType}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  {/* Minimal meal header — icon + label + day count, everything else demoted */}
                  <div className="flex items-center gap-2 mb-3">
                    <Icon name={pattern.icon} size={15} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
                    <h4 className="text-sm font-semibold text-stone-200">{pattern.label}</h4>
                    <span className="text-[10px] text-stone-500">
                      · {pattern.uniqueDays} day{pattern.uniqueDays !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* FOODS — the hero of the card */}
                  <div className="space-y-2">
                    {pattern.topFoods.map((food) => {
                      const freqPct = (food.count / maxFoodCount) * 100;
                      return (
                        <div key={food.name} className="space-y-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm text-stone-100 capitalize truncate">
                              {food.name}
                            </span>
                            <span className="text-[10px] text-stone-500 whitespace-nowrap tabular-nums">
                              {food.count}×{food.avgCalories > 0 ? ` · ~${food.avgCalories} kcal` : ''}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-[#D4A853]/60"
                              initial={{ width: 0 }}
                              animate={{ width: `${freqPct}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Demoted footer — totals in small print */}
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-stone-500">
                    <span>
                      ~{pattern.avgCalories} kcal/day · P{pattern.avgProtein} C{pattern.avgCarbs} F{pattern.avgFat}
                    </span>
                    <div className="h-1 w-16 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full bg-[#D4A853]/30 rounded-full"
                        style={{ width: `${Math.min((pattern.avgCalories / maxAvgCal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {Object.entries(foodByDate)
              .slice(0, 3)
              .map(([date, dayEntries]) => {
                const totals = dayEntries.reduce(
                  (acc, e) => ({
                    cal: acc.cal + (e.calories || 0),
                    p: acc.p + (e.protein_g || 0),
                    c: acc.c + (e.carbs_g || 0),
                    f: acc.f + (e.fat_g || 0),
                  }),
                  { cal: 0, p: 0, c: 0, f: 0 }
                );
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-stone-400">
                        {new Date(date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-stone-500">
                        {Math.round(totals.cal)} kcal | P:{Math.round(totals.p)}g C:
                        {Math.round(totals.c)}g F:{Math.round(totals.f)}g
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayEntries.map((entry) => {
                        const aiLogged = isAiEntry(entry);
                        const isEditing = editingId === entry.id;
                        return (
                          <div key={entry.id} className="relative rounded-lg bg-white/[0.03]">
                            {/* One-shot gold flash after a saved edit */}
                            {flashId === entry.id && (
                              <motion.div
                                initial={{ opacity: reduceMotion ? 0 : 0.35 }}
                                animate={{ opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 rounded-lg bg-[#D4A853] pointer-events-none"
                                aria-hidden
                              />
                            )}
                            <div className="flex items-center justify-between text-xs py-1 px-2">
                              <span className="text-stone-300 truncate flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{entry.food_name}</span>
                                {aiLogged && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-[#D4A853]/10 text-[#D4A853] text-[9px] uppercase tracking-wider flex-shrink-0"
                                    style={{ fontFamily: 'var(--font-mono)' }}
                                    title={t('coach.mealPattern.aiLoggedTitle')}
                                  >
                                    <Sparkles size={8} aria-hidden />
                                    {t('coach.mealPattern.aiLogged')}
                                  </span>
                                )}
                              </span>
                              <span className="text-stone-500 whitespace-nowrap ml-2 flex items-center gap-1">
                                {Math.round(entry.calories || 0)} kcal
                                {clientId && (
                                  <button
                                    onClick={() => (isEditing ? closeEditor() : openEditor(entry))}
                                    className="p-1.5 text-stone-600 hover:text-[#D4A853] transition-colors"
                                    aria-label={t('coach.mealPattern.editEntry', { name: entry.food_name })}
                                  >
                                    <Pencil size={11} />
                                  </button>
                                )}
                              </span>
                            </div>

                            {/* Compact coach editor (same pattern as client card) */}
                            <AnimatePresence>
                              {isEditing && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="m-1.5 mt-0 rounded-lg bg-white/[0.04] border border-white/5 p-2.5 space-y-2.5">
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

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        disabled={saving}
                                        onClick={() => void saveEdit(entry)}
                                        className="flex-1 py-2 rounded-lg bg-[#D4A853] text-stone-950 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
                                      >
                                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                        {t('food.edit.save')}
                                      </button>
                                      <button
                                        onClick={closeEditor}
                                        className="p-2 rounded-lg text-stone-500 hover:text-stone-300 border border-white/10 transition-colors"
                                        aria-label={t('coach.mealPattern.cancel')}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(MealPatternView);
