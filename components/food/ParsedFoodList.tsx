'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Check, Minus, Plus, AlertTriangle, CornerDownLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { MACRO_COLORS } from '@/lib/macro-colors';
import { AnimatedValue } from '@/components/ui/AnimatedValue';
import { ProvenanceRing, resolveTier, type ProvenanceTier } from '@/components/food/ProvenanceRing';
import type { ParsedFoodItem } from '@/app/api/food/parse/route';

interface ParsedFoodListProps {
  items: ParsedFoodItem[];
  clarificationQuestion?: string | null;
  /** Server-side safety warnings (portion estimates, absurd quantities). */
  warnings?: string[];
  /** The original user input that produced these items — used to build the clarification re-parse text. */
  rawInputText?: string;
  /** Re-runs the parse with `${rawInputText} — ${answer}`. Absent (photo path) = question is informational only. */
  onReparse?: (text: string) => void;
  onConfirm: (items: ParsedFoodItem[]) => void;
  onCancel: () => void;
  logging: boolean;
  /** Coach clients may be ED-adjacent — new kcal strings render only when the parent enables them. */
  showCalories?: boolean;
}

/** Volume units where we display ml/L/cl instead of grams */
const VOLUME_UNITS = new Set(['ml', 'l', 'cl', 'fl_oz', 'fl oz']);

function isVolumeUnit(unit: string): boolean {
  return VOLUME_UNITS.has(unit.toLowerCase());
}

/** Get the display quantity for volume items (derived from gram ratio) */
function getDisplayQuantity(item: ParsedFoodItem): number {
  if (!isVolumeUnit(item.unit)) return item.grams;
  // Preserve the original quantity-to-grams ratio
  // e.g. 450ml coke → grams=450 (density ~1), display=450ml
  const gramsPerInputUnit = item.quantity > 0 ? item.grams / item.quantity : 1;
  return Math.round(item.grams / gramsPerInputUnit);
}

