'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, ChefHat } from 'lucide-react';
import type { RecipeAnalyzeOutput } from '@/agents/schemas/recipe-analyze';

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

  if (!isOpen) return null;

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
    background: active ? 'var(--gold-300,#D4A853)' : 'transparent',
    color: active ? '#0a0a0a' : 'var(--t3,#a8a29e)',
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    letterSpacing: '.04em', textTransform: 'uppercase',
  });

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-1,#1c1917)', border: '1px solid var(--line-2,rgba(255,255,255,0.08))', maxHeight: '88vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--t1,#f5f5f4)' }}>AI for {slotLabel}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,.06)' }}>
              <X size={14} style={{ color: 'var(--t3,#a8a29e)' }} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mx-5 mb-3 p-1 rounded-xl flex gap-1" style={{ background: 'var(--surface,#141414)' }}>
            <button style={tabBtn(mode === 'suggest')} onClick={() => setMode('suggest')}>Suggest</button>
            <button style={tabBtn(mode === 'recipe')} onClick={() => setMode('recipe')}>Analyze recipe</button>
          </div>

          <div className="px-5 pb-5">
            {error && <p className="text-xs mb-3" style={{ color: '#f87171' }}>{error}</p>}

            {mode === 'suggest' ? (
              <>
                <p className="text-xs mb-3" style={{ color: 'var(--t3,#a8a29e)' }}>
                  Budget for this slot ≈ <b style={{ color: 'var(--t2,#d6d3d1)' }}>{budget.calories} kcal</b> · {budget.protein}P / {budget.carbs}C / {budget.fat}F
                </p>
                {!suggestions && (
                  <button
                    onClick={fetchSuggestions}
                    disabled={loadingSuggest}
                    style={{
                      width: '100%', padding: 12, borderRadius: 12, border: 'none',
                      background: 'var(--gold-300,#D4A853)', color: '#0a0a0a',
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
                      <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.07))' }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'var(--t1,#f5f5f4)' }}>{s.name}</span>
                          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)' }}>{r(s.estimated_calories)} kcal</span>
                        </div>
                        <p className="text-[11px] mb-2" style={{ color: 'var(--t3,#a8a29e)' }}>{s.description}</p>
                        <p className="text-[10px] mb-2" style={{ color: 'var(--t4,#78716c)' }}>
                          {s.estimated_protein_g}P · {s.estimated_carbs_g}C · {s.estimated_fat_g}F &nbsp;·&nbsp; {s.ingredients.slice(0, 4).join(', ')}
                        </p>
                        <button
                          onClick={() => applySuggestion(s)}
                          style={{
                            width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                            background: 'rgba(212,168,83,.12)', border: '1px solid rgba(212,168,83,.3)',
                            color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                          }}
                        >
                          Use this
                        </button>
                      </div>
                    ))}
                    <button onClick={fetchSuggestions} disabled={loadingSuggest} className="text-[11px] mt-1" style={{ color: 'var(--t4,#78716c)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
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
                    width: '100%', background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.08))',
                    borderRadius: 10, padding: '9px 11px', color: 'var(--t1,#f5f5f4)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10,
                  }}
                />
                <button
                  onClick={analyzeRecipe}
                  disabled={loadingRecipe || !recipeText.trim()}
                  style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none',
                    background: 'var(--gold-300,#D4A853)', color: '#0a0a0a',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                    cursor: loadingRecipe || !recipeText.trim() ? 'not-allowed' : 'pointer', opacity: recipeText.trim() ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loadingRecipe ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><ChefHat size={14} /> Analyze macros</>}
                </button>
                {recipe && (
                  <div className="rounded-2xl p-3 mt-3" style={{ background: 'var(--surface,#141414)', border: '1px solid var(--line,rgba(255,255,255,.07))' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--t1,#f5f5f4)' }}>{recipe.recipe_name}</span>
                      <span className="text-[10px]" style={{ color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)' }}>{r(recipe.per_serving.calories)} kcal/serving</span>
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--t4,#78716c)' }}>
                      per serving · {r(recipe.per_serving.protein_g)}P · {r(recipe.per_serving.carbs_g)}C · {r(recipe.per_serving.fat_g)}F
                    </p>
                    <button
                      onClick={useRecipe}
                      style={{
                        width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(212,168,83,.12)', border: '1px solid rgba(212,168,83,.3)',
                        color: 'var(--gold-300,#D4A853)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
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
