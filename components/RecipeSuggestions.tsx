'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MealType } from '@/lib/types';

interface Recipe {
  id: number;
  name: string;
  emoji: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
}

const RECIPES: Recipe[] = [
  {
    id: 1,
    name: '4-Egg Power Scramble',
    emoji: '🍳',
    calories: 420,
    protein_g: 48,
    carbs_g: 8,
    fat_g: 22,
    ingredients: ['4 whole eggs', '1 cup spinach', '50g feta cheese', '1 tbsp olive oil', 'Salt & pepper'],
  },
  {
    id: 2,
    name: 'High-Protein Chicken Bowl',
    emoji: '🍗',
    calories: 510,
    protein_g: 52,
    carbs_g: 42,
    fat_g: 12,
    ingredients: ['200g grilled chicken breast', '150g brown rice', '100g broccoli', '1 tbsp soy sauce', 'Sesame seeds'],
  },
  {
    id: 3,
    name: 'Post-Workout Recovery Omelet',
    emoji: '💪',
    calories: 360,
    protein_g: 42,
    carbs_g: 6,
    fat_g: 18,
    ingredients: ['4 egg whites + 2 whole eggs', '60g turkey ham', '30g mozzarella', 'Tomato', 'Herbs'],
  },
  {
    id: 4,
    name: 'Greek-Style Protein Bowl',
    emoji: '🥗',
    calories: 480,
    protein_g: 45,
    carbs_g: 30,
    fat_g: 20,
    ingredients: ['200g Greek yogurt', '150g grilled chicken', 'Cucumber & tomato', '50g quinoa', 'Tzatziki dressing'],
  },
  {
    id: 5,
    name: 'Tuna Arepa',
    emoji: '🫓',
    calories: 310,
    protein_g: 35,
    carbs_g: 28,
    fat_g: 8,
    ingredients: ['1 corn arepa', '120g canned tuna', 'Avocado slice', 'Lime juice', 'Cilantro'],
  },
  {
    id: 6,
    name: 'Ham & Cheese Power Toast',
    emoji: '🥪',
    calories: 380,
    protein_g: 28,
    carbs_g: 32,
    fat_g: 14,
    ingredients: ['2 slices whole grain bread', '80g turkey ham', '40g Swiss cheese', 'Mustard', 'Lettuce & tomato'],
  },
  {
    id: 7,
    name: 'Protein Smoothie',
    emoji: '🥤',
    calories: 450,
    protein_g: 38,
    carbs_g: 48,
    fat_g: 12,
    ingredients: ['1 scoop whey protein', '1 banana', '200ml oat milk', '2 tbsp peanut butter', 'Ice'],
  },
  {
    id: 8,
    name: 'Steak + Arepa + Avocado',
    emoji: '🥩',
    calories: 580,
    protein_g: 48,
    carbs_g: 32,
    fat_g: 28,
    ingredients: ['180g sirloin steak', '1 corn arepa', '1/2 avocado', 'Chimichurri', 'Side salad'],
  },
  {
    id: 9,
    name: 'Overnight Oats',
    emoji: '🥣',
    calories: 490,
    protein_g: 35,
    carbs_g: 52,
    fat_g: 16,
    ingredients: ['80g rolled oats', '1 scoop protein powder', '200ml almond milk', '1 tbsp chia seeds', 'Berries'],
  },
  {
    id: 10,
    name: 'Mozzarella Chicken Skillet',
    emoji: '🍳',
    calories: 440,
    protein_g: 55,
    carbs_g: 6,
    fat_g: 22,
    ingredients: ['200g chicken breast', '80g mozzarella', 'Cherry tomatoes', 'Basil', '1 tbsp olive oil'],
  },
  {
    id: 11,
    name: 'Greek Yogurt Bowl with Honey & Nuts',
    emoji: '🍯',
    calories: 320,
    protein_g: 30,
    carbs_g: 28,
    fat_g: 12,
    ingredients: ['250g Greek yogurt (0%)', '1 tbsp honey', '30g walnuts', '20g granola', 'Cinnamon'],
  },
  {
    id: 12,
    name: 'Mediterranean Quinoa Salad',
    emoji: '🥙',
    calories: 420,
    protein_g: 22,
    carbs_g: 48,
    fat_g: 16,
    ingredients: ['150g cooked quinoa', '60g chickpeas', '50g feta', 'Olives & sun-dried tomato', 'Lemon-olive oil dressing'],
  },
];

function getRandomRecipes(count: number): Recipe[] {
  const shuffled = [...RECIPES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

interface RecipeSuggestionsProps {
  userId: string | null;
  mealType: MealType;
  onAdd: () => void;
}

export default function RecipeSuggestions({ userId, mealType, onAdd }: RecipeSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Recipe[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    setSuggestions(getRandomRecipes(3));
  }, []);

  const refreshSuggestions = () => {
    setSuggestions(getRandomRecipes(3));
    setExpanded(null);
  };

  const quickAdd = async (recipe: Recipe) => {
    if (!userId) return;
    setAdding(recipe.id);

    const today = new Date().toISOString().split('T')[0];
    const entry = {
      user_id: userId,
      logged_date: today,
      meal_type: mealType,
      food_name: recipe.name,
      quantity: 1,
      unit: 'serving',
      calories: recipe.calories,
      protein_g: recipe.protein_g,
      carbs_g: recipe.carbs_g,
      fat_g: recipe.fat_g,
      source: 'custom' as const,
    };

    const { error } = await supabase.from('food_log').insert(entry);
    if (error) {
      console.error('Recipe log error:', error);
      setAdding(null);
      return;
    }
    setAdding(null);
    onAdd();
  };

  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" />
          Quick Recipes
        </h3>
        <button
          onClick={refreshSuggestions}
          className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          Shuffle
        </button>
      </div>

      <div className="space-y-2">
        {suggestions.map((recipe) => (
          <motion.div
            key={recipe.id}
            layout
            className="glass overflow-hidden"
          >
            <div className="p-3 flex items-center gap-3">
              <span className="text-xl">{recipe.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-stone-100 text-sm font-medium truncate">{recipe.name}</p>
                <div className="flex gap-3 mt-0.5 text-xs text-stone-500">
                  <span className="gold-text font-medium">{recipe.calories} kcal</span>
                  <span>P: {recipe.protein_g}g</span>
                  <span>C: {recipe.carbs_g}g</span>
                  <span>F: {recipe.fat_g}g</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpanded(expanded === recipe.id ? null : recipe.id)}
                  className="p-1.5 text-stone-600 hover:text-stone-400 transition-colors"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${expanded === recipe.id ? 'rotate-180' : ''}`}
                  />
                </button>
                <button
                  onClick={() => quickAdd(recipe)}
                  disabled={adding === recipe.id}
                  className="btn-gold px-2.5 py-1.5 text-xs flex items-center gap-1"
                >
                  <Plus size={12} />
                  {adding === recipe.id ? '...' : 'Add'}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {expanded === recipe.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-1 border-t border-white/5">
                    <p className="text-stone-500 text-[10px] uppercase tracking-wider mb-1.5">
                      Ingredients
                    </p>
                    <ul className="space-y-0.5">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className="text-stone-400 text-xs flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-stone-600" />
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
