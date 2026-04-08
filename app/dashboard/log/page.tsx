'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Lock, Unlock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { FoodLogEntry, MealType } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import MealTimeline from '@/components/MealTimeline';
import MealSlotCard, { type MealSlot } from '@/components/MealSlotCard';

// Default 5 meal slots based on Kavdas nutrition plan structure
// TODO: Make configurable per client (coach sets meal structure)
const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { id: 'breakfast', mealType: 'breakfast', label: 'Breakfast', emoji: '🌅', order: 0 },
  { id: 'snack_am', mealType: 'snack', label: 'Morning Snack', emoji: '🍎', order: 1 },
  { id: 'lunch', mealType: 'lunch', label: 'Lunch', emoji: '☀️', order: 2 },
  { id: 'snack_pm', mealType: 'snack', label: 'Afternoon Snack', emoji: '🥜', order: 3 },
  { id: 'dinner', mealType: 'dinner', label: 'Dinner', emoji: '🌙', order: 4 },
];

function getLocalizedSlots(t: (key: string) => string): MealSlot[] {
  return DEFAULT_MEAL_SLOTS.map(slot => ({
    ...slot,
    label: slot.id === 'snack_am' ? t('food.snack_am')
      : slot.id === 'snack_pm' ? t('food.snack_pm')
      : t(`food.${slot.mealType}`),
  }));
}

// Map food_log entries to meal slots
// snack entries are distributed: first snack → snack_am, second → snack_pm
function groupBySlot(entries: FoodLogEntry[], slots: MealSlot[]): Record<string, FoodLogEntry[]> {
  const result: Record<string, FoodLogEntry[]> = {};
  slots.forEach(s => { result[s.id] = []; });

  // Separate snack entries to distribute across AM/PM slots
  const snackEntries: FoodLogEntry[] = [];

  for (const entry of entries) {
    const mt = entry.meal_type || 'snack';

    if (mt === 'snack') {
      snackEntries.push(entry);
    } else if (mt === 'pre_workout' || mt === 'post_workout') {
      // Map workout snacks to PM snack slot
      result['snack_pm']?.push(entry);
    } else {
      const slotId = slots.find(s => s.mealType === mt)?.id;
      if (slotId && result[slotId]) {
        result[slotId].push(entry);
      }
    }
  }

  // Distribute snack entries: use created_at time to split AM/PM
  for (const entry of snackEntries) {
    const hour = new Date(entry.created_at).getHours();
    const slotId = hour < 14 ? 'snack_am' : 'snack_pm';
    result[slotId]?.push(entry);
  }

  return result;
}

