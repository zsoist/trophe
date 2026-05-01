'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FoodLogEntry } from '@/lib/types';

interface NutrientDensityProps {
  entries: FoodLogEntry[];
}

// F58: Nutrient density score — rates foods by nutrients-per-calorie
export default function NutrientDensity({ entries }: NutrientDensityProps) {
  const [expanded, setExpanded] = useState(true);
  if (entries.length === 0) return null;

  // Calculate nutrient density: (protein + fiber) / calories × 100
  // Higher = more nutrient-dense per calorie
  const scored = entries
    .filter(e => (e.calories ?? 0) > 0)
    .map(e => {
      const cal = e.calories ?? 1;
      const protein = e.protein_g ?? 0;
      const fiber = e.fiber_g ?? 0;
      const score = ((protein * 4 + fiber * 2) / cal) * 100;
      return { name: e.food_name, score: Math.round(score * 10) / 10, calories: cal };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const avgScore = scored.reduce((s, f) => s + f.score, 0) / scored.length;
  const maxScore = scored[0].score;
  const label = avgScore >= 30 ? 'Excellent' : avgScore >= 20 ? 'Good' : avgScore >= 10 ? 'Fair' : 'Low';
  const color = avgScore >= 30 ? 'text-green-400' : avgScore >= 20 ? 'gold-text' : avgScore >= 10 ? 'text-orange-400' : 'text-red-400';

  return (
    <div className="glass p-3">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between mb-2">
        <span className="text-stone-300 text-xs font-semibold uppercase tracking-wider">Nutrient Density</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${color}`}>{label}</span>
          {expanded ? <ChevronUp size={13} className="text-stone-500" /> : <ChevronDown size={13} className="text-stone-500" />}
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
            <div className="space-y-1">
              {scored.slice(0, 5).map((food, i) => (
                <div key={`${food.name}-${i}`} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-stone-400 truncate">{food.name}</p>
                  </div>
                  <div className="w-16 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((food.score / maxScore) * 100, 100)}%` }}
                      transition={{ delay: i * 0.05 }}
                      className={`h-full rounded-full ${food.score >= 20 ? 'bg-green-400' : food.score >= 10 ? 'bg-[#D4A853]' : 'bg-orange-400'}`}
                    />
                  </div>
                  <span className="text-[9px] text-stone-500 w-8 text-right">{food.score}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
