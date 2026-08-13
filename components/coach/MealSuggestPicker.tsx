'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Sparkles, Loader2, ChefHat } from 'lucide-react';
import type { RecipeAnalyzeOutput } from '@/agents/schemas/recipe-analyze';
import { useDialogFocus } from '@/components/shared/useDialogFocus';

/**
 * Coach-facing AI helper for the meal-plan editor (Daily Nutrafit "AI saves me
 * time" lever). Surfaces two backends that already existed but had no coach UI:
 *
 *   • Suggest  → POST /api/ai/meal-suggest with the client's daily targets
 *                apportioned to this slot. Returns 3 meals; coach picks one.
 *   • Recipe   → POST /api/food/recipe-analyze on pasted recipe text. Coach
 *                drops the analyzed dish (name + per-serving kcal) into the cell.
 *
 * Auth is same-origin cookie (no token header), matching QuickFoodInput /
 * RecipeAnalyzerModal. The chosen text is returned via onPick — the editor
 * writes + persists it to meal_plan_entries.
 */

export interface PickerTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Props {
  isOpen: boolean;
  slotLabel: string;
  /** Fraction of the daily macro budget this slot should cover (0–1). */
  slotFraction: number;
  targets: PickerTargets;
  /** Current cell text — if present, opens in "Analyze recipe" mode pre-filled (clickable meal → recipe breakdown). */
  initialText?: string;
  onPick: (text: string) => void;
  onClose: () => void;
}

interface MealSuggestion {
  name: string;
  description: string;
  ingredients: string[];
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
}

const r = (n: number) => Math.max(0, Math.round(n));

