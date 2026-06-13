'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChefHat, Loader2, Check } from 'lucide-react';
import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';
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

export default function RecipeAnalyzerModal({
  userId,
  selectedDate,
  defaultMealType = 'lunch',
  isOpen,
  onClose,
  onLogged,
}: RecipeAnalyzerModalProps) {
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
    try {
      const res = await fetch('/api/food/recipe-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, servings, language: 'en' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Analyzer returned ${res.status}`);
      }
      const data = (await res.json()) as RecipeAnalyzeOutput;
      setResult(data);
      setLogServings(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
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
      const { error: insertError } = await supabase.from('food_log').insert(entry);
      if (insertError) {
        setError(insertError.message);
        setLogging(false);
        return;
      }
      onLogged();
      reset();
      onClose();
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="glass-elevated w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/5" style={{ background: 'var(--bg-card-elevated)' }}>
              <div className="flex items-center gap-2">
                <ChefHat size={18} className="text-[#D4A853]" />
                <h3 className="font-semibold text-stone-100">Analyze recipe</h3>
              </div>
              <button onClick={handleClose} className="text-stone-500 hover:text-stone-300">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Input phase */}
              {!result && (
                <>
                  <div>
                    <label className="text-[11px] text-stone-500 mb-1.5 block uppercase tracking-wider">
                      Paste recipe
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={'Greek chicken salad\nServes: 4\n\nIngredients:\n- 500g chicken breast\n- 200g feta\n- 2 tomatoes\n- 2 tbsp olive oil'}
                      className="input-dark w-full min-h-[180px] font-mono text-[13px] resize-none"
                      disabled={analyzing}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[11px] text-stone-500 uppercase tracking-wider">
                      Servings yielded
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={servings}
                      onChange={(e) => setServings(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="input-dark w-20 text-center"
                      disabled={analyzing}
                    />
                  </div>

                  {error && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={analyze}
                    disabled={!text.trim() || analyzing}
                    className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <p className="text-[10px] text-stone-500 uppercase tracking-wider">Recipe</p>
                    <h4 className="text-base font-semibold text-stone-100">{result.recipe_name}</h4>
                    <p className="text-[11px] text-stone-500">
                      {result.servings} serving{result.servings !== 1 ? 's' : ''} · {result.ingredients.length} ingredient{result.ingredients.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Per-serving card — the hero */}
                  <div className="rounded-xl p-4 border border-[#D4A853]/20" style={{ background: 'var(--bg-card)' }}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[11px] text-stone-500 uppercase tracking-wider">Per serving</span>
                      <span className="text-xl font-bold text-[#D4A853]">{result.per_serving.calories}<span className="text-[11px] text-stone-500 font-normal ml-1">kcal</span></span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-sm font-bold text-red-400">{result.per_serving.protein_g}g</div>
                        <div className="text-[9px] text-stone-500">Protein</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-blue-400">{result.per_serving.carbs_g}g</div>
                        <div className="text-[9px] text-stone-500">Carbs</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-purple-400">{result.per_serving.fat_g}g</div>
                        <div className="text-[9px] text-stone-500">Fat</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-green-400">{result.per_serving.fiber_g}g</div>
                        <div className="text-[9px] text-stone-500">Fiber</div>
                      </div>
                    </div>
                  </div>

                  {/* Total recipe — secondary */}
                  <details className="rounded-lg border border-white/5 bg-white/[0.02]">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] text-stone-400 flex items-center justify-between">
                      <span>Total ({result.servings} servings)</span>
                      <span className="text-stone-300">{result.total.calories} kcal · P{result.total.protein_g} C{result.total.carbs_g} F{result.total.fat_g}</span>
                    </summary>
                  </details>

                  {/* Ingredients collapsible */}
                  <button
                    onClick={() => setShowIngredients(!showIngredients)}
                    className="w-full text-left text-[11px] text-stone-500 hover:text-stone-300 flex items-center justify-between"
                  >
                    <span>{showIngredients ? 'Hide' : 'Show'} ingredient breakdown</span>
                    <span>{showIngredients ? '▲' : '▼'}</span>
                  </button>
                  {showIngredients && (
                    <div className="space-y-1.5 pl-2 border-l border-white/5">
                      {result.ingredients.map((ing, idx) => (
                        <div key={idx} className="text-[11px] flex items-baseline justify-between gap-2">
                          <span className="text-stone-300 truncate">
                            {ing.food_name} <span className="text-stone-600">({ing.grams}g)</span>
                          </span>
                          <span className="text-stone-500 whitespace-nowrap">{ing.calories} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Log controls */}
                  <div className="pt-3 border-t border-white/5 space-y-3">
                    <div>
                      <label className="text-[11px] text-stone-500 uppercase tracking-wider mb-1.5 block">
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
                        <span className="text-sm font-semibold text-[#D4A853] tabular-nums w-14 text-right">
                          {logServings}×
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-500 mt-1">
                        ≈ {Math.round(result.per_serving.calories * logServings)} kcal · P{Math.round(result.per_serving.protein_g * logServings * 10) / 10} C{Math.round(result.per_serving.carbs_g * logServings * 10) / 10} F{Math.round(result.per_serving.fat_g * logServings * 10) / 10}
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] text-stone-500 uppercase tracking-wider mb-1.5 block">
                        Meal
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {MEAL_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setMealType(opt.value)}
                            className={`py-2 rounded-lg text-[11px] font-medium transition-colors ${
                              mealType === opt.value
                                ? 'bg-[#D4A853]/15 text-[#D4A853] border border-[#D4A853]/30'
                                : 'border border-white/5 text-stone-500 hover:text-stone-300'
                            }`}
                          >
                            <div><Icon name={opt.icon as Parameters<typeof Icon>[0]['name']} size={16} /></div>
                            <div>{opt.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                        {error}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setResult(null)}
                        className="btn-ghost text-xs"
                        disabled={logging}
                      >
                        Edit recipe
                      </button>
                      <button
                        onClick={logRecipe}
                        disabled={logging}
                        className="btn-gold text-xs flex items-center justify-center gap-2"
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
