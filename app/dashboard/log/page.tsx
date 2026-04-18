'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Lock, Flame, Undo2, Star, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { FoodLogEntry, MealType } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import MealTimeline from '@/components/MealTimeline';
import MealSlotCard, { type MealSlot } from '@/components/MealSlotCard';
import DailyInsights from '@/components/DailyInsights';
import WeeklySummary from '@/components/WeeklySummary';
import MealBadges from '@/components/MealBadges';
import MealSlotConfig from '@/components/MealSlotConfig';
import DateNavigator from '@/components/DateNavigator';
import CalendarView from '@/components/CalendarView';
import WeekStrip from '@/components/WeekStrip';
import CalorieGauge from '@/components/CalorieGauge';
import MacroRadar from '@/components/MacroRadar';
import ProteinDistribution from '@/components/ProteinDistribution';
import NutrientDensity from '@/components/NutrientDensity';
import StreakFreeze from '@/components/StreakFreeze';
import MacroTrendChart from '@/components/MacroTrendChart';
import CalorieHeatmap from '@/components/CalorieHeatmap';
import EatingWindowTracker from '@/components/EatingWindowTracker';
import FoodFrequency from '@/components/FoodFrequency';
import FastingTimer from '@/components/FastingTimer';
import MacroAdherence from '@/components/MacroAdherence';
import DayPatterns from '@/components/DayPatterns';
import MonthlyReport from '@/components/MonthlyReport';
import MealPhotoGallery from '@/components/MealPhotoGallery';
import DayComparison from '@/components/DayComparison';
import AnimatedNumber from '@/components/AnimatedNumber';
import MacroFoodIdeas from '@/components/MacroFoodIdeas';
import { useTheme } from '@/components/ThemePicker';
import { localToday, localDateStr } from '../../../lib/dates';

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