export default function MealSuggestPicker({ isOpen, slotLabel, slotFraction, targets, initialText, onPick, onClose }: Props) {
  const seeded = (initialText ?? '').trim();
  // If the cell already has a meal, open straight into recipe-breakdown mode.
  const [mode, setMode] = useState<'suggest' | 'recipe'>(seeded ? 'recipe' : 'suggest');

  // Suggest mode
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  // Recipe mode
  const [recipeText, setRecipeText] = useState(seeded);
  const [recipe, setRecipe] = useState<RecipeAnalyzeOutput | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const budget = {
    calories: r(targets.calories * slotFraction),
    protein: r(targets.protein * slotFraction),
    carbs: r(targets.carbs * slotFraction),
    fat: r(targets.fat * slotFraction),
  };

  async function fetchSuggestions() {
    setLoadingSuggest(true);
    setError(null);
    setSuggestions(null);
    try {
      const res = await fetch('/api/ai/meal-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remaining_calories: budget.calories,
          remaining_protein_g: budget.protein,
          remaining_carbs_g: budget.carbs,
          remaining_fat_g: budget.fat,
          meal_type: slotLabel,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { suggestions?: MealSuggestion[]; error?: string };
      // The route returns FALLBACK_SUGGESTIONS even on 502, so render whatever came back.
      if (data.suggestions && data.suggestions.length > 0) setSuggestions(data.suggestions);
      else setError(data.error || 'No suggestions returned.');
    } catch {
      setError('Could not reach the suggestion service.');
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function analyzeRecipe() {
    if (!recipeText.trim() || loadingRecipe) return;
    setLoadingRecipe(true);
    setError(null);
    setRecipe(null);
    try {
      const res = await fetch('/api/food/recipe-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: recipeText.slice(0, 30_000), servings: 1, language: 'en' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Analyzer returned ${res.status}`);
      }
      setRecipe((await res.json()) as RecipeAnalyzeOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoadingRecipe(false);
    }
  }

  // Drop a suggestion into the cell as "Name — ing, ing, ing".
  function applySuggestion(s: MealSuggestion) {
    const ings = s.ingredients.slice(0, 6).join(', ');
    onPick(ings ? `${s.name} — ${ings}` : s.name);
  }

  function useRecipe() {
    if (!recipe) return;
    onPick(`${recipe.recipe_name} (~${r(recipe.per_serving.calories)} kcal/serving)`);
  }

  useDialogFocus(isOpen, onClose, dialogRef);
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
    background: active ? 'var(--action-primary)' : 'transparent',
    color: active ? 'var(--action-on-primary)' : 'var(--content-muted)',
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    letterSpacing: '.04em', textTransform: 'uppercase',
  });

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }} animate={reduceMotion ? undefined : { opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal,60)] flex items-end sm:items-center justify-center"
        style={{ background: 'color-mix(in srgb, var(--canvas) 80%, transparent)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="meal-suggest-title"
          tabIndex={-1}
          initial={reduceMotion ? false : { y: '100%', opacity: 0 }} animate={reduceMotion ? undefined : { y: 0, opacity: 1 }} exit={reduceMotion ? undefined : { y: '100%', opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="safe-bottom w-full overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:max-w-md sm:rounded-3xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)', maxHeight: '88vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: 'var(--action-primary)' }} />
              <h2 id="meal-suggest-title" className="text-base font-bold" style={{ color: 'var(--content-primary)' }}>AI for {slotLabel}</h2>
            </div>
            <button aria-label="Close meal assistant" onClick={onClose} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--border-subtle)' }}>
              <X aria-hidden="true" size={14} style={{ color: 'var(--content-muted)' }} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mx-5 mb-3 p-1 rounded-xl flex gap-1" style={{ background: 'var(--surface-1)' }}>
            <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={tabBtn(mode === 'suggest')} onClick={() => setMode('suggest')}>Suggest</button>
            <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={tabBtn(mode === 'recipe')} onClick={() => setMode('recipe')}>Analyze recipe</button>
          </div>

          <div className="px-5 pb-5">
            {error && <p className="text-xs mb-3" style={{ color: 'var(--status-danger-fg)' }}>{error}</p>}

            {mode === 'suggest' ? (
              <>
                <p className="text-xs mb-3" style={{ color: 'var(--content-muted)' }}>
                  Budget for this slot ≈ <b style={{ color: 'var(--content-secondary)' }}>{budget.calories} kcal</b> · {budget.protein}P / {budget.carbs}C / {budget.fat}F
                </p>
                {!suggestions && (
                  <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    onClick={fetchSuggestions}
                    disabled={loadingSuggest}
                    style={{
                      width: '100%', padding: 12, borderRadius: 12, border: 'none',
                      background: 'var(--action-primary)', color: 'var(--action-on-primary)',
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                      cursor: loadingSuggest ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {loadingSuggest ? <><Loader2 size={14} className="animate-spin" /> Thinking…</> : <><Sparkles size={14} /> Suggest 3 meals</>}
                  </button>
                )}
                {suggestions && (
                  <div className="flex flex-col gap-2.5">
                    {suggestions.map((s, i) => (
                      <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{s.name}</span>
                          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--action-primary)', fontFamily: 'var(--font-mono)' }}>{r(s.estimated_calories)} kcal</span>
                        </div>
                        <p className="text-xs mb-2" style={{ color: 'var(--content-muted)' }}>{s.description}</p>
                        <p className="text-xs mb-2" style={{ color: 'var(--content-muted)' }}>
                          {s.estimated_protein_g}P · {s.estimated_carbs_g}C · {s.estimated_fat_g}F &nbsp;·&nbsp; {s.ingredients.slice(0, 4).join(', ')}
                        </p>
                        <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          onClick={() => applySuggestion(s)}
                          style={{
                            width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                            background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)',
                            color: 'var(--action-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                          }}
                        >
                          Use this
                        </button>
                      </div>
                    ))}
                    <button onClick={fetchSuggestions} disabled={loadingSuggest} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs mt-1" style={{ color: 'var(--content-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                      {loadingSuggest ? 'Thinking…' : '↻ regenerate'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  value={recipeText}
                  onChange={(e) => setRecipeText(e.target.value)}
                  placeholder={'Paste a recipe — e.g.\nGreek chicken bowl\n- 150g chicken breast\n- 100g rice\n- 1 tbsp olive oil'}
                  rows={5}
                  style={{
                    width: '100%', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
                    borderRadius: 10, padding: '9px 11px', color: 'var(--content-primary)', fontSize: 16, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10,
                  }}
                />
                <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  onClick={analyzeRecipe}
                  disabled={loadingRecipe || !recipeText.trim()}
                  style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none',
                    background: 'var(--action-primary)', color: 'var(--action-on-primary)',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                    cursor: loadingRecipe || !recipeText.trim() ? 'not-allowed' : 'pointer', opacity: recipeText.trim() ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loadingRecipe ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><ChefHat size={14} /> Analyze macros</>}
                </button>
                {recipe && (
                  <div className="rounded-2xl p-3 mt-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{recipe.recipe_name}</span>
                      <span className="text-xs" style={{ color: 'var(--action-primary)', fontFamily: 'var(--font-mono)' }}>{r(recipe.per_serving.calories)} kcal/serving</span>
                    </div>
                    <p className="text-xs mb-2" style={{ color: 'var(--content-muted)' }}>
                      per serving · {r(recipe.per_serving.protein_g)}P · {r(recipe.per_serving.carbs_g)}C · {r(recipe.per_serving.fat_g)}F
                    </p>
                    <button className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      onClick={useRecipe}
                      style={{
                        width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                        background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)',
                        color: 'var(--action-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                      }}
                    >
                      Use this dish
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
