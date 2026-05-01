'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  TrendingUp,
  Flame,
  Trophy,
  Plus,
  Send,
  Pause,
  ChevronRight,
  X,
  FileText,
  Pill,
  Pencil,
  Check,
  Calculator,
  LayoutList,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ActivityTimeline from '@/components/ActivityTimeline';
import ComplianceTrend from '@/components/ComplianceTrend';
import CoachingSummary from '@/components/CoachingSummary';
import SupplementCompliance from '@/components/SupplementCompliance';
// Wave 2 + Wave 3 coach components
import MacroAdherenceGauge from '@/components/coach/MacroAdherenceGauge';
import MacroSparklines from '@/components/coach/MacroSparklines';
import MacroDonut from '@/components/coach/MacroDonut';
import ConsistencyScore from '@/components/coach/ConsistencyScore';
import ClientHealthScore from '@/components/coach/ClientHealthScore';
import MoodTrend from '@/components/coach/MoodTrend';
import BehavioralSignals from '@/components/coach/BehavioralSignals';
import CoachingRoadmap from '@/components/coach/CoachingRoadmap';
import MealQualityTimeline from '@/components/coach/MealQualityTimeline';
import ProteinDistributionAnalyzer from '@/components/coach/ProteinDistributionAnalyzer';
import ClientFoodHeatmap from '@/components/coach/ClientFoodHeatmap';
import WeekendAnalysis from '@/components/coach/WeekendAnalysis';
import ProgressComparison from '@/components/coach/ProgressComparison';
import MeasurementChart from '@/components/coach/MeasurementChart';
import GoalProgressTracker from '@/components/coach/GoalProgressTracker';
import PlateauDetector from '@/components/coach/PlateauDetector';
import WorkoutVolumeChart from '@/components/coach/WorkoutVolumeChart';
import SmartNoteSuggestions from '@/components/coach/SmartNoteSuggestions';
import QuickActionsBar from '@/components/coach/QuickActionsBar';
import AutoMacroOptimizer from '@/components/coach/AutoMacroOptimizer';
import CalorieCyclingPlanner from '@/components/coach/CalorieCyclingPlanner';
import RecoveryScore from '@/components/coach/RecoveryScore';
import MealPatternView from '@/components/coach/MealPatternView';
import { localToday, localDateStr } from '../../../../lib/dates';
import { Icon } from '@/components/ui';
import type {
  Profile,
  ClientProfile,
  ClientHabit,
  HabitCheckin,
  Habit,
  FoodLogEntry,
  Measurement,
  CoachNote,
  SessionType,
} from '@/lib/types';

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const sessionLabels: Record<SessionType, string> = {
  check_in: 'Check-in',
  progression: 'Progression',
  concern: 'Concern',
  general: 'General',
};

