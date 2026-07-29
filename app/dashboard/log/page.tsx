'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion';
import { Undo2, Star, ChefHat, Zap } from 'lucide-react';
import { Icon, AnimatedValue, Stagger, StaggerItem } from '@/components/ui';
import { MACRO_COLORS } from '@/lib/macro-colors';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useClientNav } from '@/lib/useClientNav';
import type { FoodLogEntry, MealType } from '@/lib/types';
import { BotNav } from '@/components/ui/BotNav';
import MealSlotCard, { type MealSlot } from '@/components/meals/MealSlotCard';
import DailyInsights from '@/components/summary/DailyInsights';
import MealBadges from '@/components/food/MealBadges';
import MealSlotConfig from '@/components/meals/MealSlotConfig';
import CalendarView from '@/components/shared/CalendarView';
import ProteinDistribution from '@/components/charts/ProteinDistribution';
import NutrientDensity from '@/components/health/NutrientDensity';
import MacroTrendChart from '@/components/charts/MacroTrendChart';
import CalorieHeatmap from '@/components/charts/CalorieHeatmap';
import FoodFrequency from '@/components/food/FoodFrequency';
import FastingTimer from '@/components/habits/FastingTimer';
import DayPatterns from '@/components/charts/DayPatterns';
import MonthlyReport from '@/components/summary/MonthlyReport';
import MealPhotoGallery from '@/components/meals/MealPhotoGallery';
import DayComparison from '@/components/progress/DayComparison';
import CoachFoodRecs from '@/components/food/CoachFoodRecs';
import RecipeAnalyzerModal from '@/components/food/RecipeAnalyzerModal';
import { useTheme } from '@/components/shared/ThemePicker';
import { localToday, localDateStr } from '../../../lib/utils/dates';
import {
  CLIENT_VIEW_PANELS,
  isPanelVisible,
  parseClientViewPrefs,
  type ClientViewPanelId,
} from '@/lib/display-prefs';

const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { id: 'breakfast', mealType: 'breakfast', label: 'Breakfast', icon: 'i-sun', order: 0 },
  { id: 'snack_am', mealType: 'snack', label: 'Morning Snack', icon: 'i-apple', order: 1 },
  { id: 'lunch', mealType: 'lunch', label: 'Lunch', icon: 'i-bowl', order: 2 },
  { id: 'snack_pm', mealType: 'snack', label: 'Afternoon Snack', icon: 'i-leaf', order: 3 },
  { id: 'dinner', mealType: 'dinner', label: 'Dinner', icon: 'i-moon', order: 4 },
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
  sugar_g: number;
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

// Health tips keyed for i18n — used by getHealthTip()
const HEALTH_TIP_KEYS = [
  'tip.protein_1','tip.protein_2','tip.protein_3','tip.protein_4','tip.protein_5',
  'tip.timing_1','tip.timing_2','tip.timing_3','tip.timing_4',
  'tip.fiber_1','tip.fiber_2','tip.fiber_3','tip.fiber_4',
  'tip.hydration_1','tip.hydration_2',
  'tip.fat_1','tip.fat_2',
  'tip.general_1','tip.general_2','tip.general_3','tip.general_4',
] as const;

function getHealthTip(
  t: (key: string, params?: Record<string, string | number>) => string,
  protein: number,
  calories: number,
  targets: { calories: number; protein_g: number },
  filledCount: number,
  _nextUnfilled: MealSlot | undefined,
  showCalories: boolean
): string {
  const hour = new Date().getHours();
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

  if (filledCount === 0 && hour < 12)  return t('tip.start_day');
  if (filledCount === 0 && hour >= 12) return t('tip.no_meals_yet');
  if (targets.protein_g > 0 && protein < targets.protein_g * 0.3 && filledCount >= 2) {
    return t('tip.protein_to_go', { n: Math.round(targets.protein_g - protein) });
  }
  // Calorie-target phrasing only when the coach shows calories to this client.
  if (showCalories && targets.calories > 0 && calories > targets.calories * 1.1) return t('tip.over_calories');
  if (filledCount >= 4) return t('tip.almost_done');

  const tipIndex = (dayOfYear * 24 + hour) % HEALTH_TIP_KEYS.length;
  return t(HEALTH_TIP_KEYS[tipIndex]);
}

// ─── Premium section divider ────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'var(--t4)',
        letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.06)' }} />
    </div>
  );
}

