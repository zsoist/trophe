'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { Plus, Check, X, Droplets } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientProfile, ClientHabit, HabitCheckin, FoodLogEntry, WaterLogEntry, Mood, Profile } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import WeeklyCheckin from '@/components/WeeklyCheckin';
import ComplianceTrend from '@/components/ComplianceTrend';
import MythCard from '@/components/MythCard';
import StreakBadges from '@/components/StreakBadges';
import { DashboardSkeleton } from '@/components/Skeleton';
import Avatar from '@/components/Avatar';
import HabitDetailModal from '@/components/HabitDetailModal';
import { localToday } from '../../lib/dates';

// ─── Motivational micro-texts (rotate daily) ───
const MOTIVATIONAL_TEXTS = [
  'Small habits, big transformations',
  'Consistency beats perfection',
  'One day at a time, one habit at a time',
  'Your body adapts to what you consistently do',
  'Progress, not perfection',
];

function getTimeGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌅' };
  return { text: 'Good night', emoji: '🌙' };
}

function getDailyMotivation(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return MOTIVATIONAL_TEXTS[dayOfYear % MOTIVATIONAL_TEXTS.length];
}

function PersonalizedGreeting({ fullName }: { fullName: string | null }) {
  const { text, emoji } = getTimeGreeting();
  const firstName = fullName ? fullName.split(' ')[0] : null;
  const motivation = getDailyMotivation();

  return (
    <div className="flex items-center gap-3">
      {fullName && <Avatar name={fullName} size={48} />}
      <div>
        <h1 className="text-2xl font-bold text-stone-100">
          {text}{firstName ? `, ${firstName}` : ''} {emoji}
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-stone-600 text-xs mt-1.5 italic">{motivation}</p>
      </div>
    </div>
  );
}

const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'great', emoji: '😄', label: 'Great' },
  { value: 'good', emoji: '😊', label: 'Good' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'tough', emoji: '😓', label: 'Tough' },
  { value: 'struggled', emoji: '😰', label: 'Struggled' },
];

// ─── Calorie Ring (large, center of Today's Progress card) ───
function CalorieRing({
  consumed,
  target,
}: {
  consumed: number;
  target: number;
}) {
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rawPct = target > 0 ? consumed / target : 0;
  const clampedPct = Math.min(rawPct, 1);
  const remaining = Math.max(target - consumed, 0);
  const ringColor = rawPct >= 1 ? '#22c55e' : '#D4A853';

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clampedPct) }}
          transition={{ type: 'spring', stiffness: 50, damping: 15, delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-stone-100">{Math.round(consumed)}</span>
        <span className="text-xs text-stone-500">of {Math.round(target)} kcal</span>
        <span className="text-[10px] text-stone-600 mt-0.5">{Math.round(remaining)} left</span>
      </div>
    </div>
  );
}

