'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MacroFoodIdeasProps {
  /** Current day's macro consumption */
  consumed: { protein: number; carbs: number; fat: number; fiber: number };
  /** Daily targets */
  targets: { protein: number; carbs: number; fat: number; fiber: number };
}

interface FoodIdea {
  name: string;
  emoji: string;
  amount: string;
  macroValue: number;
  unit: string;
}

const PROTEIN_IDEAS: FoodIdea[] = [
  { name: 'Greek yogurt', emoji: '🥛', amount: '200g', macroValue: 20, unit: 'g protein' },
  { name: 'Chicken breast', emoji: '🍗', amount: '150g', macroValue: 46, unit: 'g protein' },
  { name: 'Eggs (2)', emoji: '🥚', amount: '2 large', macroValue: 12, unit: 'g protein' },
  { name: 'Tuna can', emoji: '🐟', amount: '120g', macroValue: 30, unit: 'g protein' },
  { name: 'Cottage cheese', emoji: '🧀', amount: '150g', macroValue: 17, unit: 'g protein' },
  { name: 'Lentils', emoji: '🫘', amount: '200g cooked', macroValue: 18, unit: 'g protein' },
  { name: 'Whey shake', emoji: '🥤', amount: '1 scoop', macroValue: 25, unit: 'g protein' },
  { name: 'Salmon fillet', emoji: '🐠', amount: '150g', macroValue: 34, unit: 'g protein' },
];

const FIBER_IDEAS: FoodIdea[] = [
  { name: 'Oats', emoji: '🌾', amount: '50g dry', macroValue: 5, unit: 'g fiber' },
  { name: 'Chia seeds', emoji: '🌱', amount: '2 tbsp', macroValue: 10, unit: 'g fiber' },
  { name: 'Broccoli', emoji: '🥦', amount: '200g', macroValue: 5, unit: 'g fiber' },
  { name: 'Apple', emoji: '🍎', amount: '1 medium', macroValue: 4, unit: 'g fiber' },
  { name: 'Black beans', emoji: '🫘', amount: '150g cooked', macroValue: 10, unit: 'g fiber' },
  { name: 'Avocado', emoji: '🥑', amount: '½ medium', macroValue: 5, unit: 'g fiber' },
  { name: 'Sweet potato', emoji: '🍠', amount: '200g', macroValue: 6, unit: 'g fiber' },
  { name: 'Almonds', emoji: '🌰', amount: '30g', macroValue: 4, unit: 'g fiber' },
];

const FAT_IDEAS: FoodIdea[] = [
  { name: 'Olive oil', emoji: '🫒', amount: '1 tbsp', macroValue: 14, unit: 'g fat' },
  { name: 'Avocado', emoji: '🥑', amount: '½ medium', macroValue: 12, unit: 'g fat' },
  { name: 'Almonds', emoji: '🌰', amount: '30g', macroValue: 15, unit: 'g fat' },
  { name: 'Peanut butter', emoji: '🥜', amount: '2 tbsp', macroValue: 16, unit: 'g fat' },
  { name: 'Walnuts', emoji: '🌰', amount: '30g', macroValue: 20, unit: 'g fat' },
  { name: 'Salmon', emoji: '🐠', amount: '150g', macroValue: 18, unit: 'g fat' },
  { name: 'Dark chocolate', emoji: '🍫', amount: '30g (85%)', macroValue: 14, unit: 'g fat' },
  { name: 'Egg yolks (2)', emoji: '🥚', amount: '2 yolks', macroValue: 10, unit: 'g fat' },
];

const CARB_IDEAS: FoodIdea[] = [
  { name: 'Brown rice', emoji: '🍚', amount: '200g cooked', macroValue: 46, unit: 'g carbs' },
  { name: 'Banana', emoji: '🍌', amount: '1 medium', macroValue: 27, unit: 'g carbs' },
  { name: 'Oats', emoji: '🌾', amount: '50g dry', macroValue: 34, unit: 'g carbs' },
  { name: 'Sweet potato', emoji: '🍠', amount: '200g', macroValue: 40, unit: 'g carbs' },
  { name: 'Pasta', emoji: '🍝', amount: '200g cooked', macroValue: 50, unit: 'g carbs' },
  { name: 'Bread (2 slices)', emoji: '🍞', amount: '2 slices', macroValue: 26, unit: 'g carbs' },
  { name: 'Quinoa', emoji: '🌾', amount: '200g cooked', macroValue: 40, unit: 'g carbs' },
  { name: 'Honey', emoji: '🍯', amount: '1 tbsp', macroValue: 17, unit: 'g carbs' },
];

interface CategoryProps {
  title: string;
  emoji: string;
  color: string;
  remaining: number;
  unit: string;
  ideas: FoodIdea[];
}

function MacroCategory({ title, emoji, color, remaining, unit, ideas }: CategoryProps) {
  // Only show top 4 ideas that help fill the gap
  const relevant = ideas
    .filter(f => f.macroValue <= remaining * 1.2) // don't suggest more than 120% of remaining
    .slice(0, 4);

  if (remaining <= 0 || relevant.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-stone-400">
          {emoji} {title}
        </span>
        <span className={`text-[10px] ${color}`}>
          {Math.round(remaining)}{unit} left
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {relevant.map((idea) => (
          <div
            key={idea.name}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:border-white/10 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{idea.emoji}</span>
              <span className="text-xs text-stone-300 whitespace-nowrap">{idea.name}</span>
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">
              {idea.amount} · <span className={color}>{idea.macroValue}{idea.unit.split(' ')[0]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(function MacroFoodIdeas({ consumed, targets }: MacroFoodIdeasProps) {
  const [expanded, setExpanded] = useState(false);

  const remaining = {
    protein: (targets.protein || 0) - (consumed.protein || 0),
    carbs: (targets.carbs || 0) - (consumed.carbs || 0),
    fat: (targets.fat || 0) - (consumed.fat || 0),
    fiber: (targets.fiber || 0) - (consumed.fiber || 0),
  };

  // Don't show if all targets met
  const hasGaps = remaining.protein > 10 || remaining.fiber > 5 || remaining.fat > 5 || remaining.carbs > 20;
  if (!hasGaps) return null;

  return (
    <div className="glass p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <span className="text-sm font-medium text-stone-200">💡 Food Ideas</span>
        {expanded ? <ChevronUp size={14} className="text-stone-500" /> : <ChevronDown size={14} className="text-stone-500" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-3 overflow-hidden"
          >
            <MacroCategory
              title="Protein Ideas"
              emoji="🥩"
              color="text-red-400"
              remaining={remaining.protein}
              unit="g"
              ideas={PROTEIN_IDEAS}
            />
            <MacroCategory
              title="Fiber Ideas"
              emoji="🥬"
              color="text-green-400"
              remaining={remaining.fiber}
              unit="g"
              ideas={FIBER_IDEAS}
            />
            <MacroCategory
              title="Healthy Fats"
              emoji="🥑"
              color="text-purple-400"
              remaining={remaining.fat}
              unit="g"
              ideas={FAT_IDEAS}
            />
            <MacroCategory
              title="Carb Ideas"
              emoji="🍚"
              color="text-blue-400"
              remaining={remaining.carbs}
              unit="g"
              ideas={CARB_IDEAS}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
