'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { FoodLogEntry } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

interface ProteinDistributionProps {
  entries: FoodLogEntry[];
}

type MacroType = 'protein' | 'calories' | 'carbs' | 'fat';

interface MacroTab {
  key: MacroType;
  label: string;
  icon: IconName;
  color: string;
  unit: string;
  field: keyof FoodLogEntry;
}

const MACRO_TABS: MacroTab[] = [
  { key: 'protein',  label: 'Protein',   icon: 'i-dumbbell', color: '#f87171', unit: 'g',    field: 'protein_g'  },
  { key: 'calories', label: 'Calories',  icon: 'i-flame',    color: '#fb923c', unit: 'kcal', field: 'calories'   },
  { key: 'carbs',    label: 'Carbs',     icon: 'i-zap',      color: '#60a5fa', unit: 'g',    field: 'carbs_g'    },
  { key: 'fat',      label: 'Fat',       icon: 'i-drop',     color: '#c084fc', unit: 'g',    field: 'fat_g'      },
];

const MEAL_NAMES: Record<string, string> = {
  breakfast:    'Breakfast',
  lunch:        'Lunch',
  dinner:       'Dinner',
  snack:        'Snack',
  pre_workout:  'Pre-WO',
  post_workout: 'Post-WO',
};

const MEAL_COLORS: Record<string, string> = {
  breakfast:    '#f59e0b',
  lunch:        '#22c55e',
  dinner:       '#3b82f6',
  snack:        '#78716c',
  pre_workout:  '#a855f7',
  post_workout: '#ec4899',
};

export default memo(function ProteinDistribution({ entries }: ProteinDistributionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded]   = useState(false);
  const [macro, setMacro]         = useState<MacroType>('protein');

  if (entries.length < 2) return null;

  const tab = MACRO_TABS.find(tab => tab.key === macro)!;

  // Group selected macro by meal
  const byMeal = new Map<string, number>();
  for (const e of entries) {
    const mt  = e.meal_type || 'snack';
    const val = (e[tab.field] as number | null | undefined) ?? 0;
    byMeal.set(mt, (byMeal.get(mt) || 0) + val);
  }

  const meals = Array.from(byMeal.entries()).filter(([, v]) => v > 0);
  if (meals.length < 2) return null;

  const total  = meals.reduce((s, [, v]) => s + v, 0);
  const maxVal = Math.max(...meals.map(([, v]) => v));

  const fmt = (v: number) =>
    tab.unit === 'kcal' ? Math.round(v).toString() : Math.round(v).toString();

  return (
    <div className="glass p-3">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between mb-2"
      >
        <span className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          {t('analytics.nutrition_per_meal')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: tab.color }}>
            {fmt(total)}{tab.unit}
          </span>
          {expanded
            ? <ChevronUp size={13} className="text-stone-500" />
            : <ChevronDown size={13} className="text-stone-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Macro type tabs */}
            <div className="flex gap-1.5 mb-3">
              {MACRO_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setMacro(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                    macro === tab.key
                      ? 'bg-white/5 border-white/10'
                      : 'border-transparent text-stone-600 hover:text-stone-400'
                  }`}
                  style={macro === tab.key ? { color: tab.color, borderColor: `${tab.color}33` } : {}}
                >
                  <Icon name={tab.icon} size={10} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Bars */}
            <div className="space-y-2">
              {meals
                .sort(([, a], [, b]) => b - a)
                .map(([meal, val], i) => {
                  const pct   = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  const color = MEAL_COLORS[meal] || '#78716c';
                  return (
                    <div key={meal} className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-500 w-16 text-right truncate shrink-0">
                        {MEAL_NAMES[meal] || meal}
                      </span>
                      <div className="flex-1 h-2.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: i * 0.06, duration: 0.35 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      <span className="text-[10px] text-stone-400 w-12 text-right font-medium shrink-0">
                        {fmt(val)}{tab.unit}
                      </span>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
