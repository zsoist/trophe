'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, Copy, Check, Flame, Trophy, Beef, Wheat, Droplet } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { FoodLogEntry } from '@/lib/types';

interface EndOfDaySummaryProps {
  entries: FoodLogEntry[];
  streak: number;
  targets: {
    calories: number;
    protein_g: number;
  };
}

function dayScore(
  calories: number,
  protein: number,
  targetCals: number,
  targetProtein: number
): number {
  const calRatio = targetCals > 0 ? calories / targetCals : 0;
  const proRatio = targetProtein > 0 ? protein / targetProtein : 0;
  const calScore = calRatio >= 0.9 && calRatio <= 1.1 ? 100 : Math.max(0, 100 - Math.abs(1 - calRatio) * 120);
  const proScore = proRatio >= 0.9 ? Math.min(100, proRatio * 100) : proRatio * 100;
  return Math.round((calScore * 0.5 + proScore * 0.5));
}

function scoreIcon(score: number): IconName {
  if (score >= 90) return 'i-trophy';
  if (score >= 75) return 'i-dumbbell';
  if (score >= 60) return 'i-check';
  if (score >= 40) return 'i-pulse';
  return 'i-graph-up';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent!';
  if (score >= 75) return 'Great job!';
  if (score >= 60) return 'Solid day';
  if (score >= 40) return 'Room to improve';
  return 'Keep going';
}

export default function EndOfDaySummary({
  entries,
  streak,
  targets,
}: EndOfDaySummaryProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const summary = useMemo(() => {
    const totalCalories = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
    const totalProtein = entries.reduce((s, e) => s + (e.protein_g ?? 0), 0);
    const totalCarbs = entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0);
    const totalFat = entries.reduce((s, e) => s + (e.fat_g ?? 0), 0);
    const totalFiber = entries.reduce((s, e) => s + (e.fiber_g ?? 0), 0);

    const mealCount = new Set(entries.map((e) => e.meal_type)).size;
    const score = dayScore(totalCalories, totalProtein, targets.calories, targets.protein_g);

    return { totalCalories, totalProtein, totalCarbs, totalFat, totalFiber, mealCount, score };
  }, [entries, targets]);

  const summaryText = useMemo(() => {
    const lines = [
      `Trophe Daily Summary`,
      ``,
      `${Math.round(summary.totalCalories)} kcal`,
      `${Math.round(summary.totalProtein)}g protein`,
      `${Math.round(summary.totalCarbs)}g carbs`,
      `${Math.round(summary.totalFat)}g fat`,
      `${Math.round(summary.totalFiber)}g fiber`,
      ``,
      `Score: ${summary.score}/100`,
      `${summary.mealCount} meals`,
      streak > 1 ? `${streak} day streak!` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }, [summary, streak]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = summaryText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: summaryText });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // User cancelled
      }
    }
  };

  if (entries.length === 0) return null;

  const score = summary.score;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="relative overflow-hidden rounded-2xl border border-[#D4A853]/20 mb-4"
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(28,25,23,0.95) 0%, rgba(41,37,36,0.9) 50%, rgba(28,25,23,0.95) 100%)',
        }}
      />

      {/* Gold shimmer accent */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: 'radial-gradient(ellipse at 20% 20%, rgba(212,168,83,0.4) 0%, transparent 60%)',
        }}
      />

      <div className="relative p-5">
        {/* Header */}
        <div className="text-center mb-4">
          <motion.p
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, delay: 0.3 }}
            className="text-3xl mb-1 flex justify-center text-[#D4A853]"
          >
            <Icon name={scoreIcon(score)} size={32} />
          </motion.p>
          <p className="text-stone-200 text-sm font-semibold">{scoreLabel(score)}</p>
          <p className="text-stone-500 text-xs">Daily Summary</p>
        </div>

        {/* Macro grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <MacroCell
            icon={<Flame size={12} className="text-orange-400" />}
            label="Calories"
            value={`${Math.round(summary.totalCalories)}`}
            unit="kcal"
            target={targets.calories}
            actual={summary.totalCalories}
          />
          <MacroCell
            icon={<Beef size={12} className="text-red-400" />}
            label="Protein"
            value={`${Math.round(summary.totalProtein)}`}
            unit="g"
            target={targets.protein_g}
            actual={summary.totalProtein}
          />
          <MacroCell
            icon={<Wheat size={12} className="text-blue-400" />}
            label="Carbs"
            value={`${Math.round(summary.totalCarbs)}`}
            unit="g"
          />
          <MacroCell
            icon={<Droplet size={12} className="text-purple-400" />}
            label="Fat"
            value={`${Math.round(summary.totalFat)}`}
            unit="g"
          />
        </div>

        {/* Score + streak row */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center">
            <p className="text-[#D4A853] text-2xl font-black">{score}</p>
            <p className="text-stone-500 text-[10px] uppercase tracking-wider">Score</p>
          </div>
          {streak > 0 && (
            <div className="text-center">
              <div className="flex items-center gap-1">
                <Trophy size={14} className="text-[#D4A853]" />
                <p className="text-[#D4A853] text-2xl font-black">{streak}</p>
              </div>
              <p className="text-stone-500 text-[10px] uppercase tracking-wider">Day Streak</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all border ${
              copied
                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                : 'glass-elevated border-white/5 text-stone-300 hover:border-[#D4A853]/30 hover:text-[#D4A853]'
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleShare}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                shared
                  ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853] hover:bg-[#D4A853]/25'
              }`}
            >
              {shared ? <Check size={14} /> : <Share2 size={14} />}
              {shared ? 'Shared!' : 'Share'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MacroCell({
  icon,
  label,
  value,
  unit,
  target,
  actual,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  target?: number;
  actual?: number;
}) {
  const onTarget = target && actual ? actual / target >= 0.85 && actual / target <= 1.15 : false;

  return (
    <div className="glass-elevated p-3 rounded-xl">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <span className="text-stone-500 text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-stone-200 text-lg font-bold leading-tight">
        {value}
        <span className="text-stone-500 text-xs font-normal ml-0.5">{unit}</span>
      </p>
      {target !== undefined && (
        <p className={`text-[10px] mt-0.5 ${onTarget ? 'text-green-400' : 'text-stone-500'}`}>
          {onTarget ? 'On target' : `/ ${target}${unit}`}
        </p>
      )}
    </div>
  );
}
