'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FoodLogEntry, MealType } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import RecipeSuggestions from '@/components/RecipeSuggestions';

interface FoodSearchResult {
  fdcId: number;
  description: string;
  name_el?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  servingSize?: number;
  servingUnit?: string;
  brandName?: string;
}

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍎' },
  { value: 'pre_workout', label: 'Pre-workout', emoji: '💪' },
  { value: 'post_workout', label: 'Post-workout', emoji: '🏋️' },
];

const MEAL_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  pre_workout: 4,
  post_workout: 5,
};

export default function FoodLogPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [quantity, setQuantity] = useState(1);
  const [todayLog, setTodayLog] = useState<FoodLogEntry[]>([]);
  const [showMealPicker, setShowMealPicker] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const totalCalories = todayLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein = todayLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs = todayLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat = todayLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);

  const loadTodayLog = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from('food_log')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_date', today)
      .order('created_at', { ascending: true });

    if (data) setTodayLog(data);
  }, [today]);

  useEffect(() => {
    loadTodayLog();
  }, [loadTodayLog]);

  const searchFood = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.foods ?? data.results ?? []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const addFood = async (food: FoodSearchResult) => {
    if (!userId) return;
    setAdding(food.fdcId);

    const entry = {
      user_id: userId,
      logged_date: today,
      meal_type: mealType,
      food_name: food.description,
      quantity,
      unit: food.servingUnit || 'serving',
      calories: Math.round((food.calories ?? 0) * quantity),
      protein_g: Math.round((food.protein_g ?? 0) * quantity * 10) / 10,
      carbs_g: Math.round((food.carbs_g ?? 0) * quantity * 10) / 10,
      fat_g: Math.round((food.fat_g ?? 0) * quantity * 10) / 10,
      source: 'usda' as const,
      source_id: String(food.fdcId),
    };

    const { data } = await supabase.from('food_log').insert(entry).select().single();
    if (data) setTodayLog((prev) => [...prev, data]);
    setAdding(null);
    setQuantity(1);
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from('food_log').delete().eq('id', id);
    if (!error) setTodayLog((prev) => prev.filter((e) => e.id !== id));
  };

  // Group log entries by meal type
  const grouped = todayLog.reduce<Record<string, FoodLogEntry[]>>((acc, entry) => {
    const key = entry.meal_type || 'snack';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const sortedMealKeys = Object.keys(grouped).sort(
    (a, b) => (MEAL_ORDER[a as MealType] ?? 99) - (MEAL_ORDER[b as MealType] ?? 99)
  );

  const selectedMealInfo = MEAL_TYPES.find((m) => m.value === mealType)!;

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Header */}
        <h1 className="text-2xl font-bold text-stone-100 mb-6">Track Food</h1>

        {/* Daily Macro Totals */}
        <div className="glass p-4 mb-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-lg font-bold gold-text">{Math.round(totalCalories)}</p>
              <p className="text-[10px] text-stone-500">kcal</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400">{Math.round(totalProtein)}g</p>
              <p className="text-[10px] text-stone-500">Protein</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-400">{Math.round(totalCarbs)}g</p>
              <p className="text-[10px] text-stone-500">Carbs</p>
            </div>
            <div>
              <p className="text-lg font-bold text-purple-400">{Math.round(totalFat)}g</p>
              <p className="text-[10px] text-stone-500">Fat</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchFood()}
              placeholder="Search foods..."
              className="input-dark pl-10"
            />
          </div>
          <button onClick={searchFood} className="btn-gold px-4 text-sm" disabled={searching}>
            {searching ? '...' : 'Go'}
          </button>
        </div>

        {/* Meal Type & Quantity */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <button
              onClick={() => setShowMealPicker(!showMealPicker)}
              className="input-dark flex items-center justify-between w-full text-sm"
            >
              <span>
                {selectedMealInfo.emoji} {selectedMealInfo.label}
              </span>
              <ChevronDown size={14} className="text-stone-500" />
            </button>
            <AnimatePresence>
              {showMealPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 right-0 mt-1 glass-elevated z-20 overflow-hidden"
                >
                  {MEAL_TYPES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setMealType(m.value);
                        setShowMealPicker(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                        mealType === m.value
                          ? 'gold-text bg-white/5'
                          : 'text-stone-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{m.emoji}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="w-24">
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
              className="input-dark text-center text-sm"
              placeholder="Qty"
            />
          </div>
        </div>

        {/* Quick Recipe Suggestions */}
        {results.length === 0 && (
          <RecipeSuggestions userId={userId} mealType={mealType} onAdd={loadTodayLog} />
        )}

        {/* Search Results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-6 space-y-2"
            >
              {results.map((food) => (
                <motion.div
                  key={food.fdcId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="glass p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-stone-100 text-sm font-medium truncate">
                        {food.description}
                        {food.name_el && (
                          <span className="text-stone-500 font-normal"> ({food.name_el})</span>
                        )}
                      </p>
                      {food.brandName && (
                        <p className="text-stone-600 text-xs">{food.brandName}</p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-stone-400">
                        <span className="gold-text font-medium">
                          {Math.round(food.calories)} kcal
                        </span>
                        <span>P: {Math.round(food.protein_g)}g</span>
                        <span>C: {Math.round(food.carbs_g)}g</span>
                        <span>F: {Math.round(food.fat_g)}g</span>
                      </div>
                    </div>
                    <button
                      onClick={() => addFood(food)}
                      disabled={adding === food.fdcId}
                      className="btn-gold px-3 py-1.5 text-xs flex items-center gap-1"
                    >
                      <Plus size={12} />
                      {adding === food.fdcId ? '...' : 'Add'}
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Today's Logged Meals */}
        {sortedMealKeys.length > 0 && (
          <div className="mt-2">
            <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Today&apos;s Log
            </h3>
            {sortedMealKeys.map((mealKey) => {
              const mealInfo = MEAL_TYPES.find((m) => m.value === mealKey);
              const entries = grouped[mealKey];
              const mealCals = entries.reduce((s, e) => s + (e.calories ?? 0), 0);

              return (
                <div key={mealKey} className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-stone-300 text-sm font-medium">
                      {mealInfo?.emoji} {mealInfo?.label ?? mealKey}
                    </span>
                    <span className="text-stone-500 text-xs">{Math.round(mealCals)} kcal</span>
                  </div>
                  <div className="space-y-1">
                    {entries.map((entry) => (
                      <motion.div
                        key={entry.id}
                        layout
                        className="glass p-3 flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-stone-200 text-sm truncate">{entry.food_name}</p>
                          <div className="flex gap-3 text-xs text-stone-500 mt-0.5">
                            <span>{entry.quantity} {entry.unit}</span>
                            <span>{Math.round(entry.calories ?? 0)} kcal</span>
                            <span>P{Math.round(entry.protein_g ?? 0)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-2 text-stone-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {todayLog.length === 0 && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-stone-500 text-sm">No meals logged today</p>
            <p className="text-stone-600 text-xs mt-1">Search for food above to start tracking</p>
          </div>
        )}
      </motion.div>

      <BottomNav />
    </div>
  );
}