const COACHING_TEMPLATES: { label: string; type: SessionType; text: string }[] = [
  {
    label: 'Initial Assessment',
    type: 'general',
    text: 'Client goals: ___ | Current habits: ___ | Main challenges: ___ | First habit recommendation: ___',
  },
  {
    label: 'Weekly Check-in',
    type: 'check_in',
    text: 'Adherence this week: ___/7 | Energy: ___/5 | Sleep: ___/5 | Challenges: ___ | Adjustments: ___',
  },
  {
    label: 'Habit Progression',
    type: 'progression',
    text: 'Completed habit: ___ | Days: ___/14 | Key learnings: ___ | Next habit: ___ | Rationale: ___',
  },
  {
    label: 'Concern/Flag',
    type: 'concern',
    text: 'Issue: ___ | Observed pattern: ___ | Recommended action: ___ | Follow-up date: ___',
  },
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════
// Streak Calendar (14 days)
// ═══════════════════════════════════════════════

function StreakCalendar({ checkins, startDate }: { checkins: HabitCheckin[]; startDate?: string }) {
  const days: { date: string; status: 'completed' | 'missed' | 'future' }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkinDates = new Set(
    checkins.filter((c) => c.completed).map((c) => c.checked_date)
  );

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);

    if (d > today) {
      days.push({ date: dateStr, status: 'future' });
    } else if (checkinDates.has(dateStr)) {
      days.push({ date: dateStr, status: 'completed' });
    } else {
      // Only mark as missed if after habit started
      const started = startDate ? new Date(startDate) : null;
      if (started && d >= started) {
        days.push({ date: dateStr, status: 'missed' });
      } else {
        days.push({ date: dateStr, status: 'future' });
      }
    }
  }

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => (
        <div
          key={day.date}
          className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-medium ${
            day.status === 'completed'
              ? 'bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30'
              : day.status === 'missed'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-white/[0.03] text-stone-600 border border-white/5'
          }`}
          title={`${day.date}: ${day.status}`}
        >
          {new Date(day.date).getDate()}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const clientId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [activeHabit, setActiveHabit] = useState<(ClientHabit & { habit?: Habit }) | null>(null);
  const [pastHabits, setPastHabits] = useState<(ClientHabit & { habit?: Habit })[]>([]);
  const [checkins, setCheckins] = useState<HabitCheckin[]>([]);
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Note form
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<SessionType>('check_in');
  const [savingNote, setSavingNote] = useState(false);

  // Macro targets editor
  const [editingMacros, setEditingMacros] = useState(false);
  const [macroForm, setMacroForm] = useState({
    target_calories: 0,
    target_protein_g: 0,
    target_carbs_g: 0,
    target_fat_g: 0,
    target_fiber_g: 0,
    target_water_ml: 0,
    goal: '' as string,
  });
  const [savingMacros, setSavingMacros] = useState(false);

  // Assign habit modal
  const [showAssign, setShowAssign] = useState(false);
  const [habitTemplates, setHabitTemplates] = useState<Habit[]>([]);

  // Auto-progression
  const [suggestedNextHabit, setSuggestedNextHabit] = useState<Habit | null>(null);
  const [assigningNext, setAssigningNext] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const threeDaysAgo = localDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
      const thirtyDaysAgo = localDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

      const [
        profileRes,
        clientProfileRes,
        habitsRes,
        checkinsRes,
        foodRes,
        measurementsRes,
        notesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
        supabase.from('client_profiles').select('*').eq('user_id', clientId).maybeSingle(),
        supabase.from('client_habits').select('*, habit:habits(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
        supabase.from('habit_checkins').select('*').eq('user_id', clientId).order('checked_date', { ascending: false }).limit(30),
        supabase.from('food_log').select('*').eq('user_id', clientId).gte('logged_date', threeDaysAgo).order('logged_date', { ascending: false }),
        supabase.from('measurements').select('*').eq('user_id', clientId).gte('measured_date', thirtyDaysAgo).order('measured_date', { ascending: true }),
        supabase.from('coach_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ]);

      setProfile(profileRes.data);
      setClientProfile(clientProfileRes.data);

      const allHabits = habitsRes.data || [];
      setActiveHabit(allHabits.find((h: ClientHabit) => h.status === 'active') || null);
      setPastHabits(allHabits.filter((h: ClientHabit) => h.status !== 'active'));
      setCheckins(checkinsRes.data || []);
      setFoodLog(foodRes.data || []);
      setMeasurements(measurementsRes.data || []);
      setNotes(notesRes.data || []);
    } catch (err) {
      console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-open assign modal if ?assign=1 (Feature 7)
  useEffect(() => {
    if (searchParams.get('assign') === '1' && !loading) {
      loadTemplates();
    }
  }, [loading, searchParams]);

  // Auto-suggest next habit when current one is mastered
  useEffect(() => {
    if (!activeHabit?.habit) return;
    const isReady = activeHabit.current_streak >= (activeHabit.habit.cycle_days || 14);
    if (!isReady) { setSuggestedNextHabit(null); return; }

    async function fetchNextHabit() {
      const currentOrder = activeHabit!.habit!.suggested_order ?? 0;
      const { data } = await supabase
        .from('habits')
        .select('*')
        .eq('is_template', true)
        .gt('suggested_order', currentOrder)
        .order('suggested_order', { ascending: true })
        .limit(1);

      if (data && data.length > 0) {
        setSuggestedNextHabit(data[0]);
      }
    }
    fetchNextHabit();
  }, [activeHabit]);

  // One-click assign next habit
  async function assignNextHabit() {
    if (!suggestedNextHabit || !activeHabit || assigningNext) return;
    setAssigningNext(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Mark current habit as completed
      await supabase.from('client_habits')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', activeHabit.id);

      // Create new client_habit with next template
      const { data } = await supabase.from('client_habits').insert({
        client_id: clientId,
        habit_id: suggestedNextHabit.id,
        assigned_by: user.id,
        status: 'active',
        started_at: new Date().toISOString(),
        current_streak: 0,
        best_streak: 0,
        total_completions: 0,
        sequence_number: (pastHabits.length || 0) + 2,
      }).select('*, habit:habits(*)').maybeSingle();

      if (data) {
        setPastHabits([{ ...activeHabit, status: 'completed' }, ...pastHabits]);
        setActiveHabit(data);
        setSuggestedNextHabit(null);
      }
    } catch (err) {
      console.error('Error assigning next habit:', err);
    } finally {
      setAssigningNext(false);
    }
  }

  async function saveNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from('coach_notes').insert({
        coach_id: user.id,
        client_id: clientId,
        note: newNote.trim(),
        session_type: noteType,
      }).select().maybeSingle();

      if (data) {
        setNotes([data, ...notes]);
        setNewNote('');
      }
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSavingNote(false);
    }
  }

  async function loadTemplates() {
    const { data } = await supabase.from('habits').select('*').eq('is_template', true).order('suggested_order');
    setHabitTemplates(data || []);
    setShowAssign(true);
  }

  async function assignHabit(habit: Habit) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Pause current active habit if exists
      if (activeHabit) {
        await supabase.from('client_habits').update({ status: 'paused' }).eq('id', activeHabit.id);
      }

      // Create new client_habit
      const { data } = await supabase.from('client_habits').insert({
        client_id: clientId,
        habit_id: habit.id,
        assigned_by: user.id,
        status: 'active',
        started_at: new Date().toISOString(),
        current_streak: 0,
        best_streak: 0,
        total_completions: 0,
        sequence_number: (pastHabits.length || 0) + 2,
      }).select('*, habit:habits(*)').maybeSingle();

      if (data) {
        setActiveHabit(data);
        setShowAssign(false);
      }
    } catch (err) {
      console.error('Error assigning habit:', err);
    }
  }

  async function progressHabit() {
    if (!activeHabit) return;
    await supabase.from('client_habits').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeHabit.id);
    setPastHabits([{ ...activeHabit, status: 'completed' }, ...pastHabits]);
    setActiveHabit(null);
    loadTemplates();
  }

  async function pauseHabit() {
    if (!activeHabit) return;
    await supabase.from('client_habits').update({ status: 'paused' }).eq('id', activeHabit.id);
    setPastHabits([{ ...activeHabit, status: 'paused' }, ...pastHabits]);
    setActiveHabit(null);
  }

  // ── Macro targets editor ──────────────────────────────────────────────────
  function startEditingMacros() {
    if (!clientProfile) return;
    setMacroForm({
      target_calories: clientProfile.target_calories || 0,
      target_protein_g: clientProfile.target_protein_g || 0,
      target_carbs_g: clientProfile.target_carbs_g || 0,
      target_fat_g: clientProfile.target_fat_g || 0,
      target_fiber_g: clientProfile.target_fiber_g || 0,
      target_water_ml: clientProfile.target_water_ml || 0,
      goal: clientProfile.goal || '',
    });
    setEditingMacros(true);
  }

  async function saveMacros() {
    if (!clientProfile || savingMacros) return;
    setSavingMacros(true);
    try {
      const { error } = await supabase
        .from('client_profiles')
        .update({
          target_calories: macroForm.target_calories || null,
          target_protein_g: macroForm.target_protein_g || null,
          target_carbs_g: macroForm.target_carbs_g || null,
          target_fat_g: macroForm.target_fat_g || null,
          target_fiber_g: macroForm.target_fiber_g || null,
          target_water_ml: macroForm.target_water_ml || null,
          goal: macroForm.goal || null,
        })
        .eq('user_id', clientId);

      if (!error) {
        setClientProfile({
          ...clientProfile,
          target_calories: macroForm.target_calories || null,
          target_protein_g: macroForm.target_protein_g || null,
          target_carbs_g: macroForm.target_carbs_g || null,
          target_fat_g: macroForm.target_fat_g || null,
          target_fiber_g: macroForm.target_fiber_g || null,
          target_water_ml: macroForm.target_water_ml || null,
          goal: (macroForm.goal || null) as ClientProfile['goal'],
        });
        setEditingMacros(false);
      } else {
        console.error('Error saving macros:', error);
      }
    } catch (err) {
      console.error('Error saving macros:', err);
    } finally {
      setSavingMacros(false);
    }
  }

  // Recalculate macros from client stats using nutrition engine formulas
  function recalcMacros() {
    if (!clientProfile) return;
    const weight = clientProfile.weight_kg || 70;
    const height = clientProfile.height_cm || 170;
    const age = clientProfile.age || 30;
    const sex = clientProfile.sex || 'male';
    const activity = clientProfile.activity_level || 'moderate';
    const goal = macroForm.goal || clientProfile.goal || 'maintenance';

    // Mifflin-St Jeor BMR
    const bmr = sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
    };
    const tdee = Math.round(bmr * (activityMultipliers[activity] || 1.55));

    // Goal adjustments
    const goalAdjustments: Record<string, number> = {
      fat_loss: -500, muscle_gain: 300, maintenance: 0, recomp: -200, endurance: 200, health: 0,
    };
    const targetCal = tdee + (goalAdjustments[goal] || 0);

    // ISSN protein targets
    const proteinPerKg = goal === 'muscle_gain' ? 2.0 : goal === 'fat_loss' ? 2.2 : 1.6;
    const proteinG = Math.round(weight * proteinPerKg);
    const fatG = Math.round((targetCal * 0.25) / 9);
    const carbsG = Math.round((targetCal - proteinG * 4 - fatG * 9) / 4);

    setMacroForm(prev => ({
      ...prev,
      target_calories: Math.round(targetCal),
      target_protein_g: proteinG,
      target_carbs_g: Math.max(carbsG, 50),
      target_fat_g: fatG,
      target_fiber_g: sex === 'male' ? 38 : 25,
      target_water_ml: Math.round(weight * 35),
    }));
  }

  // Group food by date
  const foodByDate: Record<string, FoodLogEntry[]> = {};
  foodLog.forEach((entry) => {
    const key = entry.logged_date;
    if (!foodByDate[key]) foodByDate[key] = [];
    foodByDate[key].push(entry);
  });

  // ═══════════════════════════════════════════════
  // Computed data for Wave 2 + Wave 3 components
  // ═══════════════════════════════════════════════

  const today = localToday();
  const todayEntries = foodLog.filter((e) => e.logged_date === today);
  const todayTotals = todayEntries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein_g || 0),
      carbs: acc.carbs + (e.carbs_g || 0),
      fat: acc.fat + (e.fat_g || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // MacroSparklines: last 7 days of each macro grouped by date
  const macroSparklineData = (() => {
    const byDate: Record<string, { cal: number; p: number; c: number; f: number }> = {};
    foodLog.forEach((e) => {
      if (!byDate[e.logged_date]) byDate[e.logged_date] = { cal: 0, p: 0, c: 0, f: 0 };
      byDate[e.logged_date].cal += e.calories || 0;
      byDate[e.logged_date].p += e.protein_g || 0;
      byDate[e.logged_date].c += e.carbs_g || 0;
      byDate[e.logged_date].f += e.fat_g || 0;
    });
    const dates = Object.keys(byDate).sort().slice(-7);
    return {
      calories: dates.map((d) => ({ date: d, value: Math.round(byDate[d].cal) })),
      protein: dates.map((d) => ({ date: d, value: Math.round(byDate[d].p) })),
      carbs: dates.map((d) => ({ date: d, value: Math.round(byDate[d].c) })),
      fat: dates.map((d) => ({ date: d, value: Math.round(byDate[d].f) })),
    };
  })();

  // ConsistencyScore
  const consistencyData = (() => {
    const loggedDates = new Set(foodLog.map((e) => e.logged_date));
    const daysLogged = loggedDates.size;
    const createdAt = clientProfile?.created_at;
    const daysSinceCreation = createdAt
      ? Math.max(1, Math.ceil((Date.now() - new Date(createdAt).getTime()) / 86400000))
      : 30;
    const totalDays = Math.min(daysSinceCreation, 30);
    const cycleDays = activeHabit?.habit?.cycle_days || 14;
    const habitAdherence = activeHabit
      ? Math.min(100, Math.round((activeHabit.current_streak / cycleDays) * 100))
      : 0;
    return { daysLogged, totalDays, avgMealScore: 65, habitAdherence };
  })();

  // ClientHealthScore: composite of consistency + adherence + streak
  const healthScore = Math.round(
    ((consistencyData.daysLogged / Math.max(consistencyData.totalDays, 1)) * 100 +
      consistencyData.habitAdherence +
      Math.min(100, (activeHabit?.current_streak || 0) * 7)) /
      3
  );

  // MoodTrend: from checkins moods
  const moodData = checkins
    .filter((c) => c.mood)
    .map((c) => ({
      date: c.checked_date,
      mood: c.mood as 'great' | 'good' | 'okay' | 'tough' | 'struggled',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  // BehavioralSignals
  const behavioralSignals = (() => {
    const signals: Array<{ emoji: string; text: string; severity: 'info' | 'warning' | 'positive' }> = [];
    const targetProtein = clientProfile?.target_protein_g || 0;
    if (targetProtein > 0 && todayTotals.protein < targetProtein * 0.7 && todayEntries.length > 0) {
      signals.push({ emoji: '🥩', text: `Protein low today (${Math.round(todayTotals.protein)}g vs ${targetProtein}g target)`, severity: 'warning' });
    }
    const loggedDates = new Set(foodLog.map((e) => e.logged_date));
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return localDateStr(d);
    });
    const missedDays = last7.filter((d) => !loggedDates.has(d)).length;
    if (missedDays >= 3) {
      signals.push({ emoji: '📋', text: `${missedDays} of last 7 days with no food logged`, severity: 'warning' });
    }
    if (activeHabit && activeHabit.current_streak >= 7) {
      signals.push({ emoji: '🔥', text: `${activeHabit.current_streak}-day habit streak — great consistency!`, severity: 'positive' });
    }
    if (signals.length === 0) {
      signals.push({ emoji: '✅', text: 'No flags detected — keep going!', severity: 'info' });
    }
    return signals;
  })();

  // CoachingRoadmap
  const roadmapHabits = [
    ...pastHabits.map((h) => ({
      name: h.habit?.name_en || 'Unknown',
      emoji: h.habit?.emoji || '📌',
      status: 'completed' as const,
    })),
    ...(activeHabit?.habit
      ? [{
          name: activeHabit.habit.name_en,
          emoji: activeHabit.habit.emoji,
          status: 'active' as const,
        }]
      : []),
  ];

  // MealQualityTimeline: today's food entries grouped by meal_type
  const mealQualityData = (() => {
    const mealGroups: Record<string, FoodLogEntry[]> = {};
    todayEntries.forEach((e) => {
      const key = e.meal_type || 'other';
      if (!mealGroups[key]) mealGroups[key] = [];
      mealGroups[key].push(e);
    });
    return Object.entries(mealGroups).map(([mealType, entries]) => {
      const totalCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
      const totalP = entries.reduce((s, e) => s + (e.protein_g || 0), 0);
      const score = Math.min(100, Math.round((totalP / Math.max(totalCal / 4, 1)) * 100));
      const grade = score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D';
      return {
        name: mealType.charAt(0).toUpperCase() + mealType.slice(1),
        score,
        grade: grade as 'A' | 'B' | 'C' | 'D',
        time: entries[0]?.created_at ? new Date(entries[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      };
    });
  })();

  // ProteinDistribution: today's food by meal_type
  const proteinDistribution = (() => {
    const mealGroups: Record<string, number> = {};
    todayEntries.forEach((e) => {
      const key = e.meal_type || 'other';
      mealGroups[key] = (mealGroups[key] || 0) + (e.protein_g || 0);
    });
    return Object.entries(mealGroups).map(([name, protein]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      protein: Math.round(protein),
    }));
  })();

  // ClientFoodHeatmap: from available foodLog dates (last 30 days)
  const foodHeatmapData = (() => {
    const countByDate: Record<string, number> = {};
    foodLog.forEach((e) => { countByDate[e.logged_date] = (countByDate[e.logged_date] || 0) + 1; });
    const days: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
      days.push({ date: dateStr, count: countByDate[dateStr] || 0 });
    }
    return days;
  })();

  // WeekendAnalysis
  const weekendAnalysisData = (() => {
    const weekday: { cal: number[]; p: number[]; meals: number[] } = { cal: [], p: [], meals: [] };
    const weekend: { cal: number[]; p: number[]; meals: number[] } = { cal: [], p: [], meals: [] };
    const byDate: Record<string, { cal: number; p: number; count: number }> = {};
    foodLog.forEach((e) => {
      if (!byDate[e.logged_date]) byDate[e.logged_date] = { cal: 0, p: 0, count: 0 };
      byDate[e.logged_date].cal += e.calories || 0;
      byDate[e.logged_date].p += e.protein_g || 0;
      byDate[e.logged_date].count += 1;
    });
    Object.entries(byDate).forEach(([date, data]) => {
      const dayOfWeek = new Date(date).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const target = isWeekend ? weekend : weekday;
      target.cal.push(data.cal);
      target.p.push(data.p);
      target.meals.push(data.count);
    });
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    return {
      weekday: { avgCalories: avg(weekday.cal), avgProtein: avg(weekday.p), mealsPerDay: +(weekday.meals.length ? (weekday.meals.reduce((a, b) => a + b, 0) / weekday.meals.length).toFixed(1) : 0) },
      weekend: { avgCalories: avg(weekend.cal), avgProtein: avg(weekend.p), mealsPerDay: +(weekend.meals.length ? (weekend.meals.reduce((a, b) => a + b, 0) / weekend.meals.length).toFixed(1) : 0) },
    };
  })();

  // ProgressComparison: this week vs last week
  const progressComparisonData = (() => {
    const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const thisWeekStr = localDateStr(startOfWeek);
    const lastWeekStr = localDateStr(startOfLastWeek);

    const thisWeekEntries = foodLog.filter((e) => e.logged_date >= thisWeekStr);
    const lastWeekEntries = foodLog.filter((e) => e.logged_date >= lastWeekStr && e.logged_date < thisWeekStr);

    const calcWeek = (entries: FoodLogEntry[]) => {
      if (entries.length === 0) return { avgCalories: 0, avgProtein: 0, adherence: 0, weight: 0 };
      const dates = new Set(entries.map((e) => e.logged_date));
      const totalCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
      const totalP = entries.reduce((s, e) => s + (e.protein_g || 0), 0);
      const daysCount = dates.size || 1;
      const latestMeasurement = measurements.length > 0 ? measurements[measurements.length - 1].weight_kg || 0 : 0;
      return {
        avgCalories: Math.round(totalCal / daysCount),
        avgProtein: Math.round(totalP / daysCount),
        adherence: Math.min(100, Math.round((daysCount / 7) * 100)),
        weight: latestMeasurement,
      };
    };
    return { thisWeek: calcWeek(thisWeekEntries), lastWeek: calcWeek(lastWeekEntries) };
  })();

  // GoalProgressTracker
  const goalProgressData = (() => {
    const currentWeight = clientProfile?.weight_kg || 0;
    const goal = clientProfile?.goal || 'maintenance';
    const targetWeight = goal === 'fat_loss' ? currentWeight - 5 : goal === 'muscle_gain' ? currentWeight + 5 : currentWeight;
    const startWeight = measurements.length > 0 ? measurements[0].weight_kg || currentWeight : currentWeight;
    return { goal: goal, startValue: startWeight, targetValue: targetWeight, currentValue: currentWeight, unit: 'kg' };
  })();

  // PlateauDetector
  const plateauData = (() => {
    if (measurements.length < 3) return { detected: false, daysSinceChange: 0, currentWeight: clientProfile?.weight_kg || 0, targetWeight: goalProgressData.targetValue };
    const recent = measurements.slice(-7);
    const weights = recent.filter((m) => m.weight_kg !== null).map((m) => m.weight_kg!);
    if (weights.length < 2) return { detected: false, daysSinceChange: 0, currentWeight: clientProfile?.weight_kg || 0, targetWeight: goalProgressData.targetValue };
    const range = Math.max(...weights) - Math.min(...weights);
    const firstDate = new Date(recent[0].measured_date);
    const lastDate = new Date(recent[recent.length - 1].measured_date);
    const daySpan = Math.ceil((lastDate.getTime() - firstDate.getTime()) / 86400000);
    return {
      detected: range < 0.5 && daySpan >= 14,
      daysSinceChange: daySpan,
      currentWeight: weights[weights.length - 1],
      targetWeight: goalProgressData.targetValue,
    };
  })();

  // SmartNoteSuggestions
  const noteSuggestions = (() => {
    const suggestions: Array<{ emoji: string; text: string; type: 'concern' | 'progression' | 'check_in' }> = [];
    if (activeHabit && activeHabit.current_streak >= (activeHabit.habit?.cycle_days || 14)) {
      suggestions.push({ emoji: '🎯', text: `${profile?.full_name} completed ${activeHabit.habit?.name_en} cycle — ready for progression!`, type: 'progression' });
    }
    if (behavioralSignals.some((s) => s.severity === 'warning')) {
      suggestions.push({ emoji: '⚠️', text: 'Behavioral flags detected — consider addressing in next check-in', type: 'concern' });
    }
    if (plateauData.detected) {
      suggestions.push({ emoji: '📊', text: `Weight plateau detected (${plateauData.daysSinceChange}d) — review nutrition plan`, type: 'concern' });
    }
    if (suggestions.length === 0) {
      suggestions.push({ emoji: '📝', text: 'Schedule a routine weekly check-in', type: 'check_in' });
    }
    return suggestions;
  })();

  // AutoMacroOptimizer: compare avg intake vs targets
  const autoMacroData = (() => {
    const current = {
      calories: Math.round(todayTotals.calories),
      protein: Math.round(todayTotals.protein),
      carbs: Math.round(todayTotals.carbs),
      fat: Math.round(todayTotals.fat),
    };
    const recommended = {
      calories: clientProfile?.target_calories || 2000,
      protein: clientProfile?.target_protein_g || 150,
      carbs: clientProfile?.target_carbs_g || 250,
      fat: clientProfile?.target_fat_g || 65,
    };
    const diffs: string[] = [];
    if (current.protein > 0 && current.protein < recommended.protein * 0.8) diffs.push('protein below target');
    if (current.calories > 0 && current.calories > recommended.calories * 1.1) diffs.push('calories above target');
    const reason = diffs.length > 0 ? `Based on recent intake: ${diffs.join(', ')}` : 'Current intake aligns well with targets';
    return { current, recommended, reason };
  })();

  // CalorieCyclingPlanner
  const [cyclingDays, setCyclingDays] = useState<Array<{ day: string; level: 'high' | 'medium' | 'low' | 'rest'; calories: number }>>([]);
  useEffect(() => {
    if (!clientProfile?.target_calories) return;
    const base = clientProfile.target_calories;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const levels: Array<'high' | 'medium' | 'low' | 'rest'> = ['high', 'medium', 'high', 'medium', 'high', 'low', 'rest'];
    const multipliers: Record<string, number> = { high: 1.1, medium: 1.0, low: 0.85, rest: 0.75 };
    setCyclingDays(dayNames.map((day, i) => ({
      day,
      level: levels[i],
      calories: Math.round(base * multipliers[levels[i]]),
    })));
  }, [clientProfile?.target_calories]);

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="h-10 w-48 rounded bg-stone-800/60 animate-pulse" />
          <div className="glass p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-stone-800/60 animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-32 rounded bg-stone-800/60 animate-pulse" />
                <div className="h-3 w-48 rounded bg-stone-800/40 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass p-4 space-y-2">
                <div className="h-6 w-12 rounded bg-stone-800/60 animate-pulse" />
                <div className="h-3 w-16 rounded bg-stone-800/40 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !clientProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-500">
        Client not found
      </div>
    );
  }

  const goalLabels: Record<string, string> = {
    fat_loss: 'Fat Loss', muscle_gain: 'Muscle Gain', maintenance: 'Maintenance',
    recomp: 'Recomposition', endurance: 'Endurance', health: 'Health',
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* ─── Handoff Screen 05 header ─── */}
          {/* Back row */}
          <div className="row-b mb-3">
            <button onClick={() => router.back()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
              <Icon name="i-chev-l" size={16} />
            </button>
            <span className="eye-d">Client</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
              <Icon name="i-more" size={16} />
            </button>
          </div>

          {/* Client identity row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <div className="av-lg">{profile.full_name?.[0]?.toUpperCase() ?? '?'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--t1)' }}>
                {profile.full_name}
              </div>
              <div className="ds-sub">
                {clientProfile.coaching_phase} · {profile.email}
              </div>
            </div>
            <div className="row-i" style={{ gap: 6 }}>
              <CoachingSummary
                profile={profile} clientProfile={clientProfile}
                activeHabit={activeHabit} pastHabits={pastHabits} notes={notes}
              />
              <Link
                href={`/coach/client/${clientId}/plan`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(212,168,83,.3)',
                  background: 'rgba(212,168,83,.08)',
                  color: 'var(--gold-300,#D4A853)',
                  textDecoration: 'none',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                <LayoutList size={11} />
                Plan
              </Link>
              <span className="tag tag-g" style={{ fontSize: 8 }}>{clientProfile.coaching_phase}</span>
            </div>
          </div>

          {/* ─── Macro Targets (editable by coach) ─── */}
          <div className="card-g p-4 mb-4">
            {/* ─── Macro Targets ─── */}
            {editingMacros ? (
              <div id="macro-editor" className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-[#D4A853]/20 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#D4A853] uppercase tracking-wider">Edit Macro Targets</h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={recalcMacros}
                      className="text-xs text-stone-400 hover:text-[#D4A853] flex items-center gap-1 px-2 py-1 rounded-lg border border-white/5 hover:border-[#D4A853]/30 transition-all"
                      title="Recalculate from client stats"
                    >
                      <Calculator size={12} />
                      Auto-calc
                    </button>
                  </div>
                </div>
                {/* Goal selector */}
                <div>
                  <label className="text-[10px] text-stone-500 mb-1 block">Goal</label>
                  <select
                    value={macroForm.goal}
                    onChange={e => setMacroForm(prev => ({ ...prev, goal: e.target.value }))}
                    className="input-dark w-full text-sm py-2"
                  >
                    <option value="">Not set</option>
                    {Object.entries(goalLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                {/* Macro inputs grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {([
                    ['target_calories', 'Calories', 'kcal'],
                    ['target_protein_g', 'Protein', 'g'],
                    ['target_carbs_g', 'Carbs', 'g'],
                    ['target_fat_g', 'Fat', 'g'],
                    ['target_fiber_g', 'Fiber', 'g'],
                    ['target_water_ml', 'Water', 'ml'],
                  ] as const).map(([key, label, unit]) => (
                    <div key={key}>
                      <label className="text-[10px] text-stone-500 mb-0.5 block">{label}</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={macroForm[key] || ''}
                          onChange={e => setMacroForm(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                          className="input-dark w-full text-sm py-2 text-center pr-6"
                          placeholder="0"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-stone-600">{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Save / Cancel */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveMacros}
                    disabled={savingMacros}
                    className="btn-gold flex-1 py-2 text-sm flex items-center justify-center gap-1.5"
                  >
                    <Check size={14} />
                    {savingMacros ? 'Saving...' : 'Save Targets'}
                  </button>
                  <button
                    onClick={() => setEditingMacros(false)}
                    className="btn-ghost flex-1 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <div className="text-xs text-stone-500">Goal</div>
                    <div className="text-sm font-medium text-stone-200">
                      {clientProfile.goal ? goalLabels[clientProfile.goal] || clientProfile.goal : '---'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">Calories</div>
                    <div className="text-sm font-medium text-stone-200">
                      {clientProfile.target_calories || '---'} kcal
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">Protein</div>
                    <div className="text-sm font-medium text-stone-200">
                      {clientProfile.target_protein_g || '---'}g
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">Carbs / Fat</div>
                    <div className="text-sm font-medium text-stone-200">
                      {clientProfile.target_carbs_g || '---'}g / {clientProfile.target_fat_g || '---'}g
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">Weight</div>
                    <div className="text-sm font-medium text-stone-200">
                      {clientProfile.weight_kg || '---'} kg
                    </div>
                  </div>
                </div>
                <button
                  onClick={startEditingMacros}
                  className="mt-3 text-xs text-stone-500 hover:text-[#D4A853] flex items-center gap-1.5 transition-colors"
                >
                  <Pencil size={12} />
                  Edit macro targets
                </button>
              </div>
            )}

            {/* ─── Wave 2+3: Header Analytics ─── */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="glass p-4">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Today&apos;s Adherence</p>
                <MacroAdherenceGauge
                  consumed={{ calories: Math.round(todayTotals.calories), protein: Math.round(todayTotals.protein) }}
                  targets={{ calories: clientProfile.target_calories || 2000, protein: clientProfile.target_protein_g || 150 }}
                />
              </div>
              <div className="glass p-4">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">P / C / F Split</p>
                <MacroDonut
                  protein={Math.round(todayTotals.protein)}
                  carbs={Math.round(todayTotals.carbs)}
                  fat={Math.round(todayTotals.fat)}
                />
              </div>
              <div className="glass p-4 flex flex-col items-center justify-center">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Health Score</p>
                <ClientHealthScore score={healthScore} label="Overall" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass p-4">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Consistency</p>
                <ConsistencyScore
                  daysLogged={consistencyData.daysLogged}
                  totalDays={consistencyData.totalDays}
                  avgMealScore={consistencyData.avgMealScore}
                  habitAdherence={consistencyData.habitAdherence}
                />
              </div>
              <div className="glass p-4">
                <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-2">7-Day Macro Trends</p>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-stone-500">Calories</span>
                    <MacroSparklines data={macroSparklineData.calories} color="#D4A853" />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-500">Protein</span>
                    <MacroSparklines data={macroSparklineData.protein} color="#ef4444" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Progression Banner ═══ */}
          {activeHabit?.habit && activeHabit.current_streak >= (activeHabit.habit.cycle_days || 14) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass celebration-glow gold-border p-5 mb-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <Icon name="i-target" size={28} className="text-[#D4A853] flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-bold text-[#D4A853] text-lg">Ready for Progression!</h3>
                  <p className="text-stone-400 text-xs mt-0.5">
                    {profile?.full_name} completed the {activeHabit.habit.cycle_days}-day cycle for {activeHabit.habit.name_en}
                  </p>
                </div>
              </div>
              {suggestedNextHabit ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-xl">{suggestedNextHabit.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-200">
                      Suggested next: {suggestedNextHabit.name_en}
                    </div>
                    <div className="text-xs text-stone-500">
                      {suggestedNextHabit.cycle_days}d cycle - {suggestedNextHabit.difficulty}
                    </div>
                  </div>
                  <button
                    onClick={assignNextHabit}
                    disabled={assigningNext}
                    className="btn-gold !py-2 !px-4 text-xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ChevronRight size={14} />
                    {assigningNext ? 'Assigning...' : 'Assign Next'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={loadTemplates}
                  className="btn-gold w-full text-sm py-2.5 flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Choose Next Habit Manually
                </button>
              )}
            </motion.div>
          )}

          {/* ─── Active Habit ─── */}
          <div className="glass p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-stone-200 flex items-center gap-2">
                <Flame size={16} className="text-[#D4A853]" />
                Active Habit
              </h2>
              <div className="flex gap-1.5">
                {activeHabit && (
                  <>
                    <button onClick={progressHabit} className="text-xs btn-gold !py-1.5 !px-3 flex items-center gap-1">
                      <ChevronRight size={12} /> Progress
                    </button>
                    <button onClick={pauseHabit} className="text-xs btn-ghost !py-1.5 !px-3 flex items-center gap-1">
                      <Pause size={12} /> Pause
                    </button>
                  </>
                )}
                <button onClick={loadTemplates} className="text-xs btn-ghost !py-1.5 !px-3 flex items-center gap-1">
                  <Plus size={12} /> Assign
                </button>
              </div>
            </div>

            {activeHabit?.habit ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{activeHabit.habit.emoji}</span>
                  <div>
                    <div className="font-medium text-stone-100">{activeHabit.habit.name_en}</div>
                    <div className="text-xs text-stone-500">
                      Day {activeHabit.current_streak} of {activeHabit.habit.cycle_days}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-4 text-xs text-stone-400">
                  <span className="flex items-center gap-1"><Flame size={12} className="text-orange-400" /> Streak: {activeHabit.current_streak}</span>
                  <span className="flex items-center gap-1"><Trophy size={12} className="text-[#D4A853]" /> Best: {activeHabit.best_streak}</span>
                  <span className="flex items-center gap-1"><Calendar size={12} /> Total: {activeHabit.total_completions}</span>
                </div>
                {/* Streak Calendar */}
                <StreakCalendar
                  checkins={checkins.filter((c) => c.client_habit_id === activeHabit.id)}
                  startDate={activeHabit.started_at}
                />

                {/* Compliance Trend Heatmap */}
                <div className="mt-4 pt-3 border-t border-white/5">
                  <p className="text-stone-500 text-xs mb-2 uppercase tracking-wider font-semibold">14-Day Compliance</p>
                  <ComplianceTrend
                    clientHabitId={activeHabit.id}
                    startDate={activeHabit.started_at}
                    checkins={checkins.filter((c) => c.client_habit_id === activeHabit.id)}
                  />
                </div>
              </div>
            ) : (
              <p className="text-stone-600 text-sm text-center py-4">No active habit assigned</p>
            )}
          </div>

          {/* ─── Supplement Compliance (Feature 9) ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Pill size={16} className="text-[#D4A853]" />
              Supplement Compliance (This Week)
            </h2>
            <SupplementCompliance clientId={clientId} />
          </div>

          {/* ─── Wave 2+3: Mood, Behavior, Roadmap ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Mood Trend</h2>
              {moodData.length > 0 ? (
                <MoodTrend moods={moodData} />
              ) : (
                <p className="text-stone-600 text-sm text-center py-4">No mood data from check-ins yet</p>
              )}
            </div>
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Behavioral Signals</h2>
              <BehavioralSignals signals={behavioralSignals} />
            </div>
          </div>

          {roadmapHabits.length > 0 && (
            <div className="glass p-5 mb-4">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Coaching Roadmap</h2>
              <CoachingRoadmap habits={roadmapHabits} />
            </div>
          )}

          {/* ─── Food Log (Pattern + Daily views) ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-[#D4A853]" />
              Recent Food Log
            </h2>
            <MealPatternView entries={foodLog} />
          </div>

          {/* ─── Wave 2+3: Food Analysis ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Meal Quality (Today)</h2>
              {mealQualityData.length > 0 ? (
                <MealQualityTimeline meals={mealQualityData} />
              ) : (
                <p className="text-stone-600 text-sm text-center py-4">No meals logged today</p>
              )}
            </div>
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Protein Distribution</h2>
              {proteinDistribution.length > 0 ? (
                <ProteinDistributionAnalyzer meals={proteinDistribution} />
              ) : (
                <p className="text-stone-600 text-sm text-center py-4">No meals logged today</p>
              )}
            </div>
          </div>

          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-3 text-sm">Food Logging Heatmap (30d)</h2>
            <ClientFoodHeatmap data={foodHeatmapData} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Weekday vs Weekend</h2>
              <WeekendAnalysis weekday={weekendAnalysisData.weekday} weekend={weekendAnalysisData.weekend} />
            </div>
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">This Week vs Last</h2>
              <ProgressComparison thisWeek={progressComparisonData.thisWeek} lastWeek={progressComparisonData.lastWeek} />
            </div>
          </div>

          {/* ─── Weight / Body Composition (enhanced) ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#D4A853]" />
              Weight &amp; Body Composition (30d)
            </h2>
            <MeasurementChart measurements={measurements.map((m) => ({ date: m.measured_date, weight: m.weight_kg, bodyFat: m.body_fat_pct }))} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Goal Progress</h2>
              <GoalProgressTracker
                goal={goalProgressData.goal}
                startValue={goalProgressData.startValue}
                targetValue={goalProgressData.targetValue}
                currentValue={goalProgressData.currentValue}
                unit={goalProgressData.unit}
              />
            </div>
            <div className="glass p-5">
              <h2 className="font-semibold text-stone-200 mb-3 text-sm">Plateau Detection</h2>
              <PlateauDetector
                detected={plateauData.detected}
                daysSinceChange={plateauData.daysSinceChange}
                currentWeight={plateauData.currentWeight}
                targetWeight={plateauData.targetWeight}
              />
            </div>
          </div>

          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-3 text-sm">Workout Volume</h2>
            <WorkoutVolumeChart weeks={[
              { weekLabel: '4 weeks ago', totalSets: 0, totalReps: 0 },
              { weekLabel: '3 weeks ago', totalSets: 0, totalReps: 0 },
              { weekLabel: '2 weeks ago', totalSets: 0, totalReps: 0 },
              { weekLabel: 'Last week', totalSets: 0, totalReps: 0 },
            ]} />
          </div>

          {/* ─── Coach Notes ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4">Coach Notes</h2>

            {/* Add note form */}
            <div className="mb-4">
              {/* Template selector */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={12} className="text-stone-500" />
                  <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">Template</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {COACHING_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.label}
                      onClick={() => {
                        setNewNote(tmpl.text);
                        setNoteType(tmpl.type);
                      }}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/5 text-stone-400 hover:border-[#D4A853]/30 hover:text-[#D4A853] hover:bg-[#D4A853]/5 transition-all"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mb-2">
                {(['check_in', 'progression', 'concern', 'general'] as SessionType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNoteType(t)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      noteType === t
                        ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                        : 'border-stone-800 text-stone-500 hover:border-stone-700'
                    }`}
                  >
                    {sessionLabels[t]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Write a coaching note or select a template..."
                  className="input-dark flex-1 min-h-[60px] resize-none text-sm"
                  rows={3}
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote || !newNote.trim()}
                  className="btn-gold self-end !p-3 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-stone-600 text-sm text-center py-2">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-xl bg-white/[0.03] text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-stone-400">
                        {note.session_type ? sessionLabels[note.session_type] : 'Note'}
                      </span>
                      <span className="text-[10px] text-stone-600">
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                    <p className="text-stone-300 whitespace-pre-wrap">{note.note}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── Smart Note Suggestions ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-3 text-sm">Smart Suggestions</h2>
            <SmartNoteSuggestions
              suggestions={noteSuggestions}
              onSelect={(text) => setNewNote(text)}
            />
          </div>

          {/* ─── Activity Timeline ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-[#D4A853]" />
              Activity Timeline
            </h2>
            <ActivityTimeline
              checkins={checkins}
              notes={notes}
              measurements={measurements}
              habits={[...(activeHabit ? [activeHabit] : []), ...pastHabits]}
            />
          </div>

          {/* ─── Wave 2+3: Smart Tools ─── */}
          <div className="glass p-5 mb-4">
            <h2 className="font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Calculator size={16} className="text-[#D4A853]" />
              Smart Tools
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Auto Macro Optimizer</h3>
                <AutoMacroOptimizer
                  current={autoMacroData.current}
                  recommended={autoMacroData.recommended}
                  reason={autoMacroData.reason}
                />
              </div>
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Calorie Cycling Planner</h3>
                {cyclingDays.length > 0 ? (
                  <CalorieCyclingPlanner days={cyclingDays} onChange={setCyclingDays} />
                ) : (
                  <p className="text-stone-600 text-sm text-center py-4">Set calorie target to enable cycling planner</p>
                )}
              </div>
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Recovery Score</h3>
                <RecoveryScore
                  sleepScore={70}
                  moodScore={moodData.length > 0 ? Math.round((moodData.filter((m) => m.mood === 'great' || m.mood === 'good').length / moodData.length) * 100) : 50}
                  trainingLoad={50}
                />
              </div>
            </div>
          </div>

          {/* ─── Past Habits ─── */}
          {pastHabits.length > 0 && (
            <div className="glass p-5 mb-4">
              <h2 className="font-semibold text-stone-200 mb-3">Habit History</h2>
              <div className="space-y-2">
                {pastHabits.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] text-sm">
                    <div className="flex items-center gap-2">
                      <span>{h.habit?.emoji}</span>
                      <span className="text-stone-300">{h.habit?.name_en}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-stone-500">
                        {h.total_completions} days | Best: {h.best_streak}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        h.status === 'completed'
                          ? 'bg-green-500/10 text-green-400'
                          : h.status === 'paused'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-stone-800 text-stone-500'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* ─── Quick Actions Bar (floating bottom) ─── */}
        <QuickActionsBar
          onAssignHabit={loadTemplates}
          onSetMacros={() => {
            startEditingMacros();
            requestAnimationFrame(() => {
              document.getElementById('macro-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }}
          onAddNote={() => {
            const el = document.querySelector('textarea');
            if (el) { el.scrollIntoView({ behavior: 'smooth' }); el.focus(); }
          }}
          onExport={() => {
            const lines: string[] = [];
            const name = profile?.full_name || profile?.email || 'Client';
            const today = new Date().toISOString().slice(0, 10);
            lines.push(`# ${name} — Coach Report`, `_${today}_`, '');
            if (clientProfile) {
              lines.push('## Profile');
              lines.push(`- Goal: ${clientProfile.goal || '—'}`);
              lines.push(`- Phase: ${clientProfile.coaching_phase || '—'}`);
              if (clientProfile.weight_kg) lines.push(`- Weight: ${clientProfile.weight_kg} kg`);
              if (clientProfile.height_cm) lines.push(`- Height: ${clientProfile.height_cm} cm`);
              lines.push('');
              lines.push('## Macro Targets');
              lines.push(`- Calories: ${clientProfile.target_calories || '—'} kcal`);
              lines.push(`- Protein: ${clientProfile.target_protein_g || '—'} g`);
              lines.push(`- Carbs: ${clientProfile.target_carbs_g || '—'} g`);
              lines.push(`- Fat: ${clientProfile.target_fat_g || '—'} g`);
              lines.push(`- Fiber: ${clientProfile.target_fiber_g || '—'} g`);
              lines.push(`- Water: ${clientProfile.target_water_ml || '—'} ml`);
              lines.push('');
            }
            if (activeHabit?.habit) {
              lines.push('## Active Habit');
              lines.push(`- ${activeHabit.habit.emoji || ''} ${activeHabit.habit.name_en || ''}`);
              lines.push(`- Streak: ${activeHabit.current_streak || 0} (best ${activeHabit.best_streak || 0}, ${activeHabit.total_completions || 0} total)`);
              lines.push('');
            }
            if (notes && notes.length > 0) {
              lines.push('## Recent Notes');
              notes.slice(0, 10).forEach((n) => {
                const when = n.created_at ? new Date(n.created_at).toISOString().slice(0, 10) : '';
                lines.push(`- **${when}** (${n.session_type || 'note'}): ${n.note || ''}`);
              });
              lines.push('');
            }
            const md = lines.join('\n');
            const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safe}-report-${today}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
        />

        {/* ─── Assign Habit Modal ─── */}
        {showAssign && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-md max-h-[70vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-100">Assign Habit</h3>
                <button onClick={() => setShowAssign(false)} className="text-stone-500 hover:text-stone-300">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-2">
                {habitTemplates.length === 0 ? (
                  <p className="text-stone-600 text-sm text-center py-4">No habit templates found</p>
                ) : (
                  habitTemplates.map((habit) => (
                    <button
                      key={habit.id}
                      onClick={() => assignHabit(habit)}
                      className="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3"
                    >
                      <span className="text-xl">{habit.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-200">{habit.name_en}</div>
                        <div className="text-xs text-stone-500 flex items-center gap-2">
                          <span className="capitalize">{habit.category}</span>
                          <span>-</span>
                          <span>{habit.cycle_days}d cycle</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        habit.difficulty === 'beginner'
                          ? 'bg-green-500/10 text-green-400'
                          : habit.difficulty === 'intermediate'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {habit.difficulty}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
