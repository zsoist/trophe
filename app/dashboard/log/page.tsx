'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Lock, Unlock, Flame, Undo2, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { FoodLogEntry, MealType } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import MealTimeline from '@/components/MealTimeline';
import MealSlotCard, { type MealSlot } from '@/components/MealSlotCard';
import DailyInsights from '@/components/DailyInsights';
import WeeklySummary from '@/components/WeeklySummary';
import MealBadges from '@/components/MealBadges';

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

function groupBySlot(entries: FoodLogEntry[], slots: MealSlot[]): Record<string, FoodLogEntry[]> {
  const result: Record<string, FoodLogEntry[]> = {};
  slots.forEach(s => { result[s.id] = []; });

  const snackEntries: FoodLogEntry[] = [];

  for (const entry of entries) {
    const mt = entry.meal_type || 'snack';

    if (mt === 'snack') {
      snackEntries.push(entry);
    } else if (mt === 'pre_workout' || mt === 'post_workout') {
      result['snack_pm']?.push(entry);
    } else {
      const slotId = slots.find(s => s.mealType === mt)?.id;
      if (slotId && result[slotId]) {
        result[slotId].push(entry);
      }
    }
  }

  for (const entry of snackEntries) {
    const hour = new Date(entry.created_at).getHours();
    const slotId = hour < 14 ? 'snack_am' : 'snack_pm';
    result[slotId]?.push(entry);
  }

  return result;
}

// F5: Favorites
interface FavoriteFood {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

function loadFavorites(): FavoriteFood[] {
  try {
    return JSON.parse(localStorage.getItem('trophe_favorites') || '[]');
  } catch { return []; }
}

function saveFavoritesToStorage(favs: FavoriteFood[]) {
  localStorage.setItem('trophe_favorites', JSON.stringify(favs));
}

// F4: Macro target colors
function getTargetColor(consumed: number, target: number): string {
  if (target === 0) return 'text-stone-500';
  const pct = consumed / target;
  if (pct > 1.1) return 'text-red-400';
  if (pct > 0.85) return 'text-green-400';
  if (pct > 0.5) return 'gold-text';
  return 'text-stone-400';
}

export default function FoodLogPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [todayLog, setTodayLog] = useState<FoodLogEntry[]>([]);
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(new Set());
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(new Set());