function recalcMacros(item: ParsedFoodItem, newGrams: number): ParsedFoodItem {
  const ratio = item.grams > 0 ? newGrams / item.grams : 1;
  return {
    ...item,
    grams: newGrams,
    // Update quantity to match new grams (keeps ratio consistent)
    quantity: item.quantity > 0
      ? Math.round((item.quantity * ratio) * 10) / 10
      : item.quantity,
    calories: Math.round(item.calories * ratio),
    protein_g: Math.round(item.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(item.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(item.fat_g * ratio * 10) / 10,
    fiber_g: Math.round(item.fiber_g * ratio * 10) / 10,
    sugar_g: Math.round((item.sugar_g ?? 0) * ratio * 10) / 10,
    portion_explicit: true,
    confidence: Math.max(item.confidence, 0.8),
  };
}

// ── W4 "provenance passport" helpers ──
// data_quality / calories_range are already TYPED + POPULATED by the parse
// pipeline but were never rendered. These map the tier to (a) a plain-language
// tap-to-explain caption and (b) an optional mono micro-chip. English copy is
// inline (lib/i18n.tsx is owned by a follow-up pass — keys logged to
// docs/superpowers/i18n-todo-w4.md). Calm styling only — no red, no shake.

/** i18n key for the one-line plain-language caption shown when the ring is tapped. */
const TIER_CAPTION_KEY: Record<ProvenanceTier, string> = {
  lab_verified: 'food.prov_caption_lab',
  label:        'food.prov_caption_label',
  crowdsourced: 'food.prov_caption_crowdsourced',
  estimated:    'food.prov_caption_estimated',
};

interface QualityChip {
  /** i18n key for the chip label — resolved with t() at the render site. */
  labelKey: string;
  /** Inline style so we can use the gold token / calm amber without new classes. */
  color: string;
}

/**
 * Resolve the data_quality micro-chip (or null for "no chip").
 * Rules (mission):
 *  - lab_verified → LAB (gold)
 *  - label → LABEL (stone)
 *  - crowdsourced → COMMUNITY (stone), BUT if db_source==='off' the existing
 *    "community data" hint already covers it — return null to avoid double-labeling.
 *  - estimated (data_quality) OR source==='ai_estimate'/'llm_cot' → AI ESTIMATE (amber)
 *  - null / unknown → null (no chip)
 */
function getQualityChip(item: ParsedFoodItem): QualityChip | null {
  const dq = item.data_quality;
  const isAiEstimate = dq === 'estimated' || item.source === 'ai_estimate' || item.source === 'llm_cot';

  if (isAiEstimate) return { labelKey: 'food.prov_chip_ai_estimate', color: '#fbbf24' /* amber-400 */ };
  if (dq === 'lab_verified') return { labelKey: 'food.prov_chip_lab', color: 'var(--gold-300, #D4A853)' };
  if (dq === 'label') return { labelKey: 'food.prov_chip_label', color: '#a8a29e' /* stone-400 */ };
  if (dq === 'crowdsourced') {
    // OFF products already show the "community data" hint — don't double-label.
    if (item.db_source === 'off') return null;
    return { labelKey: 'food.prov_chip_community', color: '#a8a29e' /* stone-400 */ };
  }
  return null;
}

/**
 * W4 calories_range settle — a one-shot per item mount.
 * Shows the "≈min–max kcal" range text, then after ~450ms collapses to the
 * center kcal figure which rolls in via AnimatedValue. Under reduced motion the
 * center figure is shown immediately (no range flash, no timer). Only rendered
 * for implicit-portion items when showCalories is on (gated by the caller).
 */
function CaloriesRangeSettle({ range, rangeLabel }: { range: NonNullable<ParsedFoodItem['calories_range']>; rangeLabel: string }) {
  const reduceMotion = useReducedMotion();
  // Reduced motion: start settled (no range flash, no timer). Otherwise start on
  // the range text and flip to the center figure after ~450ms.
  const [settled, setSettled] = useState(!!reduceMotion);
  const center = Math.round(range.center);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setSettled(true), 450);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <p className="text-stone-500 text-[10px] mt-1">
      {settled ? (
        <span>
          ≈<AnimatedValue value={center} duration={reduceMotion ? 0 : 450} grouped={false} startAt={Math.round(range.min)} /> kcal
        </span>
      ) : (
        rangeLabel
      )}
    </p>
  );
}

// Check if a meal has imbalanced macros — returns an i18n key (rendered via t()) or null.
function getMacroWarning(items: ParsedFoodItem[]): string | null {
  const totalCal = items.reduce((s, i) => s + i.calories, 0);
  if (totalCal === 0) return null;

  const proteinCal = items.reduce((s, i) => s + i.protein_g * 4, 0);
  const carbsCal = items.reduce((s, i) => s + i.carbs_g * 4, 0);
  const proteinPct = (proteinCal / totalCal) * 100;
  const carbsPct = (carbsCal / totalCal) * 100;

  if (proteinPct < 10) return 'food.warn_low_protein';
  if (carbsPct > 75) return 'food.warn_carb_heavy';
  return null;
}

