'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { Droplets, Plus, Check, X, Flame, Beef, Wheat, Droplet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientProfile, ClientHabit, HabitCheckin, FoodLogEntry, WaterLogEntry, Mood, Profile } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import WeeklyCheckin from '@/components/WeeklyCheckin';
import ComplianceTrend from '@/components/ComplianceTrend';
import MythCard from '@/components/MythCard';
import StreakBadges from '@/components/StreakBadges';
import MealTimingIndicator from '@/components/MealTimingIndicator';
import { DashboardSkeleton } from '@/components/Skeleton';
import Avatar from '@/components/Avatar';
import CarbCyclingSelector from '@/components/CarbCyclingSelector';
import HabitDetailModal from '@/components/HabitDetailModal';
import MacroDonut from '@/components/MacroDonut';

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

function MacroRing({
  value,
  target,
  label,
  unit,
  color,
  size = 80,
}: {
  value: number;
  target: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const rawPct = target > 0 ? value / target : 0;
  const clampedPct = Math.min(rawPct, 1);
  const displayPct = Math.round(rawPct * 100);
  const offset = circumference * (1 - clampedPct);

  // Dynamic ring color: stone-700 when <50%, gold when 50-100%, green when 100%+
  const ringColor = rawPct >= 1 ? '#22c55e' : rawPct >= 0.5 ? '#D4A853' : '#44403c';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={6}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ type: 'spring', stiffness: 60, damping: 15, delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-stone-100">{displayPct}%</span>
        </div>
      </div>
      <span className="text-xs text-stone-400 font-medium">{label}</span>
      <span className="text-[9px] text-stone-500">{Math.round(value)}/{Math.round(target)}{unit}</span>
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
  const [carbCycleTargets, setCarbCycleTargets] = useState<{
    calories: number; protein_g: number; carbs_g: number; fat_g: number;
  } | null>(null);
  const [macroView, setMacroView] = useState<'rings' | 'donut'>('rings');
  const [daysActive, setDaysActive] = useState(0);
  const [weeklyAvgCal, setWeeklyAvgCal] = useState(0);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [allCheckins, setAllCheckins] = useState<HabitCheckin[]>([]);
  const [waterSplash, setWaterSplash] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const totalWater = waterLog.reduce((sum, w) => sum + w.amount_ml, 0);
  const totalCalories = foodLog.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const totalProtein = foodLog.reduce((sum, f) => sum + (f.protein_g ?? 0), 0);
  const totalCarbs = foodLog.reduce((sum, f) => sum + (f.carbs_g ?? 0), 0);
  const totalFat = foodLog.reduce((sum, f) => sum + (f.fat_g ?? 0), 0);

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

      // Fetch quick stats: days active (distinct food_log dates)
      const { count: activeDaysCount } = await supabase
        .from('food_log')
        .select('logged_date', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setDaysActive(activeDaysCount ?? 0);

      // Fetch weekly avg calories (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const weekStart = sevenDaysAgo.toISOString().split('T')[0];
      const { data: weekFood } = await supabase
        .from('food_log')
        .select('calories')
        .eq('user_id', user.id)
        .gte('logged_date', weekStart);
      if (weekFood && weekFood.length > 0) {
        const totalWeekCal = weekFood.reduce((s, f) => s + (f.calories ?? 0), 0);
        setWeeklyAvgCal(Math.round(totalWeekCal / 7));
      }

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
  }, [today]);

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

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
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
        {/* Personalized Greeting */}
        <div className="mb-6">
          <PersonalizedGreeting fullName={userProfile?.full_name ?? null} />
        </div>

        {/* ═══ Quick Stats Bar ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4 -mx-1"
        >
          <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide">
            {[
              { icon: '🔥', label: 'Streak', value: `${streakDays}d` },
              { icon: '📅', label: 'Active', value: `${daysActive}d` },
              { icon: '💧', label: 'Water', value: `${totalWater}/${clientProfile?.target_water_ml ?? 2500}` },
              { icon: '📊', label: 'Wk avg', value: `${weeklyAvgCal}` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="glass flex-shrink-0 px-3 py-2.5 flex flex-col items-center gap-0.5"
                style={{ minWidth: 78 }}
              >
                <span className="text-sm">{stat.icon}</span>
                <span className="text-xs font-bold text-stone-100">{stat.value}</span>
                <span className="text-[9px] text-stone-500 uppercase tracking-wider">{stat.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ═══ Weekly Check-in (Sundays only) ═══ */}
        {userId && clientProfile && (
          <WeeklyCheckin userId={userId} coachId={clientProfile.coach_id} />
        )}

        {/* Active Habit Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass gold-border p-5 mb-4 cursor-pointer"
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
                    onClick={() => handleCheckin(true)}
                    className="btn-gold flex-1 flex items-center justify-center gap-2 text-sm py-2.5"
                  >
                    <Check size={16} /> Done
                  </button>
                  <button
                    onClick={() => handleCheckin(false)}
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
                        onClick={() => handleMood(m.value)}
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

              {/* ═══ Compliance Heatmap ═══ */}
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

        {/* Macro Summary */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
              Today&apos;s Macros
            </h3>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04]">
              <button
                onClick={() => setMacroView('rings')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  macroView === 'rings'
                    ? 'bg-[#D4A853]/15 text-[#D4A853]'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                Rings
              </button>
              <button
                onClick={() => setMacroView('donut')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  macroView === 'donut'
                    ? 'bg-[#D4A853]/15 text-[#D4A853]'
                    : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                Donut
              </button>
            </div>
          </div>

          {macroView === 'donut' ? (
            <MacroDonut
              calories={totalCalories}
              protein={totalProtein}
              carbs={totalCarbs}
              fat={totalFat}
              targetProtein={carbCycleTargets?.protein_g ?? clientProfile?.target_protein_g ?? 150}
              targetCarbs={carbCycleTargets?.carbs_g ?? clientProfile?.target_carbs_g ?? 200}
              targetFat={carbCycleTargets?.fat_g ?? clientProfile?.target_fat_g ?? 65}
            />
          ) : (
          <div className="flex items-center justify-around">
            <MacroRing
              value={totalCalories}
              target={carbCycleTargets?.calories ?? clientProfile?.target_calories ?? 2000}
              label="Calories"
              unit="kcal"
              color="#D4A853"
            />
            <MacroRing
              value={totalProtein}
              target={carbCycleTargets?.protein_g ?? clientProfile?.target_protein_g ?? 150}
              label="Protein"
              unit="g"
              color="#ef4444"
            />
            <MacroRing
              value={totalCarbs}
              target={carbCycleTargets?.carbs_g ?? clientProfile?.target_carbs_g ?? 200}
              label="Carbs"
              unit="g"
              color="#3b82f6"
            />
            <MacroRing
              value={totalFat}
              target={carbCycleTargets?.fat_g ?? clientProfile?.target_fat_g ?? 65}
              label="Fat"
              unit="g"
              color="#a855f7"
            />
          </div>
          )}
        </motion.div>

        {/* Nutrient Timing */}
        <MealTimingIndicator foodLog={foodLog} />

        {/* Carb Cycling Day Type */}
        <CarbCyclingSelector
          enabled={!!clientProfile?.carb_cycling_enabled}
          baseCalories={clientProfile?.target_calories ?? 2000}
          baseProtein={clientProfile?.target_protein_g ?? 150}
          baseCarbs={clientProfile?.target_carbs_g ?? 200}
          baseFat={clientProfile?.target_fat_g ?? 65}
          onAdjust={setCarbCycleTargets}
        />

        {/* Water Tracker — Visual Glass */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Droplets size={18} className="text-blue-400" />
              <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
                Water
              </h3>
            </div>
            <span className="text-stone-400 text-sm">
              {totalWater} / {clientProfile?.target_water_ml ?? 2500} ml
            </span>
          </div>

          <div className="flex items-center gap-5">
            {/* SVG Water Glass */}
            <div className="relative flex-shrink-0" style={{ width: 64, height: 120 }}>
              <svg viewBox="0 0 64 120" width={64} height={120}>
                {/* Glass outline */}
                <path
                  d="M8 8 L12 110 C12 114 18 118 32 118 C46 118 52 114 52 110 L56 8 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {/* Glass fill area with clip */}
                <defs>
                  <clipPath id="glassClip">
                    <path d="M9 9 L13 109 C13 113 19 117 32 117 C45 117 51 113 51 109 L55 9 Z" />
                  </clipPath>
                </defs>
                {/* Water fill */}
                <motion.rect
                  x={0}
                  width={64}
                  clipPath="url(#glassClip)"
                  fill="url(#waterGrad)"
                  initial={{ y: 117, height: 0 }}
                  animate={{
                    y: 117 - (Math.min(totalWater / (clientProfile?.target_water_ml ?? 2500), 1) * 108),
                    height: Math.min(totalWater / (clientProfile?.target_water_ml ?? 2500), 1) * 108,
                  }}
                  transition={{ type: 'spring', stiffness: 50, damping: 12 }}
                />
                {/* Water gradient */}
                <defs>
                  <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                {/* Splash animation overlay */}
                <AnimatePresence>
                  {waterSplash && (
                    <motion.circle
                      cx={32}
                      cy={117 - (Math.min(totalWater / (clientProfile?.target_water_ml ?? 2500), 1) * 108)}
                      r={4}
                      fill="#93c5fd"
                      initial={{ r: 2, opacity: 1 }}
                      animate={{ r: 20, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    />
                  )}
                </AnimatePresence>
                {/* Marker lines at 25%, 50%, 75%, 100% */}
                {[0.25, 0.5, 0.75, 1].map((mark) => {
                  const markY = 117 - mark * 108;
                  return (
                    <g key={mark}>
                      <line
                        x1={14}
                        y1={markY}
                        x2={22}
                        y2={markY}
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={1}
                      />
                      <text
                        x={56}
                        y={markY + 3}
                        fill="rgba(255,255,255,0.2)"
                        fontSize={7}
                        textAnchor="end"
                      >
                        {Math.round(mark * 100)}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Right side: percentage + button */}
            <div className="flex-1 flex flex-col items-center gap-3">
              <div className="text-center">
                <span className="text-3xl font-bold text-blue-400">
                  {Math.min(Math.round((totalWater / (clientProfile?.target_water_ml ?? 2500)) * 100), 100)}%
                </span>
                <p className="text-stone-500 text-xs mt-1">hydrated</p>
              </div>
              <button
                onClick={async () => {
                  setWaterSplash(true);
                  setTimeout(() => setWaterSplash(false), 600);
                  await addWater();
                }}
                className="btn-ghost w-full flex items-center justify-center gap-2 text-sm py-2"
              >
                <Plus size={16} /> Add 250 ml
              </button>
            </div>
          </div>
        </motion.div>

        {/* Myth-Busting Card */}
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