export default function FoodLogPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [todayLog, setTodayLog] = useState<FoodLogEntry[]>([]);
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(new Set());
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split('T')[0];
  const slots = getLocalizedSlots(t);

  const totalCalories = todayLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein = todayLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs = todayLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat = todayLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);

  const grouped = groupBySlot(todayLog, slots);
  const filledCount = slots.filter(s => grouped[s.id].length > 0 || skippedSlots.has(s.id)).length;

  // Load skipped and locked slots from localStorage
  useEffect(() => {
    const storedSkipped = localStorage.getItem(`trophe_skipped_${today}`);
    if (storedSkipped) {
      try { setSkippedSlots(new Set(JSON.parse(storedSkipped))); } catch { /* ignore */ }
    }
    const storedLocked = localStorage.getItem(`trophe_locked_${today}`);
    if (storedLocked) {
      try { setLockedSlots(new Set(JSON.parse(storedLocked))); } catch { /* ignore */ }
    }
  }, [today]);

  const saveSkipped = (newSkipped: Set<string>) => {
    setSkippedSlots(newSkipped);
    localStorage.setItem(`trophe_skipped_${today}`, JSON.stringify([...newSkipped]));
  };

  const saveLocked = (newLocked: Set<string>) => {
    setLockedSlots(newLocked);
    localStorage.setItem(`trophe_locked_${today}`, JSON.stringify([...newLocked]));
  };

  const lockAll = () => {
    const filledSlotIds = slots
      .filter(s => grouped[s.id].length > 0)
      .map(s => s.id);
    saveLocked(new Set(filledSlotIds));
  };

  const unlockSlot = (slotId: string) => {
    const next = new Set(lockedSlots);
    next.delete(slotId);
    saveLocked(next);
  };

  const lockSlot = (slotId: string) => {
    const next = new Set(lockedSlots);
    next.add(slotId);
    saveLocked(next);
  };

  const allMealsLocked = slots.every(s =>
    lockedSlots.has(s.id) || skippedSlots.has(s.id) || grouped[s.id].length === 0
  );
  const hasAnyFood = todayLog.length > 0;

  const loadTodayLog = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from('food_log')
      .select('*')
      .eq('user_id', user.id)
      .eq('logged_date', today)
      .order('created_at', { ascending: true });

    if (data) setTodayLog(data);
  }, [today, router]);

  useEffect(() => {
    loadTodayLog();
  }, [loadTodayLog]);

  const [copying, setCopying] = useState(false);

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from('food_log').delete().eq('id', id);
    if (!error) setTodayLog(prev => prev.filter(e => e.id !== id));
  };

  const copyYesterday = async () => {
    if (!userId || copying) return;
    setCopying(true);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const { data: yesterdayEntries } = await supabase
      .from('food_log')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_date', yesterdayStr);

    if (!yesterdayEntries || yesterdayEntries.length === 0) {
      setCopying(false);
      return;
    }

    // Skip foods already logged today (by name + meal_type)
    const existingKeys = new Set(
      todayLog.map(e => `${e.food_name}::${e.meal_type}`)
    );

    const newEntries = yesterdayEntries
      .filter(e => !existingKeys.has(`${e.food_name}::${e.meal_type}`))
      .map(e => ({
        user_id: userId,
        logged_date: today,
        meal_type: e.meal_type,
        food_name: e.food_name,
        quantity: e.quantity,
        unit: e.unit,
        calories: e.calories,
        protein_g: e.protein_g,
        carbs_g: e.carbs_g,
        fat_g: e.fat_g,
        fiber_g: e.fiber_g,
        source: e.source,
        source_id: e.source_id,
      }));

    if (newEntries.length > 0) {
      const { error } = await supabase.from('food_log').insert(newEntries);
      if (error) {
        console.error('Copy yesterday error:', error);
        setCopying(false);
        return;
      }
      await loadTodayLog();
    }

    setCopying(false);
  };

  // Find next unfilled slot for reminder
  const nextUnfilled = slots.find(s => grouped[s.id].length === 0 && !skippedSlots.has(s.id));

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-stone-100">Track Food</h1>
          <div className="flex items-center gap-3">
            {todayLog.length === 0 && (
              <button
                onClick={copyYesterday}
                disabled={copying}
                className="text-stone-500 hover:gold-text text-xs flex items-center gap-1 transition-colors"
              >
                <Copy size={12} />
                {copying ? '...' : 'Yesterday'}
              </button>
            )}
            {hasAnyFood && !allMealsLocked && (
              <button
                onClick={lockAll}
                className="text-stone-500 hover:gold-text text-xs flex items-center gap-1 transition-colors"
              >
                <Lock size={12} />
                {t('food.lock_all')}
              </button>
            )}
            <span className="text-stone-500 text-xs">
              {t('food.meals_progress', { done: String(filledCount), total: String(slots.length) })}
            </span>
          </div>
        </div>

        {/* Day locked banner */}
        {allMealsLocked && hasAnyFood && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-between"
          >
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <Lock size={12} />
              {t('food.day_locked')}
            </p>
          </motion.div>
        )}

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

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#D4A853] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(filledCount / slots.length) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Reminder for next unfilled slot */}
        {nextUnfilled && filledCount > 0 && filledCount < slots.length && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 px-3 py-2 rounded-lg bg-[#D4A853]/10 border border-[#D4A853]/20"
          >
            <p className="text-xs text-[#D4A853]">
              {nextUnfilled.emoji} {t('food.meal_reminder', { meal: nextUnfilled.label })}
            </p>
          </motion.div>
        )}

        {/* Meal Slot Cards */}
        <div className="space-y-2 mb-4">
          {userId && slots.map(slot => (
            <MealSlotCard
              key={slot.id}
              slot={slot}
              entries={grouped[slot.id] || []}
              userId={userId}
              date={today}
              skipped={skippedSlots.has(slot.id)}
              locked={lockedSlots.has(slot.id)}
              onLogged={loadTodayLog}
              onSkip={() => {
                const next = new Set(skippedSlots);
                next.add(slot.id);
                saveSkipped(next);
              }}
              onUndoSkip={() => {
                const next = new Set(skippedSlots);
                next.delete(slot.id);
                saveSkipped(next);
              }}
              onLock={() => lockSlot(slot.id)}
              onUnlock={() => unlockSlot(slot.id)}
              onDeleteEntry={deleteEntry}
            />
          ))}
        </div>

        {/* Meal Distribution Timeline */}
        {todayLog.length > 0 && (
          <MealTimeline foodLog={todayLog} />
        )}
      </motion.div>

      <BottomNav />
    </div>
  );
}
