'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';

interface MacroFoodIdeasProps {
  /** Current day's macro consumption */
  consumed: { protein: number; carbs: number; fat: number; fiber: number };
  /** Daily targets */
  targets: { protein: number; carbs: number; fat: number; fiber: number };
}

interface FoodIdea {
  name: string;
  amount: string;
  macroValue: number;
  unit: string;
}

const PROTEIN_IDEAS: FoodIdea[] = [
  { name: 'Greek yogurt', amount: '200g', macroValue: 20, unit: 'g protein' },
  { name: 'Chicken breast', amount: '150g', macroValue: 46, unit: 'g protein' },
  { name: 'Eggs (2)', amount: '2 large', macroValue: 12, unit: 'g protein' },
  { name: 'Tuna can', amount: '120g', macroValue: 30, unit: 'g protein' },
  { name: 'Cottage cheese', amount: '150g', macroValue: 17, unit: 'g protein' },
  { name: 'Lentils', amount: '200g cooked', macroValue: 18, unit: 'g protein' },
  { name: 'Whey shake', amount: '1 scoop', macroValue: 25, unit: 'g protein' },
  { name: 'Salmon fillet', amount: '150g', macroValue: 34, unit: 'g protein' },
];

const FIBER_IDEAS: FoodIdea[] = [
  { name: 'Oats', amount: '50g dry', macroValue: 5, unit: 'g fiber' },
  { name: 'Chia seeds', amount: '2 tbsp', macroValue: 10, unit: 'g fiber' },
  { name: 'Broccoli', amount: '200g', macroValue: 5, unit: 'g fiber' },
  { name: 'Apple', amount: '1 medium', macroValue: 4, unit: 'g fiber' },
  { name: 'Black beans', amount: '150g cooked', macroValue: 10, unit: 'g fiber' },
  { name: 'Avocado', amount: '½ medium', macroValue: 5, unit: 'g fiber' },
  { name: 'Sweet potato', amount: '200g', macroValue: 6, unit: 'g fiber' },
  { name: 'Almonds', amount: '30g', macroValue: 4, unit: 'g fiber' },
];

const FAT_IDEAS: FoodIdea[] = [
  { name: 'Olive oil', amount: '1 tbsp', macroValue: 14, unit: 'g fat' },
  { name: 'Avocado', amount: '½ medium', macroValue: 12, unit: 'g fat' },
  { name: 'Almonds', amount: '30g', macroValue: 15, unit: 'g fat' },
  { name: 'Peanut butter', amount: '2 tbsp', macroValue: 16, unit: 'g fat' },
  { name: 'Walnuts', amount: '30g', macroValue: 20, unit: 'g fat' },
  { name: 'Salmon', amount: '150g', macroValue: 18, unit: 'g fat' },
  { name: 'Dark chocolate', amount: '30g (85%)', macroValue: 14, unit: 'g fat' },
  { name: 'Egg yolks (2)', amount: '2 yolks', macroValue: 10, unit: 'g fat' },
];

const CARB_IDEAS: FoodIdea[] = [
  { name: 'Brown rice', amount: '200g cooked', macroValue: 46, unit: 'g carbs' },
  { name: 'Banana', amount: '1 medium', macroValue: 27, unit: 'g carbs' },
  { name: 'Oats', amount: '50g dry', macroValue: 34, unit: 'g carbs' },
  { name: 'Sweet potato', amount: '200g', macroValue: 40, unit: 'g carbs' },
  { name: 'Pasta', amount: '200g cooked', macroValue: 50, unit: 'g carbs' },
  { name: 'Bread (2 slices)', amount: '2 slices', macroValue: 26, unit: 'g carbs' },
  { name: 'Quinoa', amount: '200g cooked', macroValue: 40, unit: 'g carbs' },
  { name: 'Honey', amount: '1 tbsp', macroValue: 17, unit: 'g carbs' },
];

interface CategoryProps {
  title: string;
  icon: IconName;
  color: string;
  remaining: number;
  unit: string;
  ideas: FoodIdea[];
}

function MacroCategory({ title, icon, color, remaining, unit, ideas }: CategoryProps) {
  // Only show top 4 ideas that help fill the gap
  const relevant = ideas
    .filter(f => f.macroValue <= remaining * 1.2) // don't suggest more than 120% of remaining
    .slice(0, 4);

  if (remaining <= 0 || relevant.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium text-stone-400 flex items-center gap-1 ${color}`}>
          <Icon name={icon} size={14} />
          {title}
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
        <span className="text-sm font-medium text-stone-200 flex items-center gap-1.5">
          <Icon name="i-sparkle" size={14} className="text-[var(--gold-300)]" />
          Food Ideas
        </span>
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
              title="Protein"
              icon="i-dumbbell"
              color="text-red-400"
              remaining={remaining.protein}
              unit="g"
              ideas={PROTEIN_IDEAS}
            />
            <MacroCategory
              title="Fiber"
              icon="i-leaf"
              color="text-green-400"
              remaining={remaining.fiber}
              unit="g"
              ideas={FIBER_IDEAS}
            />
            <MacroCategory
              title="Healthy Fats"
              icon="i-drop"
              color="text-purple-400"
              remaining={remaining.fat}
              unit="g"
              ideas={FAT_IDEAS}
            />
            <MacroCategory
              title="Carbs"
              icon="i-zap"
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
