'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Plus, Check, X, Flame, Beef, Wheat, Droplet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ClientProfile, ClientHabit, HabitCheckin, FoodLogEntry, WaterLogEntry, Mood } from '@/lib/types';
import BottomNav from '@/components/BottomNav';

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
  const pct = Math.min(value / (target || 1), 1);
  const offset = circumference * (1 - pct);

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
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="macro-ring"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-semibold text-stone-100">{Math.round(value)}</span>
          <span className="text-[9px] text-stone-500">{unit}</span>
        </div>
      </div>
      <span className="text-[10px] text-stone-400 font-medium">{label}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [activeHabit, setActiveHabit] = useState<ClientHabit | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<HabitCheckin | null>(null);
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [waterLog, setWaterLog] = useState<WaterLogEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const totalWater = waterLog.reduce((sum, w) => sum + w.amount_ml, 0);
  const totalCalories = foodLog.reduce((sum, f) => sum + (f.calories ?? 0), 0);
  const totalProtein = foodLog.reduce((sum, f) => sum + (f.protein_g ?? 0), 0);
  const totalCarbs = foodLog.reduce((sum, f) => sum + (f.carbs_g ?? 0), 0);
  const totalFat = foodLog.reduce((sum, f) => sum + (f.fat_g ?? 0), 0);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUserId(user.id);

      const [cpRes, chRes, flRes, wlRes] = await Promise.all([
        supabase
          .from('client_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single(),
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
      ]);

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

  const handleCheckin = async (completed: boolean) => {
    if (!userId || !activeHabit || submitting) return;
    setSubmitting(true);
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
      .single();
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
    setSubmitting(false);
  };

  const handleMood = async (mood: Mood) => {
    if (!todayCheckin) return;
    await supabase
      .from('habit_checkins')
      .update({ mood })
      .eq('id', todayCheckin.id);
    setTodayCheckin((prev) => (prev ? { ...prev, mood } : prev));
  };

  const addWater = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('water_log')
      .insert({ user_id: userId, logged_date: today, amount_ml: 250 })
      .select()
      .single();
    if (data) setWaterLog((prev) => [...prev, data]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="gold-text text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  const streakDays = activeHabit?.current_streak ?? 0;
  const cycleDays = activeHabit?.habit?.cycle_days ?? 14;
  const streakPct = Math.min((streakDays / cycleDays) * 100, 100);

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-100">Today</h1>
          <p className="text-stone-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Active Habit Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass gold-border p-5 mb-4"
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
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
            Today&apos;s Macros
          </h3>
          <div className="flex items-center justify-around">
            <MacroRing
              value={totalCalories}
              target={clientProfile?.target_calories ?? 2000}
              label="Calories"
              unit="kcal"
              color="#D4A853"
            />
            <MacroRing
              value={totalProtein}
              target={clientProfile?.target_protein_g ?? 150}
              label="Protein"
              unit="g"
              color="#ef4444"
            />
            <MacroRing
              value={totalCarbs}
              target={clientProfile?.target_carbs_g ?? 200}
              label="Carbs"
              unit="g"
              color="#3b82f6"
            />
            <MacroRing
              value={totalFat}
              target={clientProfile?.target_fat_g ?? 65}
              label="Fat"
              unit="g"
              color="#a855f7"
            />
          </div>
        </motion.div>

        {/* Water Tracker */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
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

          <div className="streak-bar h-4 mb-3">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd)',
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(
                  (totalWater / (clientProfile?.target_water_ml ?? 2500)) * 100,
                  100
                )}%`,
              }}
              transition={{ duration: 0.6, delay: 0.4 }}
            />
          </div>

          <button
            onClick={addWater}
            className="btn-ghost w-full flex items-center justify-center gap-2 text-sm py-2"
          >
            <Plus size={16} /> Add 250 ml
          </button>
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
