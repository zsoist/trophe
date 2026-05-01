'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { FoodLogEntry } from '@/lib/types';

interface MealBadgesProps {
  todayLog: FoodLogEntry[];
  streak: number;
  targets: { protein_g: number };
}

interface Badge {
  id: string;
  icon: IconName;
  name: string;
  description: string;
  earned: boolean;
  progress?: string;
}

function loadEarnedBadges(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('trophe_badges') || '[]'));
  } catch { return new Set(); }
}

function saveEarnedBadge(id: string) {
  const earned = loadEarnedBadges();
  earned.add(id);
  localStorage.setItem('trophe_badges', JSON.stringify([...earned]));
}

export default function MealBadges({ todayLog, streak, targets }: MealBadgesProps) {
  const [expanded, setExpanded] = useState(false);
  const [newBadge, setNewBadge] = useState<string | null>(null);
  const [earnedSet, setEarnedSet] = useState<Set<string>>(() => loadEarnedBadges());

  const badges: Badge[] = useMemo(() => {
    const mealTypes = new Set(todayLog.map(e => e.meal_type));
    const totalProtein = todayLog.reduce((s, e) => s + (e.protein_g ?? 0), 0);
    const hasPhoto = todayLog.some(e => e.source === 'photo_ai');
    const allFive = mealTypes.size >= 5 || (
      mealTypes.has('breakfast') && mealTypes.has('lunch') && mealTypes.has('dinner')
      && todayLog.filter(e => e.meal_type === 'snack').length >= 2
    );

    return [
      {
        id: 'first_meal',
        icon: 'i-flame' as IconName,
        name: 'First Meal',
        description: 'Log your first meal',
        earned: todayLog.length > 0 || earnedSet.has('first_meal'),
      },
      {
        id: 'photo_log',
        icon: 'i-camera' as IconName,
        name: 'Photo Logger',
        description: 'Log a meal via photo',
        earned: hasPhoto || earnedSet.has('photo_log'),
      },
      {
        id: 'streak_7',
        icon: 'i-target' as IconName,
        name: '7-Day Streak',
        description: 'Log meals 7 days in a row',
        earned: streak >= 7 || earnedSet.has('streak_7'),
        progress: streak < 7 ? `${streak}/7` : undefined,
      },
      {
        id: 'protein_hit',
        icon: 'i-dumbbell' as IconName,
        name: 'Protein Champion',
        description: 'Hit protein target',
        earned: (targets.protein_g > 0 && totalProtein >= targets.protein_g) || earnedSet.has('protein_hit'),
        progress: targets.protein_g > 0 && totalProtein < targets.protein_g
          ? `${Math.round(totalProtein)}/${targets.protein_g}g`
          : undefined,
      },
      {
        id: 'all_five',
        icon: 'i-sparkle' as IconName,
        name: 'Full Day',
        description: 'Log all 5 meals in one day',
        earned: allFive || earnedSet.has('all_five'),
        progress: !allFive ? `${mealTypes.size}/5` : undefined,
      },
      {
        id: 'streak_30',
        icon: 'i-trophy' as IconName,
        name: '30-Day Legend',
        description: 'Log meals 30 days straight',
        earned: streak >= 30 || earnedSet.has('streak_30'),
        progress: streak < 30 ? `${streak}/30` : undefined,
      },
    ];
  }, [todayLog, streak, targets, earnedSet]);

  // Check for newly earned badges
  useEffect(() => {
    const newlyEarned = badges.find((badge) => badge.earned && !earnedSet.has(badge.id));
    if (!newlyEarned) return;

    const revealTimer = window.setTimeout(() => {
      saveEarnedBadge(newlyEarned.id);
      setEarnedSet((prev) => new Set([...prev, newlyEarned.id]));
      setNewBadge(newlyEarned.id);
      window.setTimeout(() => setNewBadge(null), 3000);
    }, 0);

    return () => window.clearTimeout(revealTimer);
  }, [badges, earnedSet]);

  const earnedCount = badges.filter(b => b.earned).length;
  if (earnedCount === 0 && todayLog.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-3 mb-4"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Trophy size={14} className="gold-text" />
          <span className="text-stone-300 text-xs font-medium">Achievements</span>
          <span className="text-stone-600 text-[10px]">{earnedCount}/{badges.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Mini badge row */}
          {badges.filter(b => b.earned).slice(0, 4).map(b => (
            <span key={b.id} className="text-[var(--gold-300)]"><Icon name={b.icon} size={14} /></span>
          ))}
          {expanded ? <ChevronUp size={12} className="text-stone-500 ml-1" /> : <ChevronDown size={12} className="text-stone-500 ml-1" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 grid grid-cols-3 gap-2 overflow-hidden"
          >
            {badges.map((badge) => (
              <motion.div
                key={badge.id}
                initial={newBadge === badge.id ? { scale: 0 } : {}}
                animate={newBadge === badge.id ? { scale: [0, 1.2, 1] } : {}}
                className={`text-center p-2 rounded-lg border ${
                  badge.earned
                    ? 'bg-white/[0.05] border-white/[0.1]'
                    : 'bg-white/[0.02] border-white/[0.05] opacity-40'
                }`}
              >
                <span className="block mb-0.5 flex justify-center"><Icon name={badge.icon} size={18} /></span>
                <p className="text-[10px] text-stone-300 font-medium">{badge.name}</p>
                {badge.progress && (
                  <p className="text-[9px] text-stone-500 mt-0.5">{badge.progress}</p>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