  // F3: Undo delete
  const [pendingDelete, setPendingDelete] = useState<{ id: string; entry: FoodLogEntry } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F4: Macro targets
  const [targets, setTargets] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  // F5: Favorites
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);

  // F6: Streak
  const [streak, setStreak] = useState(0);

  const today = new Date().toISOString().split('T')[0];
  const slots = getLocalizedSlots(t);

  const totalCalories = todayLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein = todayLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs = todayLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat = todayLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);
  const totalFiber = todayLog.reduce((s, f) => s + (f.fiber_g ?? 0), 0);

  const grouped = groupBySlot(todayLog, slots);
  const filledCount = slots.filter(s => grouped[s.id].length > 0 || skippedSlots.has(s.id)).length;

  // F7: Remaining budget
  const remainingCal = targets.calories - totalCalories;

  // Load persisted state
  useEffect(() => {
    const storedSkipped = localStorage.getItem(`trophe_skipped_${today}`);
    if (storedSkipped) {
      try { setSkippedSlots(new Set(JSON.parse(storedSkipped))); } catch { /* ignore */ }
    }
    const storedLocked = localStorage.getItem(`trophe_locked_${today}`);
    if (storedLocked) {
      try { setLockedSlots(new Set(JSON.parse(storedLocked))); } catch { /* ignore */ }
    }
    setFavorites(loadFavorites());
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
    const filledSlotIds = slots.filter(s => grouped[s.id].length > 0).map(s => s.id);
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

    // F4: Load macro targets from client_profiles
    const { data: profile } = await supabase
      .from('client_profiles')
      .select('target_calories, target_protein_g, target_carbs_g, target_fat_g')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile) {
      setTargets({
        calories: profile.target_calories || 0,
        protein_g: profile.target_protein_g || 0,
        carbs_g: profile.target_carbs_g || 0,
        fat_g: profile.target_fat_g || 0,
      });
    }

    // F6: Calculate streak (consecutive days with >=3 food entries)
    const { data: recentLogs } = await supabase
      .from('food_log')
      .select('logged_date')
      .eq('user_id', user.id)
      .gte('logged_date', new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0])
      .order('logged_date', { ascending: false });

    if (recentLogs) {
      const dayCounts = new Map<string, number>();
      for (const log of recentLogs) {
        dayCounts.set(log.logged_date, (dayCounts.get(log.logged_date) || 0) + 1);
      }

      let s = 0;
      const d = new Date();
      for (let i = 0; i < 60; i++) {
        const dateStr = d.toISOString().split('T')[0];
        if ((dayCounts.get(dateStr) || 0) >= 3) {
          s++;
        } else if (i > 0) {
          break; // streak broken
        }
        d.setDate(d.getDate() - 1);
      }
      setStreak(s);
    }
  }, [today, router]);

  useEffect(() => {
    loadTodayLog();
  }, [loadTodayLog]);

  const [copying, setCopying] = useState(false);

  // F3: Undo delete — soft delete with 5s timeout
  const deleteEntry = (id: string) => {
    const entry = todayLog.find(e => e.id === id);
    if (!entry) return;

    // Cancel any previous pending delete
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (pendingDelete) {
      // Execute previous pending delete immediately
      supabase.from('food_log').delete().eq('id', pendingDelete.id);
    }

    // Soft-delete from UI
    setTodayLog(prev => prev.filter(e => e.id !== id));
    setPendingDelete({ id, entry });

    // Hard-delete after 5 seconds
    undoTimerRef.current = setTimeout(async () => {
      await supabase.from('food_log').delete().eq('id', id);
      setPendingDelete(null);
    }, 5000);
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setTodayLog(prev => [...prev, pendingDelete.entry].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ));
    setPendingDelete(null);
  };

  // F5: Toggle favorite
  const toggleFavorite = (entry: FoodLogEntry) => {
    const existing = favorites.findIndex(f => f.food_name === entry.food_name);
    let newFavs: FavoriteFood[];
    if (existing >= 0) {
      newFavs = favorites.filter((_, i) => i !== existing);
    } else {
      newFavs = [...favorites, {
        food_name: entry.food_name,
        calories: entry.calories ?? 0,
        protein_g: entry.protein_g ?? 0,
        carbs_g: entry.carbs_g ?? 0,
        fat_g: entry.fat_g ?? 0,
        fiber_g: entry.fiber_g ?? 0,
      }];
    }
    setFavorites(newFavs);
    saveFavoritesToStorage(newFavs);
  };

  // F5: Quick-log a favorite
  const logFavorite = async (fav: FavoriteFood, mealType: MealType) => {
    if (!userId) return;
    const entry = {
      user_id: userId,
      logged_date: today,
      meal_type: mealType,
      food_name: fav.food_name,
      quantity: 1,
      unit: 'serving',
      calories: fav.calories,
      protein_g: fav.protein_g,
      carbs_g: fav.carbs_g,
      fat_g: fav.fat_g,
      fiber_g: fav.fiber_g,
      source: 'custom' as const,
    };
    const { error } = await supabase.from('food_log').insert(entry);
    if (!error) await loadTodayLog();
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-100">Track Food</h1>
            {/* F6: Streak */}
            {streak > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20"
              >
                <Flame size={12} className="text-orange-400" />
                <span className="text-orange-400 text-xs font-bold">{streak}</span>
              </motion.div>
            )}
          </div>
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

        {/* F4: Daily Macro Totals with Targets */}
        <div className="glass p-4 mb-4">
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <p className={`text-lg font-bold ${targets.calories ? getTargetColor(totalCalories, targets.calories) : 'gold-text'}`}>
                {Math.round(totalCalories)}
              </p>
              {targets.calories > 0 && (
                <p className="text-[9px] text-stone-600">/ {targets.calories}</p>
              )}
              <p className="text-[10px] text-stone-500">kcal</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${targets.protein_g ? getTargetColor(totalProtein, targets.protein_g) : 'text-red-400'}`}>
                {Math.round(totalProtein)}g
              </p>
              {targets.protein_g > 0 && (
                <p className="text-[9px] text-stone-600">/ {targets.protein_g}g</p>
              )}
              <p className="text-[10px] text-stone-500">Protein</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${targets.carbs_g ? getTargetColor(totalCarbs, targets.carbs_g) : 'text-blue-400'}`}>
                {Math.round(totalCarbs)}g
              </p>
              {targets.carbs_g > 0 && (
                <p className="text-[9px] text-stone-600">/ {targets.carbs_g}g</p>
              )}
              <p className="text-[10px] text-stone-500">Carbs</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${targets.fat_g ? getTargetColor(totalFat, targets.fat_g) : 'text-purple-400'}`}>
                {Math.round(totalFat)}g
              </p>
              {targets.fat_g > 0 && (
                <p className="text-[9px] text-stone-600">/ {targets.fat_g}g</p>
              )}
              <p className="text-[10px] text-stone-500">Fat</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-400">{Math.round(totalFiber)}g</p>
              <p className="text-[9px] text-stone-600">/ 30g</p>
              <p className="text-[10px] text-stone-500">Fiber</p>
            </div>
          </div>

          {/* F17: Mini macro rings */}
          {targets.calories > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { label: 'Cal', consumed: totalCalories, target: targets.calories, color: '#D4A853' },
                { label: 'P', consumed: totalProtein, target: targets.protein_g, color: '#f87171' },
                { label: 'C', consumed: totalCarbs, target: targets.carbs_g, color: '#60a5fa' },
                { label: 'F', consumed: totalFat, target: targets.fat_g, color: '#a78bfa' },
              ].map(({ label, consumed, target, color }) => {
                const pct = target > 0 ? Math.min(consumed / target, 1.2) : 0;
                const r = 14;
                const circ = 2 * Math.PI * r;
                const offset = circ * (1 - Math.min(pct, 1));
                return (
                  <div key={label} className="flex items-center justify-center gap-1.5">
                    <svg width="32" height="32" className="-rotate-90">
                      <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                      <motion.circle
                        cx="16" cy="16" r={r} fill="none"
                        stroke={pct > 1 ? '#ef4444' : color}
                        strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={circ}
                        initial={{ strokeDashoffset: circ }}
                        animate={{ strokeDashoffset: offset }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </svg>
                    <span className="text-[9px] text-stone-500">{Math.round(pct * 100)}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          {!targets.calories && (
            <div className="mt-3 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#D4A853] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(filledCount / slots.length) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>

        {/* F5: Favorites chips */}
        {favorites.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star size={10} className="gold-text" />
              <span className="text-stone-500 text-[10px]">{t('food.favorites')}</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
              {favorites.slice(0, 8).map((fav) => (
                <button
                  key={fav.food_name}
                  onClick={() => {
                    const nextSlot = slots.find(s => grouped[s.id].length === 0 && !skippedSlots.has(s.id));
                    if (nextSlot) logFavorite(fav, nextSlot.mealType);
                  }}
                  className="flex-shrink-0 px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-stone-300 text-[11px] transition-colors"
                >
                  {fav.food_name} · {fav.calories}
                </button>
              ))}
            </div>
          </div>
        )}

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
              favorites={favorites}
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
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>

        {/* F11: Daily Insights */}
        {todayLog.length >= 3 && (
          <DailyInsights entries={todayLog} targets={targets} />
        )}

        {/* F25: Achievement Badges */}
        <MealBadges todayLog={todayLog} streak={streak} targets={{ protein_g: targets.protein_g }} />

        {/* F16: Weekly Summary */}
        {userId && (
          <WeeklySummary userId={userId} />
        )}

        {/* Meal Distribution Timeline */}
        {todayLog.length > 0 && (
          <MealTimeline foodLog={todayLog} />
        )}
      </motion.div>

      {/* F7: Floating remaining budget counter */}
      {targets.calories > 0 && hasAnyFood && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-20 right-4 z-40"
        >
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${
            remainingCal > 500 ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : remainingCal > 200 ? 'bg-[#D4A853]/20 gold-text border border-[#D4A853]/30'
            : remainingCal > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
          }`}>
            {remainingCal >= 0
              ? t('food.remaining', { n: String(Math.round(remainingCal)) })
              : t('food.over_budget', { n: String(Math.round(Math.abs(remainingCal))) })
            }
          </div>
        </motion.div>
      )}

      {/* F3: Undo delete toast */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 left-4 right-4 z-50 flex justify-center"
          >
            <div className="glass-elevated px-4 py-3 rounded-xl flex items-center gap-3 shadow-lg max-w-sm">
              <span className="text-stone-300 text-sm flex-1">
                {t('food.entry_deleted')}
              </span>
              <button
                onClick={undoDelete}
                className="gold-text text-sm font-semibold flex items-center gap-1"
              >
                <Undo2 size={14} />
                {t('food.undo_delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
