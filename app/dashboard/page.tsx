'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui';
import { BotNav } from '@/components/ui/BotNav';
import { supabase } from '@/lib/supabase';
import type { ClientProfile, ClientHabit, HabitCheckin, FoodLogEntry, WaterLogEntry, Mood, Profile } from '@/lib/types';
import WeeklyCheckin from '@/components/WeeklyCheckin';
import { DashboardSkeleton } from '@/components/Skeleton';
import HabitDetailModal from '@/components/HabitDetailModal';
import { localToday } from '../../lib/dates';

// ─── Greeting (no emojis — handoff spec) ───────────────────────
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

// ─── Compact 72px calorie ring ──────────────────────────────────
function CompactRing({ value, target }: { value: number; target: number }) {
  const r = 30;
  const C = 2 * Math.PI * r; // ≈ 188.5
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <svg width={72} height={72} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={6} />
      <motion.circle
        cx={36} cy={36} r={r}
        fill="none" stroke="var(--gold-300,#D4A853)"
        strokeWidth={6} strokeLinecap="round"
        strokeDasharray={C}
        initial={{ strokeDashoffset: C }}
        animate={{ strokeDashoffset: C * (1 - pct) }}
        transition={{ type: 'spring', stiffness: 40, damping: 14, delay: 0.25 }}
      />
    </svg>
  );
}

// ─── Compact inline macro bar ────────────────────────────────────
function MacroLine({
  label, value, target, color, unit = 'g',
}: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)', width: 14 }}>{label}</span>
      <div className="mb-track" style={{ flex: 1 }}>
        <div className="mb-fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)', width: 34, textAlign: 'right' }}>
        {Math.round(value)}{unit}
      </span>
    </div>
  );
}

// ─── Habit → SVG icon mapping ────────────────────────────────────
function habitIconName(emoji?: string): Parameters<typeof Icon>[0]['name'] {
  if (!emoji) return 'i-target';
  if (emoji.includes('💧') || emoji.includes('🥤') || emoji.includes('💦')) return 'i-drop';
  if (emoji.includes('🏋') || emoji.includes('💪') || emoji.includes('🤸')) return 'i-dumbbell';
  if (emoji.includes('🌙') || emoji.includes('😴') || emoji.includes('🛌')) return 'i-moon';
  if (emoji.includes('🧘') || emoji.includes('🧠')) return 'i-meditate';
  if (emoji.includes('🍎') || emoji.includes('🥗') || emoji.includes('🥦')) return 'i-leaf';
  if (emoji.includes('🔥') || emoji.includes('⚡')) return 'i-zap';
  return 'i-target';
}

// ─── Client bottom nav ───────────────────────────────────────────
const CLIENT_NAV = [
  { href: '/dashboard',          label: 'Home',     icon: <Icon name="i-home"  size={18} /> },
  { href: '/dashboard/log',      label: 'Log',      icon: <Icon name="i-book"  size={18} /> },
  { href: '/dashboard/progress', label: 'Progress', icon: <Icon name="i-chart" size={18} /> },
  { href: '/dashboard/profile',  label: 'Me',       icon: <Icon name="i-user"  size={18} /> },
];