// ─── Macro Progress Bar ───
function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-stone-400 font-medium w-14 text-right">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 50, damping: 15, delay: 0.4 }}
        />
      </div>
      <span className="text-xs text-stone-400 w-20 text-right tabular-nums">
        {Math.round(value)}{unit} / {Math.round(target)}{unit}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [activeHabit, setActiveHabit] = useState<ClientHabit | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<HabitCheckin | null>(null);
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [waterLog, setWaterLog] = useState<WaterLogEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [allCheckins, setAllCheckins] = useState<HabitCheckin[]>([]);
  const [waterSplash, setWaterSplash] = useState(false);

  const today = localToday();

  const totalWater = waterLog.reduce((sum, w) => sum + w.amount_ml, 0);
  const totalCalories = foodLog.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const totalProtein = foodLog.reduce((sum, f) => sum + (f.protein_g ?? 0), 0);
  const totalCarbs = foodLog.reduce((sum, f) => sum + (f.carbs_g ?? 0), 0);
  const totalFat = foodLog.reduce((sum, f) => sum + (f.fat_g ?? 0), 0);
  const totalFiber = foodLog.reduce((sum, f) => sum + (f.fiber_g ?? 0), 0);
  const mealsLogged = new Set(foodLog.map((f) => f.meal_type)).size;

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [cpRes, chRes, flRes, wlRes, profileRes] = await Promise.all([
        supabase
          .from('client_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('client_habits')
          .select('*, habit:habits(*)')
          .eq('client_id', user.id)
          .eq('status', 'active')
          .order('sequence_number', { ascending: true })
          .limit(1),
        supabase
          .from('food_log')
          .select('*')
          .eq('user_id', user.id)
          .eq('logged_date', today),
        supabase
          .from('water_log')
          .select('*')
          .eq('user_id', user.id)
          .eq('logged_date', today),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (profileRes.data) setUserProfile(profileRes.data);
      if (cpRes.data) setClientProfile(cpRes.data);
      if (chRes.data && chRes.data.length > 0) {
        const habit = chRes.data[0] as ClientHabit;
        setActiveHabit(habit);

        const { data: checkin } = await supabase
          .from('habit_checkins')
          .select('*')
          .eq('client_habit_id', habit.id)
          .eq('checked_date', today)
          .limit(1);

        if (checkin && checkin.length > 0) setTodayCheckin(checkin[0]);
      }
      if (flRes.data) setFoodLog(flRes.data);
      if (wlRes.data) setWaterLog(wlRes.data);

      // Fetch all checkins for habit detail modal
      if (chRes.data && chRes.data.length > 0) {
        const habit = chRes.data[0];
        const { data: allCh } = await supabase
          .from('habit_checkins')
          .select('*')
          .eq('client_habit_id', habit.id)
          .order('checked_date', { ascending: true });
        if (allCh) setAllCheckins(allCh);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [today, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [submitting, setSubmitting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationChecked, setCelebrationChecked] = useState(false);

  const handleCheckin = async (completed: boolean) => {
    if (!userId || !activeHabit || submitting) return;
    setSubmitting(true);
    try {
    const { data } = await supabase
      .from('habit_checkins')
      .upsert(
        {
          client_habit_id: activeHabit.id,
          user_id: userId,
          checked_date: today,
          completed,
        },
        { onConflict: 'client_habit_id,checked_date' }
      )
      .select()
      .maybeSingle();
    if (data) {
      setTodayCheckin(data);
      if (completed) {
        await supabase
          .from('client_habits')
          .update({
            current_streak: (activeHabit.current_streak || 0) + 1,
            total_completions: (activeHabit.total_completions || 0) + 1,
          })
          .eq('id', activeHabit.id);
        setActiveHabit((prev) =>
          prev
            ? {
                ...prev,
                current_streak: (prev.current_streak || 0) + 1,
                total_completions: (prev.total_completions || 0) + 1,
              }
            : prev
        );
      }
    }
    } catch (err) {
      console.error('Checkin error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMood = async (mood: Mood) => {
    if (!todayCheckin) return;
    await supabase
      .from('habit_checkins')
      .update({ mood })
      .eq('id', todayCheckin.id);
    setTodayCheckin((prev) => (prev ? { ...prev, mood } : prev));
  };

  const [addingWater, setAddingWater] = useState(false);

  const addWater = async () => {
    if (!userId || addingWater) return;
    setAddingWater(true);
    const { data } = await supabase
      .from('water_log')
      .insert({ user_id: userId, logged_date: today, amount_ml: 250 })
      .select()
      .maybeSingle();
    if (data) setWaterLog((prev) => [...prev, data]);
    setAddingWater(false);
  };

  // Habit mastery celebration — must be BEFORE any early returns (Rules of Hooks)
  useEffect(() => {
    if (activeHabit && !celebrationChecked) {
      setCelebrationChecked(true);
      if (activeHabit.current_streak >= (activeHabit.habit?.cycle_days ?? 14)) {
        const dismissKey = `trophe_mastery_${activeHabit.id}`;
        if (!localStorage.getItem(dismissKey)) {
          setShowCelebration(true);
        }
      }
    }
  }, [activeHabit, celebrationChecked]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const streakDays = activeHabit?.current_streak ?? 0;
  const cycleDays = activeHabit?.habit?.cycle_days ?? 14;
  const streakPct = Math.min((streakDays / cycleDays) * 100, 100);

  function dismissCelebration() {
    if (activeHabit) {
      localStorage.setItem(`trophe_mastery_${activeHabit.id}`, 'seen');
    }
    setShowCelebration(false);
  }

  // Confetti colors
  const confettiColors = ['#D4A853', '#E8C878', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b'];

  // Calculate completion percentage for celebration
  const totalDaysTracked = activeHabit?.total_completions ?? 0;
  const completionPct = cycleDays > 0 ? Math.round((totalDaysTracked / cycleDays) * 100) : 0;

  // Computed targets for the new dashboard layout
  const targetCalories = clientProfile?.target_calories ?? 2000;
  const targetProtein = clientProfile?.target_protein_g ?? 150;
  const targetCarbs = clientProfile?.target_carbs_g ?? 200;
  const targetFat = clientProfile?.target_fat_g ?? 65;
  const targetFiber = clientProfile?.target_fiber_g ?? 30;
  const targetWater = clientProfile?.target_water_ml ?? 2500;
  const waterGlasses = Math.floor(totalWater / 250);
  const targetGlasses = Math.ceil(targetWater / 250);

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg-primary)' }}>
      {/* ═══ Habit Mastery Celebration Modal ═══ */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={dismissCelebration}
          >
            {/* Confetti particles */}
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="confetti-particle"
                style={{
                  left: `${Math.random() * 100}%`,
                  backgroundColor: confettiColors[i % confettiColors.length],
                  width: `${6 + Math.random() * 8}px`,
                  height: `${6 + Math.random() * 8}px`,
                  animationDelay: `${Math.random() * 1.5}s`,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                }}
              />
            ))}

            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 15, stiffness: 200 }}
              className="glass-elevated celebration-glow p-8 max-w-sm w-full text-center relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold gold-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                Habit Mastered!
              </h2>
              <p className="text-stone-400 text-sm mb-6">
                You completed the {cycleDays}-day cycle for{' '}
                <span className="text-stone-200 font-medium">{activeHabit?.habit?.name_en}</span>
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="glass p-3 rounded-xl">
                  <div className="text-lg font-bold text-stone-100">{streakDays}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Days</div>
                </div>
                <div className="glass p-3 rounded-xl">
                  <div className="text-lg font-bold text-stone-100">{Math.min(completionPct, 100)}%</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Completion</div>
                </div>
                <div className="glass p-3 rounded-xl">
                  <div className="text-lg font-bold text-stone-100">{activeHabit?.best_streak}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider">Best Streak</div>
                </div>
              </div>

              <p className="text-stone-500 text-xs mb-6">
                Your coach will assign your next challenge
              </p>

              <button
                onClick={dismissCelebration}
                className="btn-gold w-full text-sm py-3"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* ═══ 1. Hero Welcome Card ═══ */}
        <div className="mb-5">
          <PersonalizedGreeting fullName={userProfile?.full_name ?? null} />
          {streakDays > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-[#D4A853]/10 border border-[#D4A853]/20"
            >
              <span className="text-sm">🔥</span>
              <span className="text-xs font-semibold gold-text">{streakDays} day streak</span>
            </motion.div>
          )}
        </div>

        {/* ═══ Weekly Check-in (Sundays only) ═══ */}
        {userId && clientProfile && (
          <WeeklyCheckin userId={userId} coachId={clientProfile.coach_id} />
        )}

        {/* ═══ 2. Today's Progress Card (THE MAIN CARD) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass gold-border p-5 mb-4"
        >
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
            Today&apos;s Progress
          </h3>

          {/* Large Calorie Ring */}
          <CalorieRing consumed={totalCalories} target={targetCalories} />

          {/* Macro Progress Bars */}
          <div className="mt-5 space-y-3">
            <MacroBar label="Protein" value={totalProtein} target={targetProtein} color="#ef4444" />
            <MacroBar label="Carbs" value={totalCarbs} target={targetCarbs} color="#3b82f6" />
            <MacroBar label="Fat" value={totalFat} target={targetFat} color="#a855f7" />
            <MacroBar label="Fiber" value={totalFiber} target={targetFiber} color="#22c55e" />
          </div>

          {/* Meals logged indicator */}
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
            <span className="text-xs text-stone-500">{mealsLogged} of 5 meals logged</span>
            <div className="flex gap-1.5 ml-auto">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    n <= mealsLogged ? 'bg-[#D4A853]' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* ═══ 3. Active Habit Card ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass p-5 mb-4 cursor-pointer"
          onClick={() => activeHabit?.habit && setShowHabitModal(true)}
        >
          {activeHabit?.habit ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{activeHabit.habit.emoji}</span>
                <div className="flex-1">
                  <h2 className="text-stone-100 font-semibold text-sm">
                    {activeHabit.habit.name_en}
                  </h2>
                  <p className="text-stone-500 text-xs">
                    Day {streakDays} of {cycleDays}
                  </p>
                </div>
                <div className="text-right">
                  <span className="gold-text text-xs font-medium">
                    Best: {activeHabit.best_streak}
                  </span>
                </div>
              </div>

              {/* Streak Badges */}
              <div className="mb-3">
                <StreakBadges bestStreak={activeHabit.best_streak} />
              </div>

              {/* Streak Bar */}
              <div className="streak-bar h-3 mb-4">
                <motion.div
                  className="streak-fill h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${streakPct}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                />
              </div>

              {/* Check-in Buttons */}
              {todayCheckin ? (
                <div className="flex items-center gap-3">
                  <div
                    className={`flex-1 text-center py-2.5 rounded-xl text-sm font-medium ${
                      todayCheckin.completed
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {todayCheckin.completed ? '✅ Done today' : '❌ Skipped today'}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckin(true); }}
                    className="btn-gold flex-1 flex items-center justify-center gap-2 text-sm py-2.5"
                  >
                    <Check size={16} /> Done
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCheckin(false); }}
                    className="btn-ghost flex-1 flex items-center justify-center gap-2 text-sm py-2.5"
                  >
                    <X size={16} /> Not today
                  </button>
                </div>
              )}

              {/* Mood Selector */}
              {todayCheckin && (
                <div className="mt-4">
                  <p className="text-stone-500 text-xs mb-2">How are you feeling?</p>
                  <div className="flex gap-2 flex-wrap">
                    {MOODS.map((m) => (
                      <button
                        key={m.value}
                        onClick={(e) => { e.stopPropagation(); handleMood(m.value); }}
                        className={`mood-option text-xs ${
                          todayCheckin.mood === m.value ? 'active' : ''
                        }`}
                      >
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compliance Heatmap */}
              {activeHabit && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <p className="text-stone-500 text-xs mb-2 uppercase tracking-wider font-semibold">14-Day Compliance</p>
                  <ComplianceTrend
                    clientHabitId={activeHabit.id}
                    startDate={activeHabit.started_at}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-stone-400 text-sm">No active habit</p>
              <p className="text-stone-600 text-xs mt-1">Ask your coach to assign one!</p>
            </div>
          )}
        </motion.div>

        {/* ═══ 4. Quick Actions Grid (2x2) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-3 mb-4"
        >
          {[
            { emoji: '🍽️', label: 'Log Food', href: '/dashboard/log' },
            { emoji: '💪', label: 'Workout', href: '/dashboard/workout' },
            { emoji: '💧', label: 'Water', href: null },
            { emoji: '📊', label: 'Progress', href: '/dashboard/progress' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={async () => {
                if (action.href) {
                  router.push(action.href);
                } else {
                  setWaterSplash(true);
                  setTimeout(() => setWaterSplash(false), 600);
                  await addWater();
                }
              }}
              className="glass p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="text-2xl">{action.emoji}</span>
              <span className="text-xs font-medium text-stone-300">{action.label}</span>
            </button>
          ))}
        </motion.div>

        {/* ═══ 5. Water Tracker (compact) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass p-4 mb-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets size={16} className="text-blue-400" />
              <span className="text-sm text-stone-300 font-medium">
                {waterGlasses}/{targetGlasses} glasses
              </span>
            </div>
            <button
              onClick={async () => {
                setWaterSplash(true);
                setTimeout(() => setWaterSplash(false), 600);
                await addWater();
              }}
              className="btn-ghost px-3 py-1.5 flex items-center gap-1.5 text-xs"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {/* Water dot indicators */}
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: targetGlasses }).map((_, i) => (
              <motion.div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  i < waterGlasses ? 'bg-blue-400' : 'bg-white/[0.06]'
                }`}
                initial={i < waterGlasses ? { scale: 0 } : {}}
                animate={i < waterGlasses ? { scale: 1 } : {}}
                transition={{ delay: 0.3 + i * 0.03 }}
              />
            ))}
          </div>
          <p className="text-[10px] text-stone-600 mt-2">
            {totalWater} / {targetWater} ml
          </p>
        </motion.div>

        {/* ═══ 6. Health Tip ═══ */}
        <MythCard />
      </motion.div>

      {/* Habit Detail Modal */}
      <HabitDetailModal
        open={showHabitModal}
        onClose={() => setShowHabitModal(false)}
        habit={activeHabit?.habit ?? null}
        clientHabit={activeHabit}
        checkins={allCheckins}
        language={userProfile?.language ?? 'en'}
      />

      <BottomNav />
    </div>
  );
}
