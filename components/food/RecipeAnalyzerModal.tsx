'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ChefHat, Loader2, Check } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';
import { MACRO_COLORS } from '@/lib/macro-colors';
import type { RecipeAnalyzeOutput } from '@/agents/schemas/recipe-analyze';

interface RecipeAnalyzerModalProps {
  userId: string;
  selectedDate: string;
  defaultMealType?: MealType;
  isOpen: boolean;
  onClose: () => void;
  onLogged: () => void;
}

const MEAL_OPTIONS: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Breakfast', icon: 'i-sun'    },
  { value: 'lunch',     label: 'Lunch',     icon: 'i-bowl'   },
  { value: 'dinner',    label: 'Dinner',    icon: 'i-moon'   },
  { value: 'snack',     label: 'Snack',     icon: 'i-apple'  },
];
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export default function RecipeAnalyzerModal({
  userId,
  selectedDate,
  defaultMealType = 'lunch',
  isOpen,
  onClose,
  onLogged,
}: RecipeAnalyzerModalProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [text, setText] = useState('');
  const [servings, setServings] = useState(4);
  const [logServings, setLogServings] = useState(1);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RecipeAnalyzeOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  async function analyze() {
    if (!text.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    // 30s cap — without it a hung analyzer request left the modal spinning forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch('/api/food/recipe-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, servings, language: 'en' }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Analyzer returned ${res.status}`);
      }
      const data = (await res.json()) as RecipeAnalyzeOutput;
      setResult(data);
      setLogServings(1);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError(t('food.recipe_timeout'));
      } else {
        setError(err instanceof Error ? err.message : 'Analysis failed');
      }
    } finally {
      clearTimeout(timeout);
      setAnalyzing(false);
    }
  }

  async function logRecipe() {
    if (!result || logging) return;
    setLogging(true);
    try {
      const ps = result.per_serving;
      const entry = {
        user_id: userId,
        logged_date: selectedDate,
        meal_type: mealType,
        food_name: `${result.recipe_name} (${logServings} serving${logServings !== 1 ? 's' : ''})`,
        quantity: logServings,
        unit: 'serving',
        calories: Math.round(ps.calories * logServings),
        protein_g: Math.round(ps.protein_g * logServings * 10) / 10,
        carbs_g: Math.round(ps.carbs_g * logServings * 10) / 10,
        fat_g: Math.round(ps.fat_g * logServings * 10) / 10,
        fiber_g: Math.round(ps.fiber_g * logServings * 10) / 10,
        source: 'custom' as const,
      };
      const { data: inserted, error: insertError } = await supabase
        .from('food_log')
        .insert(entry)
        .select('id')
        .maybeSingle();
      if (insertError || !inserted) {
        setError(t('food.save_failed'));
        return;
      }
      onLogged();
      reset();
      onClose();
    } catch {
      setError(t('food.save_failed'));
    } finally {
      setLogging(false);
    }
  }

  function reset() {
    setText('');
    setServings(4);
    setLogServings(1);
    setResult(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setText('');
      setServings(4);
      setLogServings(1);
      setResult(null);
      setError(null);
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Analyze recipe"
            tabIndex={-1}
            onKeyDown={(event) => trapFocus(event, dialogRef.current)}
            initial={reducedMotion ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 40 }}
            className="glass-elevated safe-bottom w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-[var(--border-default)]" style={{ background: 'var(--surface-overlay)' }}>
              <div className="flex items-center gap-2">
                <ChefHat size={18} className="text-[var(--action-primary)]" />
                <h3 className="font-semibold text-[var(--content-primary)]">Analyze recipe</h3>
              </div>
              <button onClick={handleClose} aria-label="Close recipe analyzer" className="text-[var(--content-muted)] hover:text-[var(--content-secondary)] min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Input phase */}
              {!result && (
                <>
                  <div>
                    <label className="text-xs text-[var(--content-muted)] mb-1.5 block uppercase tracking-wider">
                      Paste recipe
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={'Greek chicken salad\nServes: 4\n\nIngredients:\n- 500g chicken breast\n- 200g feta\n- 2 tomatoes\n- 2 tbsp olive oil'}
                      className="input-dark w-full min-h-[180px] font-mono text-[13px] resize-none text-base"
                      disabled={analyzing}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider">
                      Servings yielded
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={servings}
                      onChange={(e) => setServings(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="input-dark w-20 text-center text-base"
                      disabled={analyzing}
                    />
                  </div>

                  {error && (
                    <div className="text-xs text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-lg p-2.5">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={analyze}
                    disabled={!text.trim() || analyzing}
                    className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      'Analyze recipe'
                    )}
                  </button>
                </>
              )}

              {/* Result phase */}
              {result && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Recipe</p>
                    <h4 className="text-base font-semibold text-[var(--content-primary)]">{result.recipe_name}</h4>
                    <p className="text-xs text-[var(--content-muted)]">
                      {result.servings} serving{result.servings !== 1 ? 's' : ''} · {result.ingredients.length} ingredient{result.ingredients.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Per-serving card — the hero */}
                  <div className="rounded-xl p-4 border border-[var(--border-focus)]/20" style={{ background: 'var(--surface-1)' }}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs text-[var(--content-muted)] uppercase tracking-wider">Per serving</span>
                      <span className="text-xl font-bold text-[var(--action-primary)]">{result.per_serving.calories}<span className="text-xs text-[var(--content-muted)] font-normal ml-1">kcal</span></span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-sm font-bold" style={{ color: MACRO_COLORS.protein }}>{result.per_serving.protein_g}g</div>
                        <div className="text-xs text-[var(--content-muted)]">Protein</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: MACRO_COLORS.carbs }}>{result.per_serving.carbs_g}g</div>
                        <div className="text-xs text-[var(--content-muted)]">Carbs</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: MACRO_COLORS.fat }}>{result.per_serving.fat_g}g</div>
                        <div className="text-xs text-[var(--content-muted)]">Fat</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: MACRO_COLORS.fiber }}>{result.per_serving.fiber_g}g</div>
                        <div className="text-xs text-[var(--content-muted)]">Fiber</div>
                      </div>
                    </div>
                  </div>

                  {/* Total recipe — secondary */}
                  <details className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
                    <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--content-secondary)] flex items-center justify-between">
                      <span>Total ({result.servings} servings)</span>
                      <span className="text-[var(--content-secondary)]">{result.total.calories} kcal · P{result.total.protein_g} C{result.total.carbs_g} F{result.total.fat_g}</span>
                    </summary>
                  </details>

                  {/* Ingredients collapsible */}
                  <button
                    onClick={() => setShowIngredients(!showIngredients)}
                    className="w-full text-left text-xs text-[var(--content-muted)] hover:text-[var(--content-secondary)] flex items-center justify-between min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <span>{showIngredients ? 'Hide' : 'Show'} ingredient breakdown</span>
                    <span>{showIngredients ? '▲' : '▼'}</span>
                  </button>
                  {showIngredients && (
                    <div className="space-y-1.5 pl-2 border-l border-[var(--border-default)]">
                      {result.ingredients.map((ing, idx) => (
                        <div key={idx} className="text-xs flex items-baseline justify-between gap-2">
                          <span className="text-[var(--content-secondary)] truncate">
                            {ing.food_name} <span className="text-[var(--content-muted)]">({ing.grams}g)</span>
                          </span>
                          <span className="text-[var(--content-muted)] whitespace-nowrap">{ing.calories} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Log controls */}
                  <div className="pt-3 border-t border-[var(--border-default)] space-y-3">
                    <div>
                      <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-1.5 block">
                        How many servings did you eat?
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0.25}
                          max={result.servings}
                          step={0.25}
                          value={logServings}
                          onChange={(e) => setLogServings(Number(e.target.value))}
                          className="flex-1 accent-[#D4A853]"
                        />
                        <span className="text-sm font-semibold text-[var(--action-primary)] tabular-nums w-14 text-right">
                          {logServings}×
                        </span>
                      </div>
                      <p className="text-xs text-[var(--content-muted)] mt-1">
                        ≈ {Math.round(result.per_serving.calories * logServings)} kcal · P{Math.round(result.per_serving.protein_g * logServings * 10) / 10} C{Math.round(result.per_serving.carbs_g * logServings * 10) / 10} F{Math.round(result.per_serving.fat_g * logServings * 10) / 10}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-[var(--content-muted)] uppercase tracking-wider mb-1.5 block">
                        Meal
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {MEAL_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setMealType(opt.value)}
                            className={`min-h-11 min-w-11 py-2 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                              mealType === opt.value
                                ? 'bg-[var(--action-primary)] text-[var(--action-on-primary)] border border-[var(--border-focus)]'
                                : 'border border-[var(--border-default)] text-[var(--content-muted)] hover:text-[var(--content-secondary)]'
                            }`}
                          >
                            <div><Icon name={opt.icon as Parameters<typeof Icon>[0]['name']} size={16} /></div>
                            <div>{opt.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="text-xs text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-lg p-2.5">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setResult(null)}
                        className="btn-ghost text-xs min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        disabled={logging}
                      >
                        Edit recipe
                      </button>
                      <button
                        onClick={logRecipe}
                        disabled={logging}
                        className="btn-gold text-xs flex items-center justify-center gap-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        {logging ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Log
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