// ─── Celebration modal (kept from v0.2) ──────────────────────────
const CONFETTI_COLORS = ['#D4A853','#E8C878','#22c55e','#3b82f6','#a855f7','#ef4444','#f59e0b'];
// Pre-computed at module load — Math.random() is not allowed during render (react-hooks/purity)
const CONFETTI_PARTICLES = Array.from({ length: 30 }).map((_, i) => ({
  left: `${Math.random() * 100}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  width: `${6 + Math.random() * 8}px`,
  height: `${6 + Math.random() * 8}px`,
  delay: `${Math.random() * 1.5}s`,
  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
}));

interface CelebProps {
  streakDays: number; cycleDays: number; completionPct: number;
  habitName?: string; bestStreak?: number; onDismiss: () => void;
}
function CelebrationModal({ streakDays, cycleDays, completionPct, habitName, bestStreak, onDismiss }: CelebProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onDismiss}
    >
      {CONFETTI_PARTICLES.map((p, i) => (
        <div key={i} className="confetti-particle"
          style={{ left: p.left, backgroundColor: p.color,
            width: p.width, height: p.height,
            animationDelay: p.delay, borderRadius: p.borderRadius }} />
      ))}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="glass-elevated celebration-glow p-8 max-w-sm w-full text-center relative"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold gold-text mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          Habit Mastered!
        </h2>
        <p className="text-stone-400 text-sm mb-6">
          You completed the {cycleDays}-day cycle
          {habitName && <> for <span className="text-stone-200 font-medium">{habitName}</span></>}
        </p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[['Days', streakDays], ['Completion', `${Math.min(completionPct, 100)}%`], ['Best', bestStreak ?? '—']].map(([l, v]) => (
            <div key={String(l)} className="glass p-3 rounded-xl">
              <div className="text-lg font-bold text-stone-100">{v}</div>
              <div className="text-[10px] text-stone-500 uppercase tracking-wider">{l}</div>
            </div>
          ))}
        </div>
        <p className="text-stone-500 text-xs mb-6">Your coach will assign your next challenge</p>
        <button onClick={onDismiss} className="btn-gold w-full text-sm py-3">Continue</button>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading]               = useState(true);
  const [clientProfile, setClientProfile]   = useState<ClientProfile | null>(null);
  const [activeHabit, setActiveHabit]       = useState<ClientHabit | null>(null);
  const [todayCheckin, setTodayCheckin]     = useState<HabitCheckin | null>(null);
  const [foodLog, setFoodLog]               = useState<FoodLogEntry[]>([]);
  const [waterLog, setWaterLog]             = useState<WaterLogEntry[]>([]);
  const [userId, setUserId]                 = useState<string | null>(null);
  const [userProfile, setUserProfile]       = useState<Profile | null>(null);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [allCheckins, setAllCheckins]       = useState<HabitCheckin[]>([]);
  const [submitting, setSubmitting]         = useState(false);
  const [showCelebration, setShowCelebration]   = useState(false);
  const [celebrationChecked, setCelebrationChecked] = useState(false);
  const [addingWater, setAddingWater]       = useState(false);
  const [theme, setTheme]                   = useState<'dark' | 'light'>('dark');

  const today = localToday();

  // ─── Theme toggle ──────────────────────────────────────────────
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('light', next === 'light');
      localStorage.setItem('trophe-theme', next);
      return next;
    });
  }, []);

  // ─── Load saved theme ─────────────────────────────────────────
  const themeLoaded = useRef(false);
  useEffect(() => {
    if (themeLoaded.current) return;
    themeLoaded.current = true;
    const saved = localStorage.getItem('trophe-theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('light', saved === 'light');
    }
  }, []);

  // ─── Derived totals ───────────────────────────────────────────
  const totalCalories = foodLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein  = foodLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs    = foodLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat      = foodLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);
  const totalWater    = waterLog.reduce((s, w) => s + w.amount_ml, 0);

  const targetCalories = clientProfile?.target_calories ?? 2000;
  const targetProtein  = clientProfile?.target_protein_g ?? 150;
  const targetCarbs    = clientProfile?.target_carbs_g ?? 200;
  const targetFat      = clientProfile?.target_fat_g ?? 65;
  const targetWater    = clientProfile?.target_water_ml ?? 2500;

  const streakDays = activeHabit?.current_streak ?? 0;
  const cycleDays  = activeHabit?.habit?.cycle_days ?? 14;
  const streakPct  = Math.min((streakDays / cycleDays) * 100, 100);

  // ─── Load data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const [cpRes, chRes, flRes, wlRes, profileRes] = await Promise.all([
        supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('client_habits').select('*, habit:habits(*)').eq('client_id', user.id)
          .eq('status', 'active').order('sequence_number', { ascending: true }).limit(1),
        supabase.from('food_log').select('*').eq('user_id', user.id).eq('logged_date', today),
        supabase.from('water_log').select('*').eq('user_id', user.id).eq('logged_date', today),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);

      if (profileRes.data) setUserProfile(profileRes.data);
      if (cpRes.data)      setClientProfile(cpRes.data);
      if (flRes.data)      setFoodLog(flRes.data);
      if (wlRes.data)      setWaterLog(wlRes.data);

      if (chRes.data && chRes.data.length > 0) {
        const habit = chRes.data[0] as ClientHabit;
        setActiveHabit(habit);
        const { data: checkin } = await supabase
          .from('habit_checkins').select('*')
          .eq('client_habit_id', habit.id).eq('checked_date', today).limit(1);
        if (checkin?.length) setTodayCheckin(checkin[0]);

        const { data: allCh } = await supabase
          .from('habit_checkins').select('*')
          .eq('client_habit_id', habit.id).order('checked_date', { ascending: true });
        if (allCh) setAllCheckins(allCh);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [today, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Habit mastery celebration ────────────────────────────────
  useEffect(() => {
    if (activeHabit && !celebrationChecked) {
      setCelebrationChecked(true);
      if (activeHabit.current_streak >= (activeHabit.habit?.cycle_days ?? 14)) {
        const key = `trophe_mastery_${activeHabit.id}`;
        if (!localStorage.getItem(key)) setShowCelebration(true);
      }
    }
  }, [activeHabit, celebrationChecked]);

  // ─── Check-in ────────────────────────────────────────────────
  const handleCheckin = async (completed: boolean) => {
    if (!userId || !activeHabit || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await supabase
        .from('habit_checkins')
        .upsert({ client_habit_id: activeHabit.id, user_id: userId, checked_date: today, completed },
          { onConflict: 'client_habit_id,checked_date' })
        .select().maybeSingle();
      if (data) {
        setTodayCheckin(data);
        if (completed) {
          await supabase.from('client_habits').update({
            current_streak: (activeHabit.current_streak || 0) + 1,
            total_completions: (activeHabit.total_completions || 0) + 1,
          }).eq('id', activeHabit.id);
          setActiveHabit(p => p ? { ...p,
            current_streak: (p.current_streak || 0) + 1,
            total_completions: (p.total_completions || 0) + 1,
          } : p);
        }
      }
    } catch (err) { console.error('Checkin error:', err); }
    finally { setSubmitting(false); }
  };

  const handleMood = async (mood: Mood) => {
    if (!todayCheckin) return;
    await supabase.from('habit_checkins').update({ mood }).eq('id', todayCheckin.id);
    setTodayCheckin(p => p ? { ...p, mood } : p);
  };

  const addWater = async () => {
    if (!userId || addingWater) return;
    setAddingWater(true);
    const { data } = await supabase.from('water_log')
      .insert({ user_id: userId, logged_date: today, amount_ml: 250 }).select().maybeSingle();
    if (data) setWaterLog(p => [...p, data]);
    setAddingWater(false);
  };

  // ─── Loading state ────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;

  // ─── Derived display values ───────────────────────────────────
  const firstName   = userProfile?.full_name?.split(' ')[0] ?? null;
  const greeting    = getTimeGreeting();
  const remaining   = Math.max(targetCalories - Math.round(totalCalories), 0);
  const waterGlasses    = Math.floor(totalWater / 250);
  const targetGlasses   = Math.ceil(targetWater / 250);
  const completionPct   = cycleDays > 0 ? Math.round(((activeHabit?.total_completions ?? 0) / cycleDays) * 100) : 0;
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // ─── Dismiss celebration ──────────────────────────────────────
  const dismissCelebration = () => {
    if (activeHabit) localStorage.setItem(`trophe_mastery_${activeHabit.id}`, 'seen');
    setShowCelebration(false);
  };

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>

      {/* ── Celebration modal ── */}
      <AnimatePresence>
        {showCelebration && (
          <CelebrationModal
            streakDays={streakDays} cycleDays={cycleDays}
            completionPct={completionPct} habitName={activeHabit?.habit?.name_en}
            bestStreak={activeHabit?.best_streak} onDismiss={dismissCelebration}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-md mx-auto px-4 pt-3"
      >
        {/* ── Weekly check-in (Sunday, unobtrusive) ── */}
        {userId && clientProfile && (
          <WeeklyCheckin userId={userId} coachId={clientProfile.coach_id} />
        )}

        {/* ══ 1 · Greeting row ══════════════════════════════════ */}
        <div className="row-b mb-3">
          <div className="row-i" style={{ gap: 10 }}>
            <div className="av-lg">{firstName?.[0]?.toUpperCase() ?? 'N'}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--t1,#FAFAF9)' }}>
                {greeting}{firstName ? `, ${firstName}` : ''}
              </div>
              <div className="ds-sub">{dateLabel}</div>
            </div>
          </div>
          <div className="row-i" style={{ gap: 8 }}>
            {streakDays > 0 && (
              <span className="tag tag-g">
                <Icon name="i-flame" size={9} />
                {streakDays}d
              </span>
            )}
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              style={{
                width: 30, height: 30, borderRadius: 15,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={theme === 'dark' ? 'i-sun' : 'i-moon'} size={13}
                style={{ color: 'var(--gold-300,#D4A853)' }} />
            </button>
          </div>
        </div>

        {/* ══ 2 · Today macro card (gold) ══════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="card-g p-3.5 mb-3"
          style={{
            background: 'linear-gradient(135deg, rgba(212,168,83,.12), rgba(212,168,83,.04))',
            border: '1px solid rgba(212,168,83,.3)',
          }}
        >
          <div className="eye-d mb-2.5">Today</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

            {/* 72px ring */}
            <CompactRing value={totalCalories} target={targetCalories} />

            {/* Right: count + macro bars */}
            <div style={{ flex: 1 }}>
              <div className="title-l">{Math.round(totalCalories).toLocaleString()}</div>
              <div className="ds-sub">of {targetCalories} · {remaining} left</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <MacroLine label="P" value={totalProtein} target={targetProtein} color="var(--err,#E87A6E)" />
                <MacroLine label="C" value={totalCarbs}   target={targetCarbs}   color="var(--info,#7DA3D9)" />
                <MacroLine label="F" value={totalFat}     target={targetFat}     color="var(--plum,#B89DD9)" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══ 3 · Active habit card ════════════════════════════ */}
        {activeHabit?.habit ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="card p-3 mb-3"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowHabitModal(true)}
          >
            <div className="row-b mb-2">
              <div className="row-i" style={{ gap: 8 }}>
                <Icon name={habitIconName(activeHabit.habit.emoji)} size={14}
                  style={{ color: 'var(--info,#7DA3D9)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)' }}>
                  {activeHabit.habit.name_en}
                </span>
              </div>
              <span className="eye" style={{ fontSize: 9 }}>
                {Math.round(streakPct)}%
              </span>
            </div>

            {/* streak bar */}
            <div className="mb-track mb-2">
              <motion.div
                className="mb-fill"
                style={{ background: 'linear-gradient(90deg,var(--gold-400,#B8923E),var(--gold-200,#E8C078))' }}
                initial={{ width: 0 }} animate={{ width: `${streakPct}%` }}
                transition={{ duration: 0.8, delay: 0.3 }}
              />
            </div>

            {/* buttons */}
            {todayCheckin ? (
              <div style={{
                fontSize: 10, textAlign: 'center', padding: '6px 0',
                color: todayCheckin.completed ? 'var(--ok,#65D387)' : 'var(--t4)',
              }}>
                <Icon name={todayCheckin.completed ? 'i-check' : 'i-x'} size={10}
                  style={{ verticalAlign: -1, marginRight: 3 }} />
                {todayCheckin.completed ? 'Done today' : 'Skipped today'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn-gold"
                  style={{ flex: 2, padding: '7px', fontSize: 10, borderRadius: 10 }}
                  disabled={submitting}
                  onClick={e => { e.stopPropagation(); handleCheckin(true); }}
                >
                  <Icon name="i-check" size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                  Done
                </button>
                <button
                  className="btn-ghost"
                  style={{ flex: 1, padding: '7px', fontSize: 10, borderRadius: 10 }}
                  onClick={e => { e.stopPropagation(); handleCheckin(false); }}
                >
                  Skip
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="card p-4 mb-3 text-center"
          >
            <p className="ds-sub">No active habit · ask your coach</p>
          </motion.div>
        )}

        {/* ══ 4 · Water tracker (compact inline card) ═════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="card p-3 mb-3"
        >
          <div className="row-b mb-2">
            <div className="row-i" style={{ gap: 8 }}>
              <Icon name="i-drop" size={14} style={{ color: 'var(--info,#7DA3D9)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)' }}>Water</span>
            </div>
            <span className="eye" style={{ fontSize: 9 }}>
              {Math.round((totalWater / targetWater) * 100)}%
            </span>
          </div>
          <div className="mb-track mb-2">
            <motion.div className="mb-fill"
              style={{ background: 'var(--info,#7DA3D9)' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(totalWater / targetWater, 1) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.3 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-gold" style={{ flex: 2, padding: '7px', fontSize: 10, borderRadius: 10 }}
              onClick={addWater} disabled={addingWater}>
              <Icon name="i-plus" size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
              +250 ml
            </button>
            <span className="ds-sub" style={{ flex: 1, textAlign: 'right', alignSelf: 'center', fontSize: 9 }}>
              {waterGlasses}/{targetGlasses} glasses
            </span>
          </div>
        </motion.div>

        {/* ══ 5 · Quick actions (3+3 grid) ════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}
        >
          {([
            { icon: 'i-bowl',     label: 'Food',         action: () => router.push('/dashboard/log') },
            { icon: 'i-dumbbell', label: 'Workout',      action: () => router.push('/dashboard/workout') },
            { icon: 'i-drop',     label: 'Water',        action: addWater },
            { icon: 'i-sparkle',  label: 'Supplements',  action: () => router.push('/dashboard/supplements') },
            { icon: 'i-chart',    label: 'Progress',     action: () => router.push('/dashboard/progress') },
            { icon: 'i-calendar', label: 'Check-in',     action: () => router.push('/dashboard/checkin') },
          ] as const).map(a => (
            <button key={a.label} className="card" style={{ padding: '10px 6px', textAlign: 'center', cursor: 'pointer' }}
              onClick={a.action}>
              <Icon name={a.icon as Parameters<typeof Icon>[0]['name']} size={18}
                style={{ color: 'var(--gold-300,#D4A853)' }} />
              <div className="ds-sub" style={{ marginTop: 3, fontSize: 8 }}>{a.label}</div>
            </button>
          ))}
        </motion.div>
      </motion.div>

      {/* ── Habit detail modal ── */}
      <HabitDetailModal
        open={showHabitModal}
        onClose={() => setShowHabitModal(false)}
        habit={activeHabit?.habit ?? null}
        clientHabit={activeHabit}
        checkins={allCheckins}
        language={userProfile?.language ?? 'en'}
      />

      {/* ── Bottom nav (4-tab, handoff spec) ── */}
      <BotNav routes={CLIENT_NAV} />
    </div>
  );
}