function loadStoredSet(key: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    return new Set(JSON.parse(window.localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

function loadStoredMealSlots(): MealSlot[] | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const storedSlots = window.localStorage.getItem('trophe_meal_slots');
    return storedSlots ? JSON.parse(storedSlots) as MealSlot[] : null;
  } catch {
    return null;
  }
}

// F4: Macro target colors
function getTargetColor(consumed: number, target: number): string {
  if (target === 0) return 'text-stone-500';
  const pct = consumed / target;
  if (pct > 1.1) return 'text-red-400';
  if (pct >= 0.9) return 'gold-text';
  return 'text-green-400';
}

// Ring stroke color based on percentage
function getRingColor(pct: number, baseColor: string): string {
  if (pct > 1.1) return '#ef4444';   // Red — over target
  if (pct >= 0.9) return '#D4A853';  // Gold — near/at target
  return baseColor;                   // Base color — under target, keep going
}

// Health tips — context-aware, rotates hourly. 7 days × ~3 tips/day = 21+ unique tips
const HEALTH_TIPS = [
  // Protein
  '💪 Aim for 20-40g protein per meal — this maximizes muscle protein synthesis (ISSN Position Stand)',
  '🥚 Spreading protein across 4+ meals improves absorption vs loading it all at dinner',
  '🐟 Leucine-rich proteins (eggs, dairy, chicken) trigger the strongest anabolic response',
  '🥩 Your body can use ~0.4g/kg protein per meal. More than that? Still useful, just less efficient',
  '🧀 Greek yogurt has 2x the protein of regular yogurt — an easy swap for any snack',
  // Timing
  '⏰ Eating within 2 hours of waking jumpstarts your metabolism for the day',
  '🌙 Late-night eating isn\'t inherently bad — total daily calories matter more than timing',
  '☀️ A protein-rich breakfast reduces ghrelin (hunger hormone) for up to 4 hours',
  '🏋️ Post-workout protein within 2h optimizes recovery — but the "anabolic window" is wider than you think',
  // Fiber & Micronutrients
  '🥦 Only 5% of adults hit the fiber target (25-38g). Vegetables, beans, and whole grains are your best sources',
  '🫘 Beans and lentils are the only food that\'s both high-protein AND high-fiber',
  '🥬 Eating vegetables BEFORE carbs in a meal reduces blood sugar spikes by up to 35%',
  '🍎 An apple has 4.5g fiber — that\'s 15% of your daily target in one snack',
  // Hydration
  '💧 Even 2% dehydration reduces cognitive performance. Drink before you feel thirsty',
  '🫗 Water with meals aids digestion — the old "don\'t drink during meals" advice is a myth',
  // Fat
  '🥑 Healthy fats (avocado, olive oil, nuts) improve vitamin absorption from vegetables',
  '🐠 Omega-3 fatty acids reduce inflammation — aim for fatty fish 2x per week',
  // General
  '📊 People who track food consistently lose 2x more weight than those who don\'t (NIH study)',
  '🎯 Hitting 80% of your targets consistently beats hitting 100% occasionally',
  '🔥 Your BMR accounts for 60-75% of daily calories — most energy goes to just existing',
  '🧠 The gut-brain axis means what you eat directly affects mood and focus within hours',
];

function getHealthTip(
  protein: number,
  calories: number,
  targets: { calories: number; protein_g: number },
  filledCount: number,
  nextUnfilled: MealSlot | undefined
): string {
  const hour = new Date().getHours();
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

  // Context-aware tips take priority
  if (filledCount === 0 && hour < 12) {
    return '🌅 Start your day right — a protein-rich breakfast reduces cravings by up to 60%';
  }
  if (filledCount === 0 && hour >= 12) {
    return '⚡ No meals logged yet today — even a quick entry helps build the tracking habit';
  }
  if (targets.protein_g > 0 && protein < targets.protein_g * 0.3 && filledCount >= 2) {
    const remaining = Math.round(targets.protein_g - protein);
    return `💪 ${remaining}g protein to go — high-protein options: chicken (31g/150g), eggs (6g each), Greek yogurt (15g)`;
  }
  if (targets.calories > 0 && calories > targets.calories * 1.1) {
    return '📊 You\'re over your calorie target — that\'s OK occasionally. Focus on protein and fiber for the rest of the day';
  }
  if (nextUnfilled && filledCount > 0 && filledCount < 4) {
    // Only suggest meals that match the current time of day
    const mealTimeOk = (nextUnfilled.mealType === 'breakfast' && hour < 11)
      || (nextUnfilled.mealType === 'snack' && hour >= 10 && hour < 20)
      || (nextUnfilled.mealType === 'lunch' && hour >= 11 && hour < 16)
      || (nextUnfilled.mealType === 'dinner' && hour >= 17);
    if (mealTimeOk) {
      return `${nextUnfilled.emoji} Time for ${nextUnfilled.label.toLowerCase()}! Log it to keep your streak going`;
    }
  }
  if (filledCount >= 4) {
    return '🌟 Almost done! Lock your meals when finished — consistency is the #1 predictor of success';
  }

  // Rotate through general tips — changes every hour
  const tipIndex = (dayOfYear * 24 + hour) % HEALTH_TIPS.length;
  return HEALTH_TIPS[tipIndex];
}

export default function FoodLogPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [todayLog, setTodayLog] = useState<FoodLogEntry[]>([]);
  const today = localToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(() => loadStoredSet(`trophe_skipped_${today}`));
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(() => loadStoredSet(`trophe_locked_${today}`));

  // F3: Undo delete
  const [pendingDelete, setPendingDelete] = useState<{ id: string; entry: FoodLogEntry } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F4: Macro targets
  const [targets, setTargets] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  // F5: Favorites
  const [favorites, setFavorites] = useState<FavoriteFood[]>(() => loadFavorites());

  // F6: Streak
  const [streak, setStreak] = useState(0);

  // F18: Custom meal slots
  const [customSlots, setCustomSlots] = useState<MealSlot[] | null>(() => loadStoredMealSlots());
  const [showSlotConfig, setShowSlotConfig] = useState(false);

  // Date navigation
  const [showCalendar, setShowCalendar] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [compareDate, setCompareDate] = useState('');

  // Week strip data
  const [weekData, setWeekData] = useState<{ date: string; calories: number; entries: number }[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<'detailed' | 'gauge' | 'radar'>('detailed');

  // Apply theme
  useTheme();

  const isToday = selectedDate === today;
  const defaultSlots = getLocalizedSlots(t);
  const slots = customSlots || defaultSlots;

  const totalCalories = todayLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein = todayLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs = todayLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat = todayLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);
  const totalFiber = todayLog.reduce((s, f) => s + (f.fiber_g ?? 0), 0);

  const grouped = groupBySlot(todayLog, slots);
  const filledCount = slots.filter(s => grouped[s.id].length > 0 || skippedSlots.has(s.id)).length;

  // F7: Remaining budget
  const remainingCal = targets.calories - totalCalories;

  const handleDateChange = useCallback((date: string) => {
    setSelectedDate(date);
    setSkippedSlots(loadStoredSet(`trophe_skipped_${date}`));
    setLockedSlots(loadStoredSet(`trophe_locked_${date}`));
  }, []);

  const saveSkipped = (newSkipped: Set<string>) => {
    setSkippedSlots(newSkipped);
    localStorage.setItem(`trophe_skipped_${selectedDate}`, JSON.stringify([...newSkipped]));
  };

  const saveLocked = (newLocked: Set<string>) => {
    setLockedSlots(newLocked);
    localStorage.setItem(`trophe_locked_${selectedDate}`, JSON.stringify([...newLocked]));
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
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: true });

    if (data) setTodayLog(data);

    // Load week strip data
    const weekDates: string[] = [];
    const d = new Date(selectedDate + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    for (let i = 0; i < 7; i++) {
      const wd = new Date(monday);
      wd.setDate(monday.getDate() + i);
      weekDates.push(localDateStr(wd));
    }

    const { data: weekEntries } = await supabase
      .from('food_log')
      .select('logged_date, calories')
      .eq('user_id', user.id)
      .gte('logged_date', weekDates[0])
      .lte('logged_date', weekDates[6]);

    if (weekEntries) {
      const wd = weekDates.map(date => {
        const dayEntries = weekEntries.filter(e => e.logged_date === date);
        return {
          date,
          calories: dayEntries.reduce((s, e) => s + (e.calories ?? 0), 0),
          entries: dayEntries.length,
        };
      });
      setWeekData(wd);
    }

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
      .gte('logged_date', localDateStr(new Date(Date.now() - 60 * 86400000)))
      .order('logged_date', { ascending: false });

    if (recentLogs) {
      const dayCounts = new Map<string, number>();
      for (const log of recentLogs) {
        dayCounts.set(log.logged_date, (dayCounts.get(log.logged_date) || 0) + 1);
      }

      let s = 0;
      const d = new Date();
      for (let i = 0; i < 60; i++) {
        const dateStr = localDateStr(d);
        if ((dayCounts.get(dateStr) || 0) >= 3) {
          s++;
        } else if (i > 0) {
          break; // streak broken
        }
        d.setDate(d.getDate() - 1);
      }
      setStreak(s);
    }
  }, [selectedDate, router]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void loadTodayLog();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
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
      logged_date: selectedDate,
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
    const yesterdayStr = localDateStr(yesterday);

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
        logged_date: selectedDate,
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
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg-primary)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Date Navigator */}
        <DateNavigator
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          onOpenCalendar={() => setShowCalendar(true)}
        />

        {/* Week Strip */}
        {weekData.length > 0 && (
          <div className="mb-3">
            <WeekStrip
              selectedDate={selectedDate}
              onSelectDate={handleDateChange}
              weekData={weekData}
            />
          </div>
        )}

        {/* Streak Freeze */}
        <StreakFreeze streak={streak} hasLoggedToday={todayLog.length > 0} />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-100">
              {isToday ? 'Track Food' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
            </h1>
            <button
              onClick={() => setShowSlotConfig(true)}
              className="text-stone-400 hover:text-[#D4A853] text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.06] hover:border-[#D4A853]/30 transition-all"
              title="Customize meals"
            >
              <Settings size={14} />
              Customize
            </button>
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

        {/* View mode toggle */}
        <div className="flex gap-1 mb-3">
          {(['detailed', 'gauge', 'radar'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded-full text-[10px] transition-colors ${viewMode === mode ? 'bg-white/[0.1] text-stone-200' : 'text-stone-600 hover:text-stone-400'}`}
            >
              {mode === 'detailed' ? 'Macros' : mode === 'gauge' ? 'Gauge' : 'Radar'}
            </button>
          ))}
          {!isToday && todayLog.length > 0 && (
            <button
              onClick={() => { setCompareDate(today); setShowComparison(true); }}
              className="ml-auto px-2.5 py-1 rounded-full text-[10px] text-stone-600 hover:gold-text transition-colors"
            >
              Compare
            </button>
          )}
        </div>

        {/* Gauge View */}
        {viewMode === 'gauge' && targets.calories > 0 && (
          <div className="glass p-4 mb-4 flex justify-center overflow-hidden">
            <div className="max-w-[160px]">
              <CalorieGauge consumed={totalCalories} target={targets.calories} />
            </div>
          </div>
        )}

        {/* Radar View */}
        {viewMode === 'radar' && targets.calories > 0 && (
          <div className="mb-4">
            <MacroRadar
              current={{ protein: totalProtein, carbs: totalCarbs, fat: totalFat, fiber: totalFiber, water: 0 }}
              targets={{ protein: targets.protein_g, carbs: targets.carbs_g, fat: targets.fat_g, fiber: 30, water: 2800 }}
            />
          </div>
        )}

        {/* F4: Daily Macro Totals with Targets (detailed view) */}
        {viewMode === 'detailed' && (
        <div className="glass p-4 mb-4">
          <div className="grid grid-cols-5 gap-2 text-center">
            <div>
              <AnimatedNumber
                value={Math.round(totalCalories)}
                className={`text-lg font-bold ${targets.calories ? getTargetColor(totalCalories, targets.calories) : 'gold-text'}`}
              />
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

          {/* F17: Mini macro rings with labels */}
          {targets.calories > 0 && (
            <>
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
                const strokeColor = getRingColor(pct, color);
                return (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <svg width="32" height="32" className="-rotate-90">
                        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--border-default)" strokeWidth="3" />
                        <motion.circle
                          cx="16" cy="16" r={r} fill="none"
                          stroke={strokeColor}
                          strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={circ}
                          initial={{ strokeDashoffset: circ }}
                          animate={{ strokeDashoffset: offset }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </svg>
                      <span className={`text-[9px] ${pct > 1.1 ? 'text-red-400' : pct >= 0.9 ? 'gold-text' : 'text-stone-500'}`}>{Math.round(pct * 100)}%</span>
                    </div>
                    <span className="text-[8px] text-stone-600 text-center">{label}</span>
                  </div>
                );
              })}
            </div>
            {/* Sugar estimate from carbs */}
            {totalCarbs > 0 && (
              <div className="mt-2 flex items-center justify-center gap-1">
                <span className={`text-[10px] ${Math.round(totalCarbs * 0.35) > 36 ? 'text-orange-400' : 'text-stone-500'}`}>
                  Sugar est: ~{Math.round(totalCarbs * 0.35)}g / 36g limit
                </span>
                <span className="text-stone-600 text-[9px]" title="Estimated from total carbs (~35% of carbs). WHO recommends max 25-36g added sugar/day.">
                  &#9432;
                </span>
              </div>
            )}
            </>
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
        )}

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

        {/* Smart health tip — rotates hourly, 7 days of content */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 px-3 py-2 rounded-lg bg-[#D4A853]/10 border border-[#D4A853]/20"
        >
          <p className="text-xs text-[#D4A853]">
            {getHealthTip(totalProtein, totalCalories, targets, filledCount, nextUnfilled)}
          </p>
        </motion.div>

        {/* Meal Slot Cards */}
        <div className="space-y-2 mb-4">
          {userId && slots.map(slot => (
            <MealSlotCard
              key={slot.id}
              slot={slot}
              entries={grouped[slot.id] || []}
              userId={userId}
              date={selectedDate}
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

        {/* Macro Food Ideas — context-aware suggestions by what's remaining */}
        <MacroFoodIdeas
          consumed={{
            protein: todayLog.reduce((s, e) => s + (e.protein_g || 0), 0),
            carbs: todayLog.reduce((s, e) => s + (e.carbs_g || 0), 0),
            fat: todayLog.reduce((s, e) => s + (e.fat_g || 0), 0),
            fiber: todayLog.reduce((s, e) => s + (e.fiber_g || 0), 0),
          }}
          targets={{
            protein: targets.protein_g,
            carbs: targets.carbs_g,
            fat: targets.fat_g,
            fiber: 30,
          }}
        />

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

        {/* Fasting Timer */}
        {todayLog.length > 0 && isToday && (
          <div className="mt-4">
            <FastingTimer todayLog={todayLog} />
          </div>
        )}

        {/* Protein Distribution */}
        {todayLog.length >= 2 && (
          <div className="mt-4">
            <ProteinDistribution entries={todayLog} />
          </div>
        )}

        {/* Nutrient Density */}
        {todayLog.length >= 3 && (
          <div className="mt-4">
            <NutrientDensity entries={todayLog} />
          </div>
        )}

        {/* Photo Gallery */}
        {userId && (
          <div className="mt-4">
            <MealPhotoGallery userId={userId} />
          </div>
        )}

        {/* Analytics Section — only show if enough data */}
        {userId && (
          <div className="mt-6 space-y-4">
            <h2 className="text-stone-300 text-sm font-semibold px-1">Analytics</h2>

            {/* Macro Trends */}
            <MacroTrendChart userId={userId} />

            {/* Calorie Heatmap */}
            <CalorieHeatmap userId={userId} />

            {/* Food Frequency */}
            <FoodFrequency userId={userId} />

            {/* Eating Window */}
            <EatingWindowTracker todayLog={todayLog} />

            {/* Day Patterns */}
            <DayPatterns userId={userId} />

            {/* Macro Adherence */}
            {targets.calories > 0 && (
              <MacroAdherence userId={userId} targets={targets} />
            )}

            {/* Monthly Report */}
            {targets.calories > 0 && (
              <MonthlyReport userId={userId} targets={targets} />
            )}
          </div>
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

      {/* Calendar modal */}
      <AnimatePresence>
        {showCalendar && userId && (
          <CalendarView
            selectedDate={selectedDate}
            onSelectDate={(date) => { handleDateChange(date); setShowCalendar(false); }}
            onClose={() => setShowCalendar(false)}
            userId={userId}
          />
        )}
      </AnimatePresence>

      {/* Day comparison modal */}
      <AnimatePresence>
        {showComparison && userId && compareDate && (
          <DayComparison
            userId={userId}
            currentDate={selectedDate}
            currentLog={todayLog}
            compareDate={compareDate}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>

      {/* F18: Slot config modal */}
      <AnimatePresence>
        {showSlotConfig && (
          <MealSlotConfig
            slots={slots}
            onSave={(newSlots) => {
              setCustomSlots(newSlots);
              localStorage.setItem('trophe_meal_slots', JSON.stringify(newSlots));
            }}
            onClose={() => setShowSlotConfig(false)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
