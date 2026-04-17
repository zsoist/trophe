'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Minus, Plus, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { ParsedFoodItem } from '@/app/api/food/parse/route';

interface ParsedFoodListProps {
  items: ParsedFoodItem[];
  onConfirm: (items: ParsedFoodItem[]) => void;
  onCancel: () => void;
  logging: boolean;
}

function recalcMacros(item: ParsedFoodItem, newGrams: number): ParsedFoodItem {
  const ratio = item.grams > 0 ? newGrams / item.grams : 1;
  return {
    ...item,
    grams: newGrams,
    calories: Math.round(item.calories * ratio),
    protein_g: Math.round(item.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(item.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(item.fat_g * ratio * 10) / 10,
    fiber_g: Math.round(item.fiber_g * ratio * 10) / 10,
    sugar_g: Math.round((item.sugar_g ?? 0) * ratio * 10) / 10,
  };
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 0.8
    ? 'bg-green-500'
    : confidence >= 0.5
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

// Check if a meal has imbalanced macros
function getMacroWarning(items: ParsedFoodItem[]): string | null {
  const totalCal = items.reduce((s, i) => s + i.calories, 0);
  if (totalCal === 0) return null;

  const proteinCal = items.reduce((s, i) => s + i.protein_g * 4, 0);
  const carbsCal = items.reduce((s, i) => s + i.carbs_g * 4, 0);
  const proteinPct = (proteinCal / totalCal) * 100;
  const carbsPct = (carbsCal / totalCal) * 100;

  if (proteinPct < 10) return 'Low protein — consider adding eggs, chicken, or yogurt';
  if (carbsPct > 75) return 'Very carb-heavy — consider balancing with protein or fat';
  return null;
}

export default function ParsedFoodList({ items: initialItems, onConfirm, onCancel, logging }: ParsedFoodListProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<ParsedFoodItem[]>(initialItems);

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateGrams = (index: number, delta: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newGrams = Math.max(5, item.grams + delta);
      return recalcMacros(item, newGrams);
    }));
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
        className="space-y-2 pb-44"
      >
        {/* Item count header */}
        <div className="flex items-center justify-between px-1">
          <span className="text-stone-400 text-xs">
            {t('food.items_found', { n: String(items.length) })}
          </span>
          <button
            onClick={onCancel}
            className="text-stone-600 hover:text-stone-300 text-xs transition-colors"
          >
            {t('general.cancel')}
          </button>
        </div>

        <AnimatePresence>
          {items.map((item, index) => (
            <motion.div
              key={`${item.food_name}-${index}`}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10, height: 0 }}
              className="glass p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ConfidenceDot confidence={item.confidence} />
                    <p className="text-stone-100 text-sm font-medium truncate">
                      {item.name_localized || item.food_name}
                    </p>
                  </div>
                  {item.name_localized && item.name_localized !== item.food_name && (
                    <p className="text-stone-500 text-xs mt-0.5">{item.food_name}</p>
                  )}
                </div>
                <button
                  onClick={() => removeItem(index)}
                  className="p-1.5 text-stone-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Grams adjuster */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => updateGrams(index, -25)}
                  className="p-1 glass text-stone-400 hover:text-stone-200 transition-colors"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  value={item.grams}
                  onChange={(e) => setGrams(index, parseInt(e.target.value) || 1)}
                  className="input-dark text-center text-xs w-16 py-1"
                  min={1}
                />
                <span className="text-stone-500 text-xs">g</span>
                <button
                  onClick={() => updateGrams(index, 25)}
                  className="p-1 glass text-stone-400 hover:text-stone-200 transition-colors"
                >
                  <Plus size={12} />
                </button>
                <span className="text-stone-600 text-xs ml-auto">
                  {item.quantity} {item.unit}
                </span>
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
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Nutritional warning */}
        {warning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
          >
            <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-400/80 text-xs">{warning}</p>
          </motion.div>
        )}
      </motion.div>

      {/* F1: Sticky Save Bar — always visible at bottom */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-16 left-0 right-0 z-50 px-4"
      >
        <div className="max-w-md mx-auto glass-elevated p-4 rounded-2xl border border-[#D4A853]/20 shadow-[0_-4px_24px_rgba(212,168,83,0.15)]">
          {/* Macro summary row */}
          <div className="grid grid-cols-5 gap-1 text-center mb-3">
            <div>
              <p className="text-sm font-bold gold-text">{Math.round(totalCalories)}</p>
              <p className="text-[9px] text-stone-500">kcal</p>
            </div>
            <div>
              <p className="text-sm font-bold text-red-400">{Math.round(totalProtein)}g</p>
              <p className="text-[9px] text-stone-500">Protein</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-400">{Math.round(totalCarbs)}g</p>
              <p className="text-[9px] text-stone-500">Carbs</p>
            </div>
            <div>
              <p className="text-sm font-bold text-purple-400">{Math.round(totalFat)}g</p>
              <p className="text-[9px] text-stone-500">Fat</p>
            </div>
            <div>
              <p className="text-sm font-bold text-green-400">{Math.round(totalFiber)}g</p>
              <p className="text-[9px] text-stone-500">Fiber</p>
            </div>
          </div>

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
