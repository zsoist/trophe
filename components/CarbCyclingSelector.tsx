'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Lock, TrendingUp, Minus, TrendingDown } from 'lucide-react';

export type CarbCycleDay = 'high' | 'moderate' | 'low';

interface CarbCyclingAdjustments {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface CarbCyclingSelectorProps {
  enabled: boolean;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  onAdjust: (adjustments: CarbCyclingAdjustments) => void;
}

const DAY_TYPES: {
  value: CarbCycleDay;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}[] = [
  {
    value: 'high',
    label: 'High Day',
    icon: <TrendingUp size={14} />,
    description: '+30% carbs, -10% fat',
    color: '#4ade80',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    icon: <Minus size={14} />,
    description: 'Standard targets',
    color: '#D4A853',
  },
  {
    value: 'low',
    label: 'Low Day',
    icon: <TrendingDown size={14} />,
    description: '-30% carbs, +15% fat',
    color: '#60a5fa',
  },
];

function getStorageKey(): string {
  const today = new Date().toISOString().split('T')[0];
  return `trophe_carb_cycle_${today}`;
}

export default function CarbCyclingSelector({
  enabled,
  baseCalories,
  baseProtein,
  baseCarbs,
  baseFat,
  onAdjust,
}: CarbCyclingSelectorProps) {
  const [selected, setSelected] = useState<CarbCycleDay>(() => getStoredCycleDay());

  // Calculate and propagate adjustments when selection changes
  useEffect(() => {
    if (!enabled) {
      onAdjust({ calories: baseCalories, protein_g: baseProtein, carbs_g: baseCarbs, fat_g: baseFat });
      return;
    }

    let adjCarbs = baseCarbs;
    let adjFat = baseFat;

    switch (selected) {
      case 'high':
        adjCarbs = Math.round(baseCarbs * 1.3);
        adjFat = Math.round(baseFat * 0.9);
        break;
      case 'low':
        adjCarbs = Math.round(baseCarbs * 0.7);
        adjFat = Math.round(baseFat * 1.15);
        break;
      case 'moderate':
      default:
        adjCarbs = baseCarbs;
        adjFat = baseFat;
        break;
    }

    // Recalculate calories: protein stays constant
    const adjCalories = baseProtein * 4 + adjCarbs * 4 + adjFat * 9;

    onAdjust({
      calories: Math.round(adjCalories),
      protein_g: baseProtein,
      carbs_g: adjCarbs,
      fat_g: adjFat,
    });
  }, [selected, enabled, baseCalories, baseProtein, baseCarbs, baseFat, onAdjust]);

  const handleSelect = (day: CarbCycleDay) => {
    setSelected(day);
    localStorage.setItem(getStorageKey(), day);
  };

  // Locked state
  if (!enabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass p-4 mb-4 opacity-60"
      >
        <div className="flex items-center gap-2 mb-2">
          <Lock size={14} className="text-stone-500" />
          <h3 className="text-stone-500 text-xs font-semibold uppercase tracking-wider">
            Carb Cycling
          </h3>
        </div>
        <p className="text-stone-600 text-xs">
          Ask your coach to enable carb cycling for adjusted daily targets.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass p-4 mb-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Flame size={14} className="text-amber-400" />
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Carb Cycling
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DAY_TYPES.map((day) => {
          const isActive = selected === day.value;
          return (
            <button
              key={day.value}
              onClick={() => handleSelect(day.value)}
              className={`relative rounded-xl p-3 text-center transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.06] ring-1'
                  : 'bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
              style={{
                borderColor: isActive ? day.color : 'transparent',
                boxShadow: isActive ? `0 0 12px ${day.color}20` : 'none',
              }}
            >
              <div
                className="flex items-center justify-center mb-1"
                style={{ color: isActive ? day.color : '#78716c' }}
              >
                {day.icon}
              </div>
              <p
                className="text-xs font-semibold"
                style={{ color: isActive ? day.color : '#a8a29e' }}
              >
                {day.label}
              </p>
              <p className="text-[9px] text-stone-600 mt-0.5">{day.description}</p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function getStoredCycleDay(): CarbCycleDay {
  if (typeof window === 'undefined') {
    return 'moderate';
  }
  const stored = window.localStorage.getItem(getStorageKey());
  if (stored === 'high' || stored === 'moderate' || stored === 'low') {
    return stored;
  }
  return 'moderate';
}