// ─── "Day sealed" banner — gold check draw + border glow, once per day ─────
function SealedBanner({ date, label }: { date: string; label: string }) {
  const reducedMotion = useReducedMotion();
  // localStorage gate (same pattern as trophe_mastery_*): animate only the
  // first time a given day gets fully sealed. Read once on mount (the parent
  // keys this component by date), mark as seen from the effect.
  const [firstSeal] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.localStorage.getItem(`trophe_sealed_${date}`);
  });
  const play = firstSeal && !reducedMotion;

  useEffect(() => {
    localStorage.setItem(`trophe_sealed_${date}`, 'seen');
  }, [date]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
      className="mb-3 px-3 py-2 rounded-lg"
      style={{
        position: 'relative',
        background: 'rgba(212,168,83,.07)',
        border: '1px solid rgba(212,168,83,.3)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {/* One-shot gold border glow (opacity only) */}
      {play && (
        <motion.span
          aria-hidden
          style={{
            position: 'absolute', inset: -1, borderRadius: 8, pointerEvents: 'none',
            border: '1px solid rgba(212,168,83,.8)',
            boxShadow: '0 0 20px rgba(212,168,83,.4)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.35, 1], type: 'tween', ease: 'easeInOut' }}
        />
      )}
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
        <motion.path
          key={play ? 'draw' : 'static'}
          d="M3 8.5 L6.5 12 L13 4.5"
          fill="none"
          stroke="var(--gold-300,#D4A853)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={play ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        />
      </svg>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-300,#D4A853)' }}>{label}</p>
    </motion.div>
  );
}

// ─── W6: protein-goal seal inside the day pill — SVG check pathLength draw +
// gold border glow + vibrate([10,30,10]), once per day (trophe_protein_sealed_*,
// same gate pattern as trophe_sealed_*). SealedBanner vocabulary at pill scale.
function ProteinSealCheck({ date }: { date: string }) {
  const reducedMotion = useReducedMotion();
  const [firstSeal] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.localStorage.getItem(`trophe_protein_sealed_${date}`);
  });
  const play = firstSeal && !reducedMotion;

  useEffect(() => {
    localStorage.setItem(`trophe_protein_sealed_${date}`, 'seen');
    // Vibrate only if the user has interacted this session — the seal can
    // appear on page LOAD (target already met), and vibrate() without a user
    // gesture is blocked by the browser with a console warning.
    if (firstSeal && typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive) {
      navigator.vibrate?.([10, 30, 10]);
    }
  }, [date, firstSeal]);

  return (
    <>
      {/* One-shot gold border glow over the whole pill (opacity only) */}
      {play && (
        <motion.span
          aria-hidden
          style={{
            position: 'absolute', inset: -1, borderRadius: 999, pointerEvents: 'none',
            border: '1px solid rgba(212,168,83,.8)',
            boxShadow: '0 0 20px rgba(212,168,83,.4)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.4, times: [0, 0.35, 1], type: 'tween', ease: 'easeInOut' }}
        />
      )}
      <svg width={12} height={12} viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0 }}>
        <motion.path
          key={play ? 'draw' : 'static'}
          d="M3 8.5 L6.5 12 L13 4.5"
          fill="none"
          stroke="var(--gold-300,#D4A853)"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={play ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
        />
      </svg>
    </>
  );
}

export default function FoodLogPage() {
  const { t } = useI18n();
  const clientNav = useClientNav();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadRequestRef = useRef(0);
  const [todayLog, setTodayLog] = useState<FoodLogEntry[]>([]);
  const today = localToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [skippedSlots, setSkippedSlots] = useState<Set<string>>(() => loadStoredSet(`trophe_skipped_${today}`));
  const [lockedSlots, setLockedSlots] = useState<Set<string>>(() => loadStoredSet(`trophe_locked_${today}`));

  // F3: Undo delete
  const [pendingDelete, setPendingDelete] = useState<{ id: string; entry: FoodLogEntry } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch undo — a multi-item AI log hands its inserted ids up; one tap deletes them all.
  const [pendingBatch, setPendingBatch] = useState<{ ids: string[]; key: number } | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // W3: macro impact ribbons — floating deltas when totals change after a
  // log/edit/delete refetch, plus a one-shot protein-cell pop for protein-heavy logs.
  const reducedMotion = useReducedMotion();
  const [ribbons, setRibbons] = useState<Array<{ id: number; macro: 'calories' | 'protein' | 'carbs' | 'fat' | 'sugar'; delta: number }>>([]);
  const ribbonIdRef = useRef(0);
  const prevTotalsRef = useRef<{ date: string; calories: number; protein: number; carbs: number; fat: number; sugar: number } | null>(null);
  const proteinPopControls = useAnimationControls();
  const [proteinGlowTick, setProteinGlowTick] = useState(0);

  // W6: narrative day pill — expands ~2.5s with the protein delta after a totals change
  const [pillDelta, setPillDelta] = useState<{ value: number; key: number } | null>(null);
  const pillDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // W13: one-shot gold flash on the slot whose entry an undo just restored
  const [slotFlash, setSlotFlash] = useState<{ slotId: string; key: number } | null>(null);
  const slotFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // W8: streak ember — ignites once/day when TODAY's entry count crosses ≥3
  const [emberIgnite, setEmberIgnite] = useState<{ key: number } | null>(null);
  const emberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEntryCountRef = useRef<{ date: string; count: number } | null>(null);

  // F4: Macro targets
  const [targets, setTargets] = useState({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  // Coach-controlled client view prefs (client_profiles.client_view_prefs, migration 0050)
  const [viewPrefs, setViewPrefs] = useState<Partial<Record<ClientViewPanelId, boolean>>>({});
  const showCalories       = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'showCalories');
  const showLogAnalytics   = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'logAnalytics');
  const showNutritionIntel = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'nutritionIntel');

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
  const [compareDate] = useState('');

  // Week strip data
  const [weekData, setWeekData] = useState<{ date: string; calories: number; entries: number }[]>([]);

  // Apply theme
  useTheme();

  const isToday = selectedDate === today;
  const defaultSlots = getLocalizedSlots(t);
  const slots = customSlots || defaultSlots;

  const totalCalories = todayLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein = todayLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs = todayLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat = todayLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);
  const totalSugar = todayLog.reduce((s, f) => s + (f.sugar_g ?? 0), 0);

  const grouped = groupBySlot(todayLog, slots);
  const filledCount = slots.filter(s => grouped[s.id].length > 0 || skippedSlots.has(s.id)).length;

  // F7: Remaining budget
  const remainingCal = targets.calories - totalCalories;

  // W3: diff totals against the previous render's totals (same day only) and
  // float mono deltas off the affected macro summary cells. Protein-heavy logs
  // (protein kcal >40% of the just-logged kcal) additionally pop the protein cell.
  useEffect(() => {
    if (pageLoading) return;
    const totals = {
      date: selectedDate,
      calories: totalCalories, protein: totalProtein,
      carbs: totalCarbs, fat: totalFat, sugar: totalSugar,
    };
    const prev = prevTotalsRef.current;
    prevTotalsRef.current = totals;
    // First load or date navigation — reset the baseline silently.
    if (!prev || prev.date !== selectedDate) return;

    const changes: Array<{ macro: 'calories' | 'protein' | 'carbs' | 'fat' | 'sugar'; delta: number }> = [];
    if (showCalories) {
      const d = Math.round(totals.calories - prev.calories);
      if (d !== 0) changes.push({ macro: 'calories', delta: d });
    }
    (['protein', 'carbs', 'fat', 'sugar'] as const).forEach(m => {
      const d = Math.round(totals[m] - prev[m]);
      if (d !== 0) changes.push({ macro: m, delta: d });
    });
    if (changes.length === 0) return;

    // W6: protein delta expands the narrative day pill for ~2.5s, then it contracts.
    const dPill = Math.round(totals.protein - prev.protein);
    if (dPill !== 0 && targets.protein_g > 0) {
      if (pillDeltaTimerRef.current) clearTimeout(pillDeltaTimerRef.current);
      setPillDelta({ value: dPill, key: Date.now() });
      pillDeltaTimerRef.current = setTimeout(() => setPillDelta(null), 2500);
    }

    const spawned = changes.map(c => ({ id: ++ribbonIdRef.current, ...c }));
    setRibbons(cur => [...cur, ...spawned].slice(-5)); // ≤5 concurrent
    const ids = new Set(spawned.map(s => s.id));
    window.setTimeout(() => setRibbons(cur => cur.filter(r => !ids.has(r.id))), 760);

    const dP = totals.protein - prev.protein;
    const dCal = totals.calories - prev.calories;
    if (!reducedMotion && dP > 0 && dCal > 0 && (dP * 4) / dCal > 0.4) {
      void proteinPopControls.start({
        scale: [1, 1.18, 1],
        transition: { duration: 0.5, ease: 'easeOut' },
      });
      setProteinGlowTick(tk => tk + 1);
    }
  }, [pageLoading, selectedDate, totalCalories, totalProtein, totalCarbs, totalFat, totalSugar, showCalories, reducedMotion, proteinPopControls, targets.protein_g]);

  const handleDateChange = useCallback((date: string) => {
    loadRequestRef.current += 1;
    setPageLoading(true);
    setLoadError(false);
    setSelectedDate(date);
    setSkippedSlots(loadStoredSet(`trophe_skipped_${date}`));
    setLockedSlots(loadStoredSet(`trophe_locked_${date}`));
    // W6: a lingering delta expansion belongs to the previous day's story
    if (pillDeltaTimerRef.current) clearTimeout(pillDeltaTimerRef.current);
    setPillDelta(null);
  }, []);

  const saveSkipped = (newSkipped: Set<string>) => {
    setSkippedSlots(newSkipped);
    localStorage.setItem(`trophe_skipped_${selectedDate}`, JSON.stringify([...newSkipped]));
  };

  const saveLocked = (newLocked: Set<string>) => {
    setLockedSlots(newLocked);
    localStorage.setItem(`trophe_locked_${selectedDate}`, JSON.stringify([...newLocked]));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // W6 narrative day-pill visibility (replaces the F7 kcal-only pill) — also
  // used to lift the undo toasts so they never overlap the pill.
  const proteinPillActive = targets.protein_g > 0 && hasAnyFood;
  const kcalPillActive = showCalories && targets.calories > 0 && hasAnyFood;
  const dayPillVisible = proteinPillActive || kcalPillActive;
  const proteinDone = targets.protein_g > 0 && totalProtein >= targets.protein_g;

  const loadTodayLog = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoadError(false);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (requestId !== loadRequestRef.current) return;
      if (authError) {
        setLoadError(true);
        setPageLoading(false);
        return;
      }
      if (!user) {
        router.push('/login');
        return;
      }

      // Compute week date range upfront for parallel queries
      const weekDates: string[] = [];
      const wd = new Date(selectedDate + 'T12:00:00');
      const dayOfWeek = wd.getDay();
      const monday = new Date(wd);
      monday.setDate(wd.getDate() - ((dayOfWeek + 6) % 7));
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDates.push(localDateStr(d));
      }

      // Parallel: all 4 queries fire simultaneously (~200ms vs ~800ms sequential)
      const [todayRes, weekRes, profileRes, streakRes] = await Promise.all([
        supabase.from('food_log').select('*')
          .eq('user_id', user.id).eq('logged_date', selectedDate)
          .order('created_at', { ascending: true }),
        supabase.from('food_log').select('logged_date, calories')
          .eq('user_id', user.id)
          .gte('logged_date', weekDates[0]).lte('logged_date', weekDates[6]),
        supabase.from('client_profiles')
          .select('target_calories, target_protein_g, target_carbs_g, target_fat_g, client_view_prefs')
          .eq('user_id', user.id).maybeSingle(),
        supabase.from('food_log').select('logged_date')
          .eq('user_id', user.id)
          .gte('logged_date', localDateStr(new Date(Date.now() - 60 * 86400000)))
          .order('logged_date', { ascending: false }),
      ]);

      if (requestId !== loadRequestRef.current) return;
      const loadFailure = [
        todayRes.error,
        weekRes.error,
        profileRes.error,
        streakRes.error,
      ].find(Boolean);
      if (loadFailure ||
        !todayRes.data ||
        !weekRes.data ||
        !streakRes.data
      ) {
        setLoadError(true);
        setPageLoading(false);
        return;
      }
      if (!profileRes.data) {
        router.replace('/onboarding');
        return;
      }

      setUserId(user.id);
      setTodayLog(todayRes.data);
      setWeekData(weekDates.map(date => {
        const dayEntries = weekRes.data.filter(e => e.logged_date === date);
        return {
          date,
          calories: dayEntries.reduce((s, e) => s + (e.calories ?? 0), 0),
          entries: dayEntries.length,
        };
      }));

      // F4: Load macro targets from client_profiles
      setTargets({
        calories: profileRes.data.target_calories || 0,
        protein_g: profileRes.data.target_protein_g || 0,
        carbs_g: profileRes.data.target_carbs_g || 0,
        fat_g: profileRes.data.target_fat_g || 0,
      });
      setViewPrefs(parseClientViewPrefs(profileRes.data.client_view_prefs));

      // F6: Calculate streak (consecutive days with >=3 food entries)
      const dayCounts = new Map<string, number>();
      for (const log of streakRes.data) {
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
      setPageLoading(false);
    } catch {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(true);
      setPageLoading(false);
    }
  }, [selectedDate, router]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void loadTodayLog();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [loadTodayLog]);

  const [copying, setCopying] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);

  // F3: Undo delete — soft delete with 5s timeout
  const deleteEntry = (id: string) => {
    const entry = todayLog.find(e => e.id === id);
    if (!entry) return;

    // Cancel any previous pending delete
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (pendingDelete) {
      // Flush the previous pending delete NOW. supabase-js query builders are
      // lazy thenables — a bare expression never sends the request, so the row
      // stayed in the DB and reappeared (with its calories) on the next refetch.
      void supabase.from('food_log').delete().eq('id', pendingDelete.id)
        .then(({ error }) => { if (error) console.error('food_log delete failed:', error.message); });
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

  // W13: which slot card renders this entry — mirrors groupBySlot's routing.
  const slotIdForEntry = (entry: FoodLogEntry): string | null => {
    const mt = entry.meal_type || 'snack';
    let slotId: string | undefined;
    if (mt === 'snack') {
      slotId = new Date(entry.created_at).getHours() < 14 ? 'snack_am' : 'snack_pm';
    } else if (mt === 'pre_workout' || mt === 'post_workout') {
      slotId = 'snack_pm';
    } else {
      slotId = slots.find(s => s.mealType === mt)?.id;
    }
    return slotId && slots.some(s => s.id === slotId) ? slotId : null;
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setTodayLog(prev => [...prev, pendingDelete.entry].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ));
    // W13: flash the restored entry's slot card gold once (flywheel-editor vocabulary)
    const slotId = slotIdForEntry(pendingDelete.entry);
    if (slotId) {
      if (slotFlashTimerRef.current) clearTimeout(slotFlashTimerRef.current);
      setSlotFlash({ slotId, key: Date.now() });
      slotFlashTimerRef.current = setTimeout(() => setSlotFlash(null), 900);
    }
    setPendingDelete(null);
  };

  // Batch undo — "Logged N items — Undo" for 10s after a multi-item AI log.
  const registerBatch = useCallback((ids: string[]) => {
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    setPendingBatch({ ids, key: Date.now() });
    batchTimerRef.current = setTimeout(() => setPendingBatch(null), 10000);
  }, []);

  const undoBatch = async () => {
    if (!pendingBatch) return;
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    const ids = pendingBatch.ids;
    setPendingBatch(null);
    await supabase.from('food_log').delete().in('id', ids);
    await loadTodayLog();
  };

  useEffect(() => () => {
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    if (pillDeltaTimerRef.current) clearTimeout(pillDeltaTimerRef.current);
    if (slotFlashTimerRef.current) clearTimeout(slotFlashTimerRef.current);
    if (emberTimerRef.current) clearTimeout(emberTimerRef.current);
  }, []);

  // W8: the streak-qualifying event — TODAY's entry count crossing ≥3 — ignites
  // the date-pill ember once per day (trophe_ember_*). Mount/date-nav resets the
  // baseline silently so plain page loads never ignite.
  useEffect(() => {
    if (pageLoading) return;
    const count = todayLog.length;
    const prev = prevEntryCountRef.current;
    prevEntryCountRef.current = { date: selectedDate, count };
    if (!isToday || !prev || prev.date !== selectedDate) return;
    if (prev.count >= 3 || count < 3 || streak < 3) return;
    if (window.localStorage.getItem(`trophe_ember_${today}`)) return;
    // Deferred trigger (MealBadges earn-detection pattern) — keeps setState out
    // of the synchronous effect body.
    const igniteTimer = window.setTimeout(() => {
      window.localStorage.setItem(`trophe_ember_${today}`, 'seen');
      if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
      setEmberIgnite({ key: Date.now() });
      if (emberTimerRef.current) clearTimeout(emberTimerRef.current);
      emberTimerRef.current = setTimeout(() => setEmberIgnite(null), 1200);
    }, 0);
    return () => window.clearTimeout(igniteTimer);
  }, [pageLoading, todayLog.length, selectedDate, isToday, today, streak]);

  // W2 arc-flight — a glowing accent mote arcs from the logging zone into the
  // day pill the moment a food is confirmed. Purely celebratory; computed at
  // fire time so it lands on the pill at any viewport size.
  const [arcFlight, setArcFlight] = useState<{ key: number; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const arcKeyRef = useRef(0);

  /** MealSlotCard onLogged — batch ids (AI multi-log) arm the batch-undo toast.
   *  Plain function (React Compiler auto-memoizes) — a manual useCallback here
   *  conflicts with the compiler's inferred deps. */
  const handleSlotLogged = (ids?: string[]) => {
    if (ids && ids.length > 0) registerBatch(ids);
    if (!reducedMotion && typeof window !== 'undefined') {
      const pill = document.getElementById('day-pill-target')?.getBoundingClientRect();
      const to = pill
        ? { x: pill.left + pill.width / 2, y: pill.top + pill.height / 2 }
        : { x: window.innerWidth - 56, y: window.innerHeight - 94 }; // pill's fixed slot
      const from = { x: window.innerWidth / 2, y: window.innerHeight * 0.58 };
      setArcFlight({ key: ++arcKeyRef.current, from, to });
    }
    void loadTodayLog();
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
        sugar_g: entry.sugar_g ?? 0,
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
      sugar_g: fav.sugar_g,
      source: 'custom' as const,
    };
    const { error } = await supabase.from('food_log').insert(entry);
    if (!error) await loadTodayLog();
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        sugar_g: e.sugar_g,
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

  // W10: THE one next-expected empty slot, matched to the hour — breakfast <11,
  // lunch 11-15, snack 15-18, dinner 18-22. Today only; skipped/locked excluded.
  const nextSlot = (() => {
    if (!isToday) return null;
    const h = new Date().getHours();
    const expected: MealType | null =
      h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : h < 22 ? 'dinner' : null;
    if (!expected) return null;
    const empties = slots.filter(s =>
      grouped[s.id].length === 0 && !skippedSlots.has(s.id) && !lockedSlots.has(s.id)
    );
    // Two snack slots exist — at 15-18h prefer the afternoon one.
    return (expected === 'snack'
      ? empties.find(s => s.mealType === 'snack' && s.id !== 'snack_am') ?? empties.find(s => s.mealType === 'snack')
      : empties.find(s => s.mealType === expected)) ?? null;
  })();

  // W10: protein-first invitation copy; kcal phrasing only when the coach shows calories.
  const proteinLeft = Math.max(0, Math.round(targets.protein_g - totalProtein));
  const nextSlotHint = nextSlot
    ? (targets.protein_g > 0 && proteinLeft > 0
        ? t('food.next_slot_protein', { slot: nextSlot.label, n: proteinLeft })
        : showCalories && targets.calories > 0 && remainingCal > 0
          ? t('food.next_slot_kcal', { slot: nextSlot.label, n: Math.round(remainingCal) })
          : null)
    : null;

  // CoachFoodRecs quick-log handler
  const logCoachRec = async (rec: { food: string; calories: number; protein: number; carbs: number; fat: number; fiber: number }, mealType: import('@/lib/types').MealType) => {
    if (!userId) return;
    await supabase.from('food_log').insert({
      user_id: userId,
      logged_date: selectedDate,
      meal_type: mealType,
      food_name: rec.food,
      quantity: 1,
      unit: 'serving',
      calories: rec.calories,
      protein_g: rec.protein,
      carbs_g: rec.carbs,
      fat_g: rec.fat,
      fiber_g: rec.fiber,
      sugar_g: 0,
      source: 'custom' as const,
    });
    await loadTodayLog();
  };

  // Loading skeleton while auth + data resolve
  if (pageLoading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <div className="max-w-md mx-auto px-4 pt-12">
          {/* Branded skeletons — gold transform-only sheen, no opacity pulse */}
          <div className="space-y-3">
            <div className="skeleton h-8 rounded-xl w-48 mx-auto" />
            <div className="skeleton h-10 rounded-xl" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-md" />
              ))}
            </div>
            <div className="skeleton h-16 rounded-xl" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        </div>
        <BotNav routes={clientNav} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 pb-24"
        style={{ background: 'var(--bg,#0a0a0a)' }}
      >
        <div className="glass w-full max-w-sm p-6 text-center">
          <p role="alert" className="mb-4 text-sm leading-relaxed text-stone-300">
            {t('food.log_load_failed')}
          </p>
          <button
            type="button"
            onClick={() => void loadTodayLog()}
            className="btn-gold w-full rounded-xl py-3 text-sm font-semibold"
          >
            {t('food.retry')}
          </button>
        </div>
        <BotNav routes={clientNav} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* ── Date navigation ── */}
        <div className="row-b mb-3" style={{ marginTop: 8 }}>
          <button onClick={() => handleDateChange(localDateStr(new Date(new Date(selectedDate + 'T12:00:00').getTime() - 86400000)))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '6px' }}>
            <Icon name="i-chev-l" size={16} />
          </button>

          {/* Center: date label + calendar trigger */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCalendar(true)}
            style={{
              background: 'rgba(212,168,83,.07)',
              border: '1px solid rgba(212,168,83,.18)',
              borderRadius: 20, padding: '5px 14px',
              display: 'flex', alignItems: 'center', gap: 7,
              cursor: 'pointer',
            }}
          >
            <Icon name="i-calendar" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>
              {isToday ? t('log.today') : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {!isToday && (
              <span style={{ fontSize: 9, color: 'var(--t5)', fontFamily: 'var(--font-mono)' }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
            )}
            {/* W8: streak ember — gold flame + mono count, ignites once/day */}
            {streak >= 3 && (
              <span
                role="img"
                aria-label={t('log.streak_ember_aria', { n: streak })}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 3,
                  color: 'var(--gold-300,#D4A853)', marginLeft: 2,
                }}
              >
                <motion.span
                  aria-hidden
                  key={emberIgnite ? `ember-pop-${emberIgnite.key}` : 'ember-static'}
                  initial={false}
                  animate={emberIgnite && !reducedMotion ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  style={{ display: 'flex', transformOrigin: 'center bottom' }}
                >
                  <Icon name="i-flame" size={11} />
                </motion.span>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }} aria-hidden>
                  <AnimatedValue
                    key={emberIgnite ? `ember-roll-${emberIgnite.key}` : 'ember-idle'}
                    value={streak}
                    startAt={emberIgnite ? Math.max(0, streak - 1) : streak}
                    grouped={false}
                  />
                </span>
                {/* 2 gold spark particles — translate+fade 500ms, absolute in this in-flow container */}
                {emberIgnite && !reducedMotion && (
                  <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {[0, 1].map(i => (
                      <motion.span
                        key={`${emberIgnite.key}-spark-${i}`}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                        animate={{ opacity: 0, x: i === 0 ? -7 : 8, y: -11, scale: 0.6 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{
                          position: 'absolute', left: 3, top: 1, width: 4, height: 4,
                          borderRadius: '50%', background: 'var(--gold-300,#D4A853)',
                        }}
                      />
                    ))}
                  </span>
                )}
              </span>
            )}
          </motion.button>

          <button onClick={() => handleDateChange(localDateStr(new Date(new Date(selectedDate + 'T12:00:00').getTime() + 86400000)))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '6px' }}>
            <Icon name="i-chev-r" size={16} />
          </button>
        </div>

        {/* ── 7-day strip (from weekData) ── */}
        {weekData.length === 7 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 10 }}>
            {weekData.map((d, i) => {
              const dayAbbr = ['M','T','W','T','F','S','S'][i];
              const dayNum  = new Date(d.date + 'T12:00:00').getDate();
              const active  = d.date === selectedDate;
              return (
                <button key={d.date} onClick={() => handleDateChange(d.date)} style={{
                  textAlign: 'center', padding: '4px 2px', borderRadius: 6, fontSize: 10, cursor: 'pointer', border: 'none',
                  background: active ? 'rgba(212,168,83,.12)' : 'rgba(255,255,255,.03)',
                  outline: active ? '1px solid rgba(212,168,83,.5)' : '1px solid var(--line)',
                  color: active ? 'var(--gold-300,#D4A853)' : d.entries > 0 ? 'var(--t2)' : 'var(--t5)',
                }}>
                  <div>{dayAbbr}</div>
                  <div style={{ fontWeight: 700, fontSize: 10 }}>{dayNum}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Macro summary card (kcal column gated by coach pref) ── */}
        <div className="card mb-3" style={{ padding: '10px 8px' }}>
          {(() => {
            const cells = [
              { key: 'calories' as const, label: t('general.calories'), unit: 'kcal', val: Math.round(totalCalories), color: 'var(--gold-300,#D4A853)' },
              { key: 'protein' as const,  label: t('general.protein'),  unit: 'g',    val: Math.round(totalProtein),  color: 'var(--err,#E87A6E)' },
              { key: 'carbs' as const,    label: t('general.carbs'),    unit: 'g',    val: Math.round(totalCarbs),    color: 'var(--info,#7DA3D9)' },
              { key: 'fat' as const,      label: t('general.fat'),      unit: 'g',    val: Math.round(totalFat),      color: 'var(--plum,#B89DD9)' },
              { key: 'sugar' as const,    label: t('general.sugar'),    unit: 'g',    val: Math.round(totalSugar),    color: totalSugar > 25 ? '#f59e0b' : 'var(--warn,#E8B86E)' },
            ].filter(m => showCalories || m.unit !== 'kcal');
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length},1fr)`, gap: 3, textAlign: 'center' }}>
                {cells.map((m, mIdx) => {
                  const isProtein = m.key === 'protein';
                  const cellBody = (
                    <>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: m.color, lineHeight: 1.1 }}>
                        <AnimatedValue value={m.val} grouped={false} />
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)', marginTop: 1, lineHeight: 1.2 }}>{m.unit}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '.04em', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                    </>
                  );
                  return (
                    <div key={m.key} style={{ position: 'relative', borderRight: mIdx < cells.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                      {/* W3: one-shot coral glow ring when a protein-heavy log lands */}
                      {isProtein && proteinGlowTick > 0 && !reducedMotion && (
                        <motion.span
                          key={`protein-glow-${proteinGlowTick}`}
                          aria-hidden
                          style={{
                            position: 'absolute', inset: -3, borderRadius: 8, pointerEvents: 'none',
                            border: '1px solid rgba(232,122,110,.8)',
                            boxShadow: '0 0 16px rgba(232,122,110,.4)',
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 1.4, times: [0, 0.35, 1], type: 'tween', ease: 'easeInOut' }}
                        />
                      )}
                      {/* W3: protein cell pops (scale) on protein-heavy logs — controls
                          keep the AnimatedValue mounted so the count never resets */}
                      {isProtein ? (
                        <motion.div animate={proteinPopControls} style={{ transformOrigin: 'center' }}>
                          {cellBody}
                        </motion.div>
                      ) : cellBody}
                      {/* W3: floating mono deltas rising off the affected cell */}
                      <AnimatePresence>
                        {ribbons.filter(r => r.macro === m.key).map(r => (
                          <motion.span
                            key={r.id}
                            aria-hidden
                            initial={{ opacity: 0, y: 0 }}
                            animate={reducedMotion
                              ? { opacity: [0, 1, 0], y: 0 }
                              : { opacity: [0, 1, 0], y: -14 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.7, times: [0, 0.3, 1], ease: 'easeOut' }}
                            style={{
                              position: 'absolute', top: -6, left: 0, right: 0,
                              textAlign: 'center', pointerEvents: 'none', zIndex: 1,
                              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                              color: MACRO_COLORS[r.macro],
                            }}
                          >
                            {r.delta > 0 ? '+' : ''}{r.delta}{m.unit === 'kcal' ? '' : 'g'}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── Meals section header + recipe analyzer entry point ── */}
        <div className="flex items-center justify-between mb-2">
          <span className="eye-d">{t('log.meals_count', { done: filledCount, total: slots.length })}</span>
          {/* RecipeAnalyzerModal was fully built but unreachable — this is its door */}
          <button
            onClick={() => setShowRecipeModal(true)}
            className="glass flex items-center gap-1.5 px-2.5 py-1 text-stone-400 hover:gold-text text-[11px] transition-colors"
            style={{ borderRadius: 999 }}
            aria-label={t('food.analyze_recipe_aria')}
          >
            <ChefHat size={12} />
            {t('food.analyze_recipe')}
          </button>
        </div>

        {/* ── "Day sealed" banner — animated check + gold glow, once per day ── */}
        {allMealsLocked && hasAnyFood && (
          <SealedBanner key={selectedDate} date={selectedDate} label={t('log.day_locked')} />
        )}


        {/* ── Favorites chips ── */}
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
                  {fav.food_name}{showCalories ? ` · ${fav.calories}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Rotating tip (non-meal-time only) ── */}
        {todayLog.length < 4 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 px-3 py-2 rounded-lg bg-[#D4A853]/10 border border-[#D4A853]/20"
          >
            <p className="text-xs text-[#D4A853]">
              {getHealthTip(t, totalProtein, totalCalories, targets, filledCount, nextUnfilled, showCalories)}
            </p>
          </motion.div>
        )}

        {/* ── Meal Slot Cards ── */}
        <Stagger className="space-y-2 mb-2">
          {userId && slots.map(slot => (
            <StaggerItem key={slot.id}>
            <div style={{ position: 'relative' }}>
            {/* W13: one-shot gold flash on the slot that just got its entry back
                (same vocabulary as the flywheel editor's saved-edit flash) */}
            {slotFlash?.slotId === slot.id && (
              <motion.div
                key={slotFlash.key}
                initial={{ opacity: reducedMotion ? 0 : 0.35 }}
                animate={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 pointer-events-none"
                style={{ borderRadius: 16, background: 'var(--gold-300,#D4A853)', zIndex: 1 }}
                aria-hidden
              />
            )}
            <MealSlotCard
              slot={slot}
              entries={grouped[slot.id] || []}
              userId={userId}
              date={selectedDate}
              skipped={skippedSlots.has(slot.id)}
              locked={lockedSlots.has(slot.id)}
              favorites={favorites}
              isNext={nextSlot?.id === slot.id}
              nextHint={nextSlot?.id === slot.id ? nextSlotHint : null}
              showCalories={showCalories}
              onLogged={handleSlotLogged}
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
            </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* ════════════════════════════════════════
            INSIGHTS SECTION
        ════════════════════════════════════════ */}
        <SectionDivider label={t('log.section_insights')} />

        {/* Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.28 }}
          className="mb-3"
        >
          <MealBadges todayLog={todayLog} streak={streak} targets={{ protein_g: targets.protein_g }} />
        </motion.div>

        {/* Coach food recommendations */}
        {userId && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.28 }}
            className="mb-3"
          >
            <CoachFoodRecs userId={userId} onLogFood={logCoachRec} />
          </motion.div>
        )}

        {/* Macro Food Ideas removed — coach plan is the source of truth (Michael 2026-06-12) */}

        {/* Daily Insights */}
        {todayLog.length >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.28 }}
            className="mb-3"
          >
            <DailyInsights entries={todayLog} targets={targets} showCalories={showCalories} />
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            NUTRITION INTEL SECTION (coach-gated: nutritionIntel pref)
        ════════════════════════════════════════ */}
        {showNutritionIntel && (
          <>
            <SectionDivider label={t('log.section_nutrition_intel')} />

            {/* Fasting Timer */}
            {todayLog.length > 0 && isToday && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04, duration: 0.28 }}
                className="mb-3"
              >
                <FastingTimer todayLog={todayLog} />
              </motion.div>
            )}

            {/* Protein Distribution */}
            {todayLog.length >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.28 }}
                className="mb-3"
              >
                <ProteinDistribution entries={todayLog} />
              </motion.div>
            )}

            {/* Nutrient Density */}
            {todayLog.length >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.28 }}
                className="mb-3"
              >
                <NutrientDensity entries={todayLog} />
              </motion.div>
            )}

            {/* Photo Gallery */}
            {userId && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.28 }}
                className="mb-3"
              >
                <MealPhotoGallery userId={userId} />
              </motion.div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════
            ANALYTICS SECTION (coach-gated: logAnalytics pref)
        ════════════════════════════════════════ */}
        {userId && showLogAnalytics && (
          <>
            <SectionDivider label={t('log.analytics')} />

            <div className="space-y-3">
              {/* Macro Trends */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04, duration: 0.28 }}>
                <MacroTrendChart userId={userId} />
              </motion.div>

              {/* Calorie Heatmap — additionally needs showCalories */}
              {showCalories && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.28 }}>
                  <CalorieHeatmap userId={userId} />
                </motion.div>
              )}

              {/* Food Frequency */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.28 }}>
                <FoodFrequency userId={userId} />
              </motion.div>

              {/* Day Patterns */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.28 }}>
                <DayPatterns userId={userId} />
              </motion.div>

              {/* Macro Adherence hidden from clients — coach-only metric (Michael 2026-06-12) */}

              {/* Monthly Report */}
              {targets.calories > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.28 }}>
                  <MonthlyReport userId={userId} targets={targets} showCalories={showCalories} />
                </motion.div>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* W6: narrative day pill — protein-first story (coral "n g to go" → gold
          "Protein ✓"); kcal joins inside when the coach shows calories.
          Replaces the F7 kcal-only pill. */}
      {dayPillVisible && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-20 right-4 z-40"
        >
          <motion.div
            id="day-pill-target"
            layoutId={reducedMotion ? undefined : 'day-pill'}
            className="px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2"
            style={{
              position: 'relative',
              background: !proteinPillActive || proteinDone ? 'rgba(212,168,83,.13)' : 'rgba(232,122,110,.13)',
              border: `1px solid ${!proteinPillActive || proteinDone ? 'rgba(212,168,83,.35)' : 'rgba(232,122,110,.35)'}`,
            }}
          >
            {/* Protein segment — the default story for the protein-first client */}
            {proteinPillActive && (proteinDone ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--gold-300,#D4A853)', whiteSpace: 'nowrap' }}>
                <ProteinSealCheck key={selectedDate} date={selectedDate} />
                {t('food.pill_protein_done')}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: MACRO_COLORS.protein, whiteSpace: 'nowrap' }}>
                <Zap size={11} aria-hidden />
                {/* i18n around the rolling number: t() without params keeps the
                    literal {n}, so splitting on it works in every language. */}
                <span>
                  {t('food.pill_protein_to_go').split('{n}')[0]}
                  <AnimatedValue value={proteinLeft} grouped={false} />
                  {t('food.pill_protein_to_go').split('{n}')[1]}
                </span>
              </span>
            ))}
            {/* ~2.5s delta expansion after each totals change, then contracts */}
            <AnimatePresence>
              {pillDelta && proteinPillActive && !proteinDone && (
                <motion.span
                  key={pillDelta.key}
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.2 } }}
                  style={{ color: MACRO_COLORS.protein, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                >
                  {pillDelta.value > 0 ? t('food.pill_delta_nice', { n: pillDelta.value }) : `${pillDelta.value}g`}
                </motion.span>
              )}
            </AnimatePresence>
            {/* kcal segment — coach-gated; keeps the old tone ladder incl. calm
                over-budget purple (color swap only, never animated on over) */}
            {kcalPillActive && (
              <>
                {proteinPillActive && (
                  <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,.14)' }} />
                )}
                <span
                  className={
                    remainingCal > 500 ? 'text-green-400'
                    : remainingCal > 200 ? 'gold-text'
                    : remainingCal > 0 ? 'text-red-400'
                    : 'text-purple-400'
                  }
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {t(remainingCal >= 0 ? 'food.pill_kcal_left' : 'food.pill_kcal_over').split('{n}')[0]}
                  <AnimatedValue value={Math.abs(Math.round(remainingCal))} grouped={false} />
                  {t(remainingCal >= 0 ? 'food.pill_kcal_left' : 'food.pill_kcal_over').split('{n}')[1]}
                </span>
              </>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* F3: Undo delete toast — stacks above the day pill when both show.
          W13: 5s countdown ring synced to the hard-delete timer (batch-toast vocabulary). */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed ${dayPillVisible ? 'bottom-32' : 'bottom-20'} left-4 right-4 z-[var(--z-toast,70)] flex justify-center`}
          >
            <div className="glass-elevated px-4 py-3 rounded-xl flex items-center gap-3 shadow-lg max-w-sm">
              <span className="text-stone-300 text-sm flex-1">
                {t('food.entry_deleted')}
              </span>
              <button
                onClick={undoDelete}
                className="gold-text text-sm font-semibold flex items-center gap-1.5"
              >
                {reducedMotion ? (
                  <span className="text-stone-500 text-xs tabular-nums">(5s)</span>
                ) : (
                  <svg
                    width={16} height={16} viewBox="0 0 16 16" aria-hidden
                    style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
                  >
                    <circle cx={8} cy={8} r={6} fill="none" stroke="rgba(212,168,83,.2)" strokeWidth={2} />
                    <motion.circle
                      key={pendingDelete.id}
                      cx={8} cy={8} r={6} fill="none"
                      stroke="var(--gold-300,#D4A853)" strokeWidth={2} strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 6}
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 6 }}
                      transition={{ duration: 5, ease: 'linear' }}
                    />
                  </svg>
                )}
                <Undo2 size={14} />
                {t('food.undo_delete')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch undo toast — "Logged N items — Undo" with a 10s countdown ring;
          stacks above the single-delete toast if both are somehow visible */}
      <AnimatePresence>
        {pendingBatch && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed ${
              pendingDelete
                ? (dayPillVisible ? 'bottom-44' : 'bottom-32')
                : (dayPillVisible ? 'bottom-32' : 'bottom-20')
            } left-4 right-4 z-[var(--z-toast,70)] flex justify-center`}
          >
            <div className="glass-elevated px-4 py-3 rounded-xl flex items-center gap-3 shadow-lg max-w-sm">
              <span className="text-stone-300 text-sm flex-1">
                {pendingBatch.ids.length === 1
                  ? t('log.batch_logged_one')
                  : t('log.batch_logged', { n: pendingBatch.ids.length })}
              </span>
              <button
                onClick={() => void undoBatch()}
                className="gold-text text-sm font-semibold flex items-center gap-1.5"
                aria-label={t('log.batch_undo_aria', { n: pendingBatch.ids.length })}
              >
                {reducedMotion ? (
                  <span className="text-stone-500 text-xs tabular-nums">(10s)</span>
                ) : (
                  <svg
                    width={16} height={16} viewBox="0 0 16 16" aria-hidden
                    style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
                  >
                    <circle cx={8} cy={8} r={6} fill="none" stroke="rgba(212,168,83,.2)" strokeWidth={2} />
                    <motion.circle
                      key={pendingBatch.key}
                      cx={8} cy={8} r={6} fill="none"
                      stroke="var(--gold-300,#D4A853)" strokeWidth={2} strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 6}
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 6 }}
                      transition={{ duration: 10, ease: 'linear' }}
                    />
                  </svg>
                )}
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

      {/* W2 arc-flight mote — one-shot, self-clearing */}
      <AnimatePresence>
        {arcFlight && (
          <motion.span
            key={arcFlight.key}
            initial={{ x: arcFlight.from.x, y: arcFlight.from.y, opacity: 0, scale: 0.4 }}
            animate={{
              x: [arcFlight.from.x, (arcFlight.from.x + arcFlight.to.x) / 2, arcFlight.to.x],
              y: [arcFlight.from.y, Math.min(arcFlight.from.y, arcFlight.to.y) - 120, arcFlight.to.y],
              opacity: [0, 1, 1, 0.4],
              scale: [0.4, 1, 0.5],
            }}
            transition={{ duration: 0.65, times: [0, 0.55, 1], ease: 'easeInOut' }}
            onAnimationComplete={() => setArcFlight(null)}
            style={{
              position: 'fixed', left: 0, top: 0, zIndex: 45, pointerEvents: 'none',
              width: 14, height: 14, borderRadius: '50%', marginLeft: -7, marginTop: -7,
              background: 'var(--accent, #D4A853)',
              boxShadow: '0 0 14px 4px color-mix(in srgb, var(--accent, #D4A853) 55%, transparent)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Recipe analyzer modal (Michael #C) */}
      {userId && (
        <RecipeAnalyzerModal
          userId={userId}
          selectedDate={selectedDate}
          isOpen={showRecipeModal}
          onClose={() => setShowRecipeModal(false)}
          onLogged={() => { void loadTodayLog(); }}
        />
      )}

      <BotNav routes={clientNav} />
    </div>
  );
}