export default function ParsedFoodList({
  items: initialItems,
  clarificationQuestion,
  warnings,
  rawInputText,
  onReparse,
  onConfirm,
  onCancel,
  logging,
  showCalories = false,
}: ParsedFoodListProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<ParsedFoodItem[]>(initialItems);
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  // W4: which row's provenance caption is open (tap-the-ring to explain).
  // One row open at a time — tapping another ring moves the caption.
  const [explainIndex, setExplainIndex] = useState<number | null>(null);

  // W5: stepper physics — refs mirror state so press-and-hold ticks never read
  // stale closures; only the last stepper-touched row's grams figure rolls.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [touchedIndex, setTouchedIndex] = useState<number | null>(null);
  const [typingIndex, setTypingIndex] = useState<number | null>(null);
  const touchedRef = useRef<number | null>(null);
  /** Display value at the moment a row is first stepper-touched — seeds the roll. */
  const [touchSeed, setTouchSeed] = useState(0);
  const holdDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Set on pointerdown so the trailing click doesn't double-fire; keyboard clicks pass through. */
  const pointerFiredRef = useRef(false);

  const endHold = useCallback(() => {
    if (holdDelayRef.current) { clearTimeout(holdDelayRef.current); holdDelayRef.current = null; }
    if (holdRepeatRef.current) { clearInterval(holdRepeatRef.current); holdRepeatRef.current = null; }
  }, []);

  useEffect(() => endHold, [endHold]);

  /** One stepper tick: haptic per tap, triple-pulse when crossing a 100g boundary. */
  const stepGrams = useCallback((index: number, delta: number) => {
    const item = itemsRef.current[index];
    if (!item) return;
    const newGrams = Math.max(5, item.grams + delta);
    if (newGrams === item.grams) return;
    if (typeof navigator !== 'undefined') {
      const crossed100 = Math.floor(item.grams / 100) !== Math.floor(newGrams / 100);
      navigator.vibrate?.(crossed100 ? [5, 20, 5] : 5);
    }
    if (touchedRef.current !== index) {
      const perUnit = item.quantity > 0 ? item.grams / item.quantity : 1;
      setTouchSeed(isVolumeUnit(item.unit) ? Math.round(item.grams / perUnit) : item.grams);
      touchedRef.current = index;
      setTouchedIndex(index);
    }
    setItems(prev => prev.map((it, i) => (i === index ? recalcMacros(it, newGrams) : it)));
  }, []);

  /** Press-and-hold auto-repeat: first tick on press, then 110ms ticks after 450ms. */
  const startHold = useCallback((index: number, delta: number) => {
    endHold();
    stepGrams(index, delta);
    holdDelayRef.current = setTimeout(() => {
      holdRepeatRef.current = setInterval(() => stepGrams(index, delta), 110);
    }, 450);
  }, [endHold, stepGrams]);

  const submitClarification = () => {
    const answer = clarifyAnswer.trim();
    if (!answer || !onReparse || logging) return;
    onReparse(rawInputText ? `${rawInputText} — ${answer}` : answer);
  };

  // Calm-mode warning copy: when kcal display is disabled (ED-adjacent
  // clients), strip the numeric kcal parentheticals and calorie framing from
  // server warnings while keeping the portion-safety signal itself.
  const visibleWarnings = (warnings ?? []).map((w) => {
    if (showCalories) return w;
    if (!/kcal|calorie/i.test(w)) return w;
    return w
      .replace(/\s*\([^)]*kcal[^)]*\)/gi, '')
      .replace(/high-calorie meal detected/gi, t('food.large_meal_detected'))
      .replace(/\s{2,}/g, ' ')
      .trim();
  }).filter((w) => w.length > 0);

  const removeItem = (index: number) => {
    // Indices shift — drop the rolling-grams marker rather than roll the wrong row.
    touchedRef.current = null;
    setTouchedIndex(null);
    // W4: same reason — drop the open provenance caption so it can't reattach to the wrong row.
    setExplainIndex(null);
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const setGrams = (index: number, grams: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return recalcMacros(item, Math.max(1, grams));
    }));
  };

  const totalCalories = items.reduce((s, i) => s + i.calories, 0);
  const totalProtein = items.reduce((s, i) => s + i.protein_g, 0);
  const totalCarbs = items.reduce((s, i) => s + i.carbs_g, 0);
  const totalFat = items.reduce((s, i) => s + i.fat_g, 0);
  const totalFiber = items.reduce((s, i) => s + i.fiber_g, 0);
  const warning = getMacroWarning(items);
  const unresolvedPortions = items.filter((item) => item.portion_explicit === false).length;

  if (items.length === 0) {
    return (
      <div className="glass p-4 text-center">
        <p className="text-stone-500 text-sm mb-3">{t('food.no_items')}</p>
        <button onClick={onCancel} className="btn-ghost text-sm px-4 py-2">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Scrollable items list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 pb-64"
      >
        {/* Item count header — Cancel moved to save bar only */}
        <div className="px-1">
          <span className="text-stone-400 text-xs">
            {t('food.items_found', { n: String(items.length) })}
          </span>
        </div>

        {/* Server safety warnings — previously computed but never rendered */}
        {visibleWarnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="status"
            className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1"
          >
            {visibleWarnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-amber-300/80 text-[11px] leading-snug">
                <AlertTriangle size={12} className="text-amber-400/80 flex-shrink-0 mt-0.5" />
                <span>{w}</span>
              </p>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {items.map((item, index) => (
            <motion.div
              key={`${item.food_name}-${index}`}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, height: 0, marginBottom: 0 }}
              transition={{
                type: 'spring', stiffness: 420, damping: 32,
                delay: Math.min(index * 0.045, 0.35),
              }}
              className={`glass p-3${!item.portion_explicit ? ' border-l-2 border-amber-500/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {/* W4: confidence ring draws 0→confidence once on mount in the
                        tier color; tapping it toggles the plain-language caption. */}
                    {(() => {
                      const tier = resolveTier(item.data_quality, item.confidence);
                      const isOpen = explainIndex === index;
                      return (
                        <ProvenanceRing
                          confidence={item.confidence}
                          tier={tier}
                          onClick={() => setExplainIndex(isOpen ? null : index)}
                          expanded={isOpen}
                          ariaLabel={t('food.prov_ring_aria')}
                        />
                      );
                    })()}
                    <p className="text-stone-100 text-sm font-medium truncate">
                      {item.name_localized || item.food_name}
                    </p>
                  </div>
                  {item.name_localized && item.name_localized !== item.food_name && (
                    <p className="text-stone-500 text-xs mt-0.5">{item.food_name}</p>
                  )}
                  {/* W4: tap-to-explain — one-line plain-language provenance caption.
                      i18n keys logged to docs/superpowers/i18n-todo-w4.md. */}
                  <AnimatePresence initial={false}>
                    {explainIndex === index && (
                      <motion.p
                        key="provenance-caption"
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        className="text-stone-400 text-[11px] mt-1 leading-snug"
                      >
                        {t(TIER_CAPTION_KEY[resolveTier(item.data_quality, item.confidence)])}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {/* Branded / data-quality / community provenance chips. The brand
                      chip + OFF "community data" hint are from a prior wave; the
                      data_quality micro-chip (LAB / LABEL / COMMUNITY / AI ESTIMATE)
                      is W4. OFF is never double-labeled (getQualityChip returns null). */}
                  {(() => {
                    const chip = getQualityChip(item);
                    if (!item.brand && item.db_source !== 'off' && !chip) return null;
                    return (
                      <div className="flex items-center gap-1.5 mt-1">
                        {item.brand && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-800/70 border border-stone-700/50 text-stone-400 truncate max-w-[140px]">
                            {item.brand}
                          </span>
                        )}
                        {chip && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-800/70 border border-stone-700/50 uppercase tracking-wide"
                            style={{ color: chip.color, fontFamily: 'var(--font-mono)' }}
                          >
                            {t(chip.labelKey)}
                          </span>
                        )}
                        {item.db_source === 'off' && (
                          <span className="text-[10px] text-stone-500">community data</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={() => removeItem(index)}
                  className="p-1.5 text-stone-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Quantity adjuster — shows volume unit (ml/L) for liquids, grams otherwise */}
              <div className="flex items-center gap-2 mt-2">
                {(() => {
                  const vol = isVolumeUnit(item.unit);
                  const step = vol ? 50 : 25;
                  const displayVal = vol ? getDisplayQuantity(item) : item.grams;
                  const displayUnit = vol ? item.unit : 'g';
                  // Convert display delta to gram delta
                  const gramsPerDisplayUnit = item.quantity > 0 ? item.grams / item.quantity : 1;
                  const gramStep = vol ? Math.round(step * gramsPerDisplayUnit) : step;

                  // W5: only the stepper-touched row rolls its grams figure —
                  // typing (focus) suspends the overlay so the caret stays visible.
                  const rolling = touchedIndex === index && typingIndex !== index;
                  const stepperProps = (delta: number) => ({
                    onPointerDown: () => { pointerFiredRef.current = true; startHold(index, delta); },
                    onPointerUp: endHold,
                    onPointerLeave: () => { endHold(); pointerFiredRef.current = false; },
                    onPointerCancel: () => { endHold(); pointerFiredRef.current = false; },
                    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
                    // Keyboard activation only — pointer path already ticked on pointerdown.
                    onClick: () => {
                      if (pointerFiredRef.current) { pointerFiredRef.current = false; return; }
                      stepGrams(index, delta);
                    },
                    whileTap: reduceMotion ? undefined : { scale: 0.88 },
                    transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
                    className: 'w-11 h-11 flex items-center justify-center glass rounded-lg text-stone-400 hover:text-stone-200 transition-colors select-none touch-none',
                  });

                  return (
                    <>
                      <motion.button {...stepperProps(-gramStep)} aria-label={t('food.stepper_decrease')}>
                        <Minus size={16} />
                      </motion.button>
                      <div className="flex items-center gap-1">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={displayVal}
                            onChange={(e) => {
                              // Typing is explicit control — drop the rolling marker so
                              // blur doesn't replay a roll from a stale stepper seed.
                              touchedRef.current = null;
                              setTouchedIndex(null);
                              const newDisplay = parseInt(e.target.value) || 1;
                              const newGrams = vol
                                ? Math.round(newDisplay * gramsPerDisplayUnit)
                                : newDisplay;
                              setGrams(index, newGrams);
                            }}
                            onFocus={() => setTypingIndex(index)}
                            onBlur={() => setTypingIndex(null)}
                            className={`input-dark text-center text-sm w-20 py-2 ${rolling ? 'text-transparent' : ''}`}
                            min={1}
                          />
                          {/* Rolling digits painted over the (transparent) input text */}
                          {rolling && (
                            <span
                              aria-hidden
                              className="absolute inset-0 flex items-center justify-center text-sm text-stone-100 pointer-events-none"
                            >
                              <AnimatedValue
                                value={displayVal}
                                duration={220}
                                grouped={false}
                                startAt={touchSeed}
                              />
                            </span>
                          )}
                        </div>
                        <span className="text-stone-500 text-xs">{displayUnit}</span>
                      </div>
                      <motion.button {...stepperProps(gramStep)} aria-label={t('food.stepper_increase')}>
                        <Plus size={16} />
                      </motion.button>
                      {/* Show original input as hint (for non-volume, show quantity+unit) */}
                      {!vol && (
                        <span className="text-stone-600 text-xs ml-auto">
                          {item.quantity} {item.unit}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Macros */}
              <div className="flex gap-3 mt-2 text-xs text-stone-400">
                <span className="gold-text font-medium">{item.calories} kcal</span>
                <span>P: {item.protein_g}g</span>
                <span>C: {item.carbs_g}g</span>
                <span>F: {item.fat_g}g</span>
                {item.fiber_g > 0 && <span className="text-green-400">Fb: {item.fiber_g}g</span>}
                {(item.sugar_g ?? 0) > 0 && <span className="text-orange-400">S: {item.sugar_g}g</span>}
              </div>

              {/* Estimated-portion spread — only for implicit portions, kcal-gated.
                  W4: on mount shows ≈min–max, then settles to the center kcal
                  (rolls via AnimatedValue) after ~450ms. */}
              {showCalories && item.portion_explicit === false && item.calories_range && (
                <CaloriesRangeSettle range={item.calories_range} rangeLabel={t('food.range_approx', {
                  min: Math.round(item.calories_range.min),
                  max: Math.round(item.calories_range.max),
                })} />
              )}

              {/* Photo-path model uncertainty note */}
              {item.accuracy_note && (
                <p className="text-stone-500 text-[10px] mt-1 leading-snug">{item.accuracy_note}</p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Clarification — show the AI's ACTUAL question with an inline answer
            field (text path). Answering re-parses "original — answer". The old
            banner replaced the question with generic copy and no way to reply. */}
        {clarificationQuestion ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="alert"
            className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-300/90 text-[11px] leading-snug">{clarificationQuestion}</p>
            </div>
            {onReparse && (
              <div className="flex gap-1.5 pl-6">
                <input
                  type="text"
                  value={clarifyAnswer}
                  onChange={(e) => setClarifyAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitClarification();
                    }
                  }}
                  placeholder={t('food.answer_refine_placeholder')}
                  disabled={logging}
                  className="input-dark flex-1 text-xs py-1.5"
                  aria-label="Answer the clarification question"
                />
                <button
                  onClick={submitClarification}
                  disabled={!clarifyAnswer.trim() || logging}
                  className="px-2.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40 transition-colors flex items-center"
                  aria-label="Submit answer and re-analyze"
                >
                  <CornerDownLeft size={13} />
                </button>
              </div>
            )}
          </motion.div>
        ) : unresolvedPortions > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="alert"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30"
          >
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            <p className="text-amber-300/80 text-[11px] line-clamp-2">
              {unresolvedPortions === 1 ? 'Estimated portion' : `${unresolvedPortions} estimated portions`} — adjust if needed, or save as-is.
            </p>
          </motion.div>
        ) : null}
      </motion.div>

      {/* F1: Sticky Save Bar — always visible at bottom */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-24 left-0 right-0 z-50 px-4"
      >
        <div className="max-w-md mx-auto glass-elevated p-4 rounded-2xl border border-[#D4A853]/20 shadow-[0_-4px_24px_rgba(212,168,83,0.15)]">
          {/* Macro summary row — totals roll (W5) as steppers adjust portions */}
          <div className="grid grid-cols-5 gap-1 text-center mb-3">
            <div>
              <p className="text-sm font-bold gold-text">
                <AnimatedValue value={Math.round(totalCalories)} duration={220} grouped={false} />
              </p>
              <p className="text-[10px] text-stone-500">kcal</p>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: MACRO_COLORS.protein }}>
                <AnimatedValue value={Math.round(totalProtein)} duration={220} grouped={false} />g
              </p>
              <p className="text-[10px] text-stone-500">Protein</p>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: MACRO_COLORS.carbs }}>
                <AnimatedValue value={Math.round(totalCarbs)} duration={220} grouped={false} />g
              </p>
              <p className="text-[10px] text-stone-500">Carbs</p>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: MACRO_COLORS.fat }}>
                <AnimatedValue value={Math.round(totalFat)} duration={220} grouped={false} />g
              </p>
              <p className="text-[10px] text-stone-500">Fat</p>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: MACRO_COLORS.fiber }}>
                <AnimatedValue value={Math.round(totalFiber)} duration={220} grouped={false} />g
              </p>
              <p className="text-[10px] text-stone-500">Fiber</p>
            </div>
          </div>

          {/* Soft warning for estimated portions — non-blocking */}
          {unresolvedPortions > 0 && (
            <p className="text-amber-400/70 text-[10px] text-center mb-2">
              {unresolvedPortions} estimated portion{unresolvedPortions > 1 ? 's' : ''} — tap items to adjust
            </p>
          )}

          {/* Macro-balance nudge — calm, protein-first, no kcal */}
          {warning && (
            <p className="text-stone-400 text-[10px] text-center mb-2">{t(warning)}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="btn-ghost flex-shrink-0 py-3 px-4 text-sm"
            >
              {t('general.cancel')}
            </button>
            <motion.button
              onClick={() => onConfirm(items)}
              disabled={logging || items.length === 0}
              whileTap={{ scale: 0.97 }}
              className="btn-gold flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(212,168,83,0.3)]"
            >
              <Check size={16} />
              {logging ? '...' : `${t('food.confirm_all')} (${items.length})`}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
