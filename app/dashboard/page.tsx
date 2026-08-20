'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Icon, AnimatedValue } from '@/components/ui';
import { BotNav } from '@/components/ui/BotNav';
import TodayWorkoutCard from '@/components/workout/TodayWorkoutCard';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { useClientNav } from '@/lib/useClientNav';
import { CLIENT_VIEW_PANELS, isPanelVisible, parseClientViewPrefs } from '@/lib/display-prefs';
import type { ClientProfile, ClientHabit, HabitCheckin, FoodLogEntry, WaterLogEntry, Mood, Profile } from '@/lib/types';
import WeeklyCheckin from '@/components/summary/WeeklyCheckin';
import { DashboardSkeleton } from '@/components/shared/Skeleton';
import HabitDetailModal from '@/components/habits/HabitDetailModal';
import { localToday } from '../../lib/utils/dates';
import DashboardGreeting from '@/components/summary/DashboardGreeting';

// ─── 88px calorie hero ring ─────────────────────────────────────
function CompactRing({ value, target, overGoal }: { value: number; target: number; overGoal?: boolean }) {
  const reducedMotion = useReducedMotion();
  const r = 37;
  const C = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const goalHit = target > 0 && value >= target;
  const strokeColor = overGoal ? 'var(--err,#E87A6E)' : 'var(--gold-300,#D4A853)';
  return (
    <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
      <svg width={88} height={88} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={44} cy={44} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={7} />
        <motion.circle
          cx={44} cy={44} r={r}
          fill="none" stroke={strokeColor}
          strokeWidth={7} strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ type: 'spring', stiffness: 36, damping: 14, delay: 0.25 }}
        />
      </svg>
      {/* One-shot gold sweep when the daily target is reached (transform/opacity only) */}
      {goalHit && !reducedMotion && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            overflow: 'hidden', pointerEvents: 'none',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, delay: 0.9, times: [0, 0.35, 1], type: 'tween', ease: 'easeInOut' }}
        >
          <motion.div
            style={{
              position: 'absolute', inset: -12,
              background: 'linear-gradient(115deg, transparent 32%, rgba(212,168,83,.5) 50%, transparent 68%)',
            }}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.2, delay: 0.9, type: 'tween', ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </div>
  );
}

// ─── Inline macro progress bar ───────────────────────────────────
function MacroLine({
  label, value, target, color, unit = 'g', warn,
}: { label: string; value: number; target: number; color: string; unit?: string; warn?: boolean }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: warn ? '#f59e0b' : 'var(--content-muted)', width: 16, fontWeight: warn ? 700 : 400 }}>{label}</span>
      <div className="mb-track" style={{ flex: 1 }}>
        <motion.div
          className="mb-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.6, delay: 0.3 }}
        />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: warn ? '#f59e0b' : 'var(--content-secondary)', width: 38, textAlign: 'right' }}>
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

// ─── Celebration modal (kept from v0.2) ──────────────────────────
// Confetti palette: gold family (gold-200..500) + white — on-brand celebration.
const CONFETTI_COLORS = ['#E8C078','#D4A853','#B8923E','#8B6E2B','#FFFFFF'];
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4"
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
        <p className="text-[var(--content-secondary)] text-sm mb-6">
          You completed the {cycleDays}-day cycle
          {habitName && <> for <span className="text-[var(--content-primary)] font-medium">{habitName}</span></>}
        </p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[['Days', streakDays], ['Completion', `${Math.min(completionPct, 100)}%`], ['Best', bestStreak ?? '—']].map(([l, v]) => (
            <div key={String(l)} className="glass p-3 rounded-xl">
              <div className="text-lg font-bold text-[var(--content-primary)]">{v}</div>
              <div className="text-xs text-[var(--content-muted)] uppercase tracking-wider">{l}</div>
            </div>
          ))}
        </div>
        <p className="text-[var(--content-muted)] text-xs mb-6">Your coach will assign your next challenge</p>
        <button onClick={onDismiss} className="btn-gold min-h-11 min-w-11 w-full text-sm py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Continue</button>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const clientNav = useClientNav();
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
  const [waterSize, setWaterSize]           = useState<150|250|330|500>(250);
  const [coachMessage, setCoachMessage]     = useState('');
  const [sendingMsg, setSendingMsg]         = useState(false);
  const [msgSent, setMsgSent]              = useState(false);
  const [msgError, setMsgError]            = useState(false);
  const [latestCoachNote, setLatestCoachNote] = useState<string | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<Array<{ note: string; session_type: string | null; created_at: string }>>([]);
  const [todayPlan, setTodayPlan] = useState<Array<{ meal_slot: string; description: string }>>([]);
  const [intakePending, setIntakePending] = useState<false | 'first' | 'quarterly'>(false);
  const [coachName, setCoachName]           = useState<string | null>(null);
  const [splashTick, setSplashTick]         = useState(0);
  const reducedMotion = useReducedMotion();

  const today = localToday();

  // ─── Derived totals ───────────────────────────────────────────
  const totalCalories = foodLog.reduce((s, f) => s + (f.calories ?? 0), 0);
  const totalProtein  = foodLog.reduce((s, f) => s + (f.protein_g ?? 0), 0);
  const totalCarbs    = foodLog.reduce((s, f) => s + (f.carbs_g ?? 0), 0);
  const totalFat      = foodLog.reduce((s, f) => s + (f.fat_g ?? 0), 0);
  const totalSugar    = foodLog.reduce((s, f) => s + (f.sugar_g ?? 0), 0);
  const totalWater    = waterLog.reduce((s, w) => s + w.amount_ml, 0);

  const targetCalories = clientProfile?.target_calories ?? 2000;
  const targetProtein  = clientProfile?.target_protein_g ?? 150;
  const targetCarbs    = clientProfile?.target_carbs_g ?? 200;
  const targetFat      = clientProfile?.target_fat_g ?? 65;
  const targetWater    = clientProfile?.target_water_ml ?? 2500;

  const streakDays = activeHabit?.current_streak ?? 0;
  const cycleDays  = activeHabit?.habit?.cycle_days ?? 14;
  const streakPct  = Math.min((streakDays / cycleDays) * 100, 100);

  // ── Coach-controlled client view prefs (client_profiles.client_view_prefs,
  //    migration 0050). Unknown/missing keys fall back to Essential defaults.
  const viewPrefs = parseClientViewPrefs(
    (clientProfile as (ClientProfile & { client_view_prefs?: unknown }) | null)?.client_view_prefs,
  );
  const showCalories     = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'showCalories');
  const showSmartInsight = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'smartInsight');
  const showWeeklyCheckin = isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'weeklyCheckin');

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

      // PERF: everything below only depends on the first batch — run the coach
      // branch (notes/coach/plan/intake) and the habit branch (checkins) as ONE
      // parallel batch instead of the old 5-query sequential waterfall
      // (was: ~5× single-query latency stacked on top of each other).
      const coachId = cpRes.data?.coach_id as string | null | undefined;
      const habit = chRes.data && chRes.data.length > 0 ? (chRes.data[0] as ClientHabit) : null;
      if (habit) setActiveHabit(habit);

      // Today's meal plan (weekly grid: Monday=0 … Sunday=6)
      const jsDay = new Date().getDay(); // Sun=0
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

      const [noteRes, coachProfileRes, planRes, intakeRes, checkinRes, allChRes] = await Promise.all([
        coachId
          ? supabase.from('coach_notes')
              .select('note, session_type, created_at')
              .eq('client_id', user.id)
              .not('note', 'like', '[Client message]:%')
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: null }),
        coachId
          ? supabase.from('profiles').select('full_name').eq('id', coachId).maybeSingle()
          : Promise.resolve({ data: null }),
        coachId
          ? supabase.from('meal_plan_entries')
              .select('meal_slot, description')
              .eq('client_id', user.id)
              .eq('day_of_week', dayOfWeek)
          : Promise.resolve({ data: null }),
        coachId
          ? supabase.from('questionnaire_responses')
              .select('submitted_at')
              .eq('client_id', user.id)
              .not('submitted_at', 'is', null)
              .order('submitted_at', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: null }),
        habit
          ? supabase.from('habit_checkins').select('*')
              .eq('client_habit_id', habit.id).eq('checked_date', today).limit(1)
          : Promise.resolve({ data: null }),
        habit
          ? supabase.from('habit_checkins').select('*')
              .eq('client_habit_id', habit.id).order('checked_date', { ascending: true })
          : Promise.resolve({ data: null }),
      ]);

      if (coachId) {
        const noteRows = (noteRes.data ?? []) as Array<{ note: string; session_type: string | null; created_at: string }>;
        if (noteRows[0]?.note) setLatestCoachNote(noteRows[0].note);
        setPinnedNotes(noteRows);

        // Intake CTA: never submitted → first run; older than 90 days → quarterly refresh
        const intakeRows = (intakeRes.data ?? []) as Array<{ submitted_at: string }>;
        const last = intakeRows[0]?.submitted_at;
        if (!last) setIntakePending('first');
        else if (Date.now() - new Date(last).getTime() > 90 * 86400_000) setIntakePending('quarterly');
        else setIntakePending(false);

        const slotOrder = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'];
        setTodayPlan(
          ((planRes.data ?? []) as Array<{ meal_slot: string; description: string }>)
            .filter((r) => r.description.trim())
            .sort((a, b) => slotOrder.indexOf(a.meal_slot) - slotOrder.indexOf(b.meal_slot))
        );
        const coachData = coachProfileRes.data as { full_name?: string } | null;
        if (coachData?.full_name) setCoachName(coachData.full_name.split(' ')[0]);
      }

      if (habit) {
        const checkinRows = checkinRes.data as HabitCheckin[] | null;
        if (checkinRows?.length) setTodayCheckin(checkinRows[0]);
        const allCh = allChRes.data as HabitCheckin[] | null;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleMood = async (mood: Mood) => {
    if (!todayCheckin) return;
    await supabase.from('habit_checkins').update({ mood }).eq('id', todayCheckin.id);
    setTodayCheckin(p => p ? { ...p, mood } : p);
  };

  const addWater = async (ml: number = waterSize) => {
    if (!userId || addingWater) return;
    setAddingWater(true);
    const { data } = await supabase.from('water_log')
      .insert({ user_id: userId, logged_date: today, amount_ml: ml }).select().maybeSingle();
    if (data) {
      setWaterLog(p => [...p, data]);
      setSplashTick(t => t + 1);
      if (typeof navigator !== 'undefined') navigator.vibrate?.(10);
    }
    setAddingWater(false);
  };

  const sendCoachMessage = async () => {
    if (!coachMessage.trim() || sendingMsg) return;
    setSendingMsg(true);
    setMsgError(false);
    try {
      // Get access token for the Authorization header — this route requires Bearer auth.
      // getSession() reads from cache so it's fast; the token is still validated server-side.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch('/api/client/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: coachMessage.trim() }),
      });
      // Only clear the box + show the green confirmation on real success —
      // a 401 (expired cached token) / 500 must NOT report "sent" and drop
      // the message (silent data loss to the coach).
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      setCoachMessage('');
      setMsgSent(true);
      setTimeout(() => setMsgSent(false), 3000);
    } catch (err) {
      console.error('coach message send failed:', err);
      setMsgError(true);
      setTimeout(() => setMsgError(false), 4000);
    } finally {
      setSendingMsg(false);
    }
  };

  const removeLastWater = async () => {
    if (!userId || waterLog.length === 0) return;
    const last = waterLog[waterLog.length - 1];
    await supabase.from('water_log').delete().eq('id', last.id);
    setWaterLog(p => p.slice(0, -1));
  };

  // ─── Loading state ────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;

  // ─── Derived display values ───────────────────────────────────
  const firstName   = userProfile?.full_name?.split(' ')[0] ?? null;
  const remaining   = Math.max(targetCalories - Math.round(totalCalories), 0);
  const waterGlasses    = Math.floor(totalWater / 250);
  const targetGlasses   = Math.ceil(targetWater / 250);
  const completionPct   = cycleDays > 0 ? Math.round(((activeHabit?.total_completions ?? 0) / cycleDays) * 100) : 0;

  // ─── Dismiss celebration ──────────────────────────────────────
  const dismissCelebration = () => {
    if (activeHabit) localStorage.setItem(`trophe_mastery_${activeHabit.id}`, 'seen');
    setShowCelebration(false);
  };

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--canvas)' }}>

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
        className="max-w-md lg:max-w-4xl mx-auto px-4 pt-3"
      >
        {/* ── Weekly check-in (Sunday, unobtrusive; coach can hide it) ── */}
        {userId && clientProfile && showWeeklyCheckin && (
          <WeeklyCheckin userId={userId} coachId={clientProfile.coach_id} />
        )}

        {/* ══ 1 · Greeting row ══════════════════════════════════ */}
        <DashboardGreeting
          firstName={firstName}
          role={userProfile?.role ?? null}
          hour={new Date().getHours()}
          date={new Date()}
          streakDays={streakDays}
        />

        {/* ══ 1b · Coach messages — pinned first (Michael 2026-06-12).
               Colors by note type: check-in blue · progression green ·
               concern red · general neutral. ══ */}
        {pinnedNotes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {pinnedNotes.map((n, i) => {
              const palette: Record<string, { bg: string; border: string; fg: string }> = {
                check_in:    { bg: 'rgba(96,165,250,.08)',  border: 'rgba(96,165,250,.3)',  fg: '#93c5fd' },
                progression: { bg: 'rgba(74,222,128,.08)',  border: 'rgba(74,222,128,.3)',  fg: '#86efac' },
                concern:     { bg: 'rgba(248,113,113,.10)', border: 'rgba(248,113,113,.35)', fg: '#fca5a5' },
                general:     { bg: 'var(--surface-2)', border: 'var(--border-default)',              fg: 'var(--content-primary)' },
              };
              const c = palette[n.session_type ?? 'general'] ?? palette.general;
              return (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 12,
                  background: c.bg, border: `1px solid ${c.border}`,
                }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.08em', color: c.fg, marginBottom: 3 }}>
                    {coachName ? `Coach ${coachName}` : 'Your coach'}{n.session_type && n.session_type !== 'general' ? ` · ${n.session_type.replace('_', '-')}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--content-primary)', lineHeight: 1.5 }}>{n.note}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ 1b2 · Intake interview CTA ══ */}
        {intakePending && (
          <a href="/dashboard/intake" className="block min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ textDecoration: 'none' }}>
            <div className="card" style={{
              padding: '11px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid rgba(212,168,83,.3)', background: 'rgba(212,168,83,.06)',
            }}>
              <Icon name="i-edit" size={16} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)' }}>
                  {intakePending === 'quarterly' ? 'Seasonal check-in with your coach' : 'Twelve questions before we start'}
                </div>
                <div className="ds-sub" style={{ fontSize: 12 }}>
                  {intakePending === 'quarterly' ? 'Things change — tell your coach what moved' : '~5 minutes · shapes your whole plan'}
                </div>
              </div>
              <Icon name="i-chev-r" size={14} style={{ color: 'var(--content-muted)' }} />
            </div>
          </a>
        )}

        {/* ══ 1c · Today's plan from the coach (meal_plan_entries) ══ */}
        {todayPlan.length > 0 && (
          <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--gold-300,#D4A853)', marginBottom: 8 }}>
              Today&apos;s plan
            </div>
            {todayPlan.map((row) => {
              const slotLabels: Record<string, string> = {
                breakfast: 'Breakfast', snack1: 'Snack', lunch: 'Lunch', snack2: 'Snack', dinner: 'Dinner',
              };
              return (
                <div key={row.meal_slot} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--content-secondary)', width: 64, flexShrink: 0, paddingTop: 1 }}>
                    {slotLabels[row.meal_slot] ?? row.meal_slot}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--content-primary)', lineHeight: 1.45 }}>{row.description}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ 2 · Today macro hero card ════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="card-g mb-3"
          style={{
            background: 'linear-gradient(135deg, rgba(212,168,83,.13) 0%, rgba(212,168,83,.03) 100%)',
            border: '1px solid rgba(212,168,83,.3)',
            padding: '16px',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* subtle corner glow */}
          <div style={{
            position: 'absolute', top: -20, right: -20, width: 100, height: 100,
            background: 'radial-gradient(circle, rgba(212,168,83,.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {/* 88px ring — calories hidden unless the coach enables showCalories */}
            {showCalories && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <CompactRing value={totalCalories} target={targetCalories} overGoal={totalCalories > targetCalories} />
              {/* center percentage */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--gold-300,#D4A853)', lineHeight: 1 }}>
                  {targetCalories > 0 ? Math.round((totalCalories / targetCalories) * 100) : 0}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--content-muted)', marginTop: 1 }}>%</span>
              </div>
            </div>
            )}

            {/* Right: hero number + macro bars */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {showCalories ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
                    {/* Serif hero numeral + RAF count-up */}
                    <span className="display-lg" style={{ fontSize: 32, lineHeight: '32px', color: 'var(--content-primary)' }}>
                      <AnimatedValue value={Math.round(totalCalories)} />
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>kcal</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--content-muted)', marginBottom: 10 }}>
                    {remaining > 0
                      ? <><span style={{ color: 'var(--gold-300,#D4A853)', fontWeight: 600 }}>{remaining.toLocaleString()}</span> remaining of {targetCalories.toLocaleString()}</>
                      : <span style={{ color: 'var(--ok,#65D387)', fontWeight: 600 }}>Goal reached</span>
                    }
                  </div>
                </>
              ) : (
                <div className="eye" style={{ marginBottom: 10 }}>Today</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <MacroLine label="P" value={totalProtein} target={targetProtein} color="var(--err,#E87A6E)" />
                <MacroLine label="C" value={totalCarbs}   target={targetCarbs}   color="var(--info,#7DA3D9)" />
                <MacroLine label="F" value={totalFat}     target={targetFat}     color="var(--plum,#B89DD9)" />
                <MacroLine label="S" value={totalSugar}   target={25}            color={totalSugar > 25 ? '#f59e0b' : 'var(--ok,#65D387)'} unit="g" warn={totalSugar > 25} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══ 2b · Today's training — workout finally lives on home ══ */}
        <TodayWorkoutCard userId={userId} />

        {/* Desktop: sections below the hero flow into two columns */}
        <div className="dash-cols lg:columns-2 lg:gap-5">

        {/* ══ 3 · Active habit card ════════════════════════════ */}
        {activeHabit?.habit ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="card p-3 mb-3"
          >
            <button
              type="button"
              aria-label={`View ${activeHabit.habit.name_en} details`}
              onClick={() => setShowHabitModal(true)}
              className="min-h-11 w-full cursor-pointer border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <div className="row-b mb-2">
                <div className="row-i" style={{ gap: 8 }}>
                  <Icon name={habitIconName(activeHabit.habit.emoji)} size={14}
                    style={{ color: 'var(--info,#7DA3D9)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)' }}>
                    {activeHabit.habit.name_en}
                  </span>
                </div>
                <span className="eye" style={{ fontSize: 12 }}>
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
            </button>

            {/* buttons */}
            {todayCheckin ? (
              <div style={{
                fontSize: 12, textAlign: 'center', padding: '6px 0',
                color: todayCheckin.completed ? 'var(--ok,#65D387)' : 'var(--content-muted)',
              }}>
                <Icon name={todayCheckin.completed ? 'i-check' : 'i-x'} size={10}
                  style={{ verticalAlign: -1, marginRight: 3 }} />
                {todayCheckin.completed ? 'Done today' : 'Skipped today'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-gold"
                  style={{ flex: 2, padding: '12px 10px', minHeight: 44, fontSize: 12, borderRadius: 12 }}
                  disabled={submitting}
                  onClick={e => { e.stopPropagation(); handleCheckin(true); }}
                >
                  <Icon name="i-check" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Done
                </button>
                <button
                  className="btn-ghost"
                  style={{ flex: 1, padding: '12px 10px', minHeight: 44, fontSize: 12, borderRadius: 12 }}
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
            <button
              className="btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{ marginTop: 10, fontSize: 12, padding: '10px 16px', minHeight: 44, minWidth: 44 }}
              onClick={() =>
                document.getElementById('coach-message-box')?.scrollIntoView({
                  behavior: reducedMotion ? 'auto' : 'smooth',
                  block: 'center',
                })
              }
            >
              {t('dash.message_coach_cta')}
            </button>
          </motion.div>
        )}

        {/* ══ 4 · Water tracker — WOAH redesign ══════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="card p-3 mb-3"
          style={{ background: 'linear-gradient(135deg,rgba(125,163,217,.08) 0%,rgba(125,163,217,.02) 100%)', border: '1px solid rgba(125,163,217,.18)' }}
        >
          {/* Header row */}
          <div className="row-b mb-2.5">
            <div className="row-i" style={{ gap: 6 }}>
              <Icon name="i-drop" size={13} style={{ color: 'var(--info,#7DA3D9)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)' }}>{t('water.title')}</span>
              <span style={{ fontSize: 12, color: 'var(--info,#7DA3D9)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {totalWater}ml
              </span>
            </div>
            <div className="row-i" style={{ gap: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>
                {waterGlasses}/{targetGlasses}
              </span>
              {waterLog.length > 0 && (
                <button onClick={removeLastWater} aria-label="Undo last water"
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-muted)', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="i-x" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Glass icons — animated fill */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {Array.from({ length: targetGlasses }, (_, i) => {
              const filled = i < waterGlasses;
              return (
                <motion.button
                  key={i}
                  onClick={() => filled ? undefined : addWater()}
                  whileTap={!filled && !reducedMotion ? { scale: 1.25 } : undefined}
                  aria-label={`Log water cup ${i + 1}`}
                  aria-pressed={filled}
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{ background: 'none', border: 'none', cursor: filled ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  disabled={addingWater}
                >
                  <motion.div
                    initial={false}
                    animate={{ scale: filled && !reducedMotion ? [1, 1.3, 1] : 1, opacity: filled ? 1 : 0.3 }}
                    transition={{ duration: reducedMotion ? 0 : 0.35, type: 'tween', ease: 'easeOut' }}
                    style={{
                      width: 24, height: 24, borderRadius: 6, position: 'relative',
                      background: filled
                        ? 'linear-gradient(180deg, rgba(125,163,217,.7) 0%, rgba(59,130,246,.8) 100%)'
                        : 'var(--border-subtle)',
                      border: `1px solid ${filled ? 'rgba(125,163,217,.5)' : 'var(--border-subtle)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="i-drop" size={11} style={{ color: filled ? 'var(--content-inverse)' : 'var(--content-muted)' }} />
                    {/* One-shot splash ring on the just-filled glass */}
                    {filled && i === waterGlasses - 1 && splashTick > 0 && !reducedMotion && (
                      <span
                        key={splashTick}
                        className="water-splash"
                        aria-hidden
                        style={{
                          position: 'absolute', inset: -3, borderRadius: 9,
                          border: '2px solid rgba(125,163,217,.65)',
                        }}
                      />
                    )}
                  </motion.div>
                </motion.button>
              );
            })}
          </div>

          {/* Size selector + Log button */}
          <div style={{ display: 'flex', gap: 5 }}>
            {([150, 250, 330, 500] as const).map(ml => (
              <button
                key={ml}
                onClick={() => setWaterSize(ml)}
                aria-pressed={waterSize === ml}
                className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={{
                  flex: 1, minWidth: 44, padding: '5px 2px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                  background: waterSize === ml ? 'rgba(125,163,217,.18)' : 'var(--surface-2)',
                  border: `1px solid ${waterSize === ml ? 'rgba(125,163,217,.45)' : 'var(--border-subtle)'}`,
                  color: waterSize === ml ? 'var(--info,#7DA3D9)' : 'var(--content-muted)',
                  transition: 'all .15s',
                }}
              >
                {ml}ml
              </button>
            ))}
            <motion.button
              className="btn-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              whileTap={reducedMotion ? undefined : { scale: 0.95 }}
              style={{ flex: 2, minHeight: 44, minWidth: 44, padding: '5px 10px', fontSize: 12, borderRadius: 8 }}
              onClick={() => addWater(waterSize)}
              disabled={addingWater}
            >
              <Icon name="i-plus" size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
              {t('water.log')}
            </motion.button>
          </div>
        </motion.div>

        {/* ══ 5 · Quick actions — primary hero row ════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20 }}
          style={{ marginBottom: 8 }}
        >
          {/* Primary: Food + Workout — large 50/50 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <motion.button
              className="card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
              style={{ padding: '18px 12px', textAlign: 'center', cursor: 'pointer', minHeight: 84 }}
              onClick={() => router.push('/dashboard/log')}
            >
              <Icon name="i-bowl" size={26} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 7, color: 'var(--content-primary)', letterSpacing: '-.01em' }}>{t('home.food')}</div>
              <div className="ds-sub" style={{ marginTop: 3, fontSize: 12 }}>
                {foodLog.length > 0 ? `${foodLog.length} ${t('home.entries_n')}` : t('home.log_a_meal')}
              </div>
            </motion.button>
            <motion.button
              className="card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              whileTap={reducedMotion ? undefined : { scale: 0.96 }}
              style={{ padding: '18px 12px', textAlign: 'center', cursor: 'pointer', minHeight: 84 }}
              onClick={() => router.push('/dashboard/workout')}
            >
              <Icon name="i-dumbbell" size={26} style={{ color: 'var(--gold-300,#D4A853)' }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 7, color: 'var(--content-primary)', letterSpacing: '-.01em' }}>{t('home.workout')}</div>
              <div className="ds-sub" style={{ marginTop: 3, fontSize: 12 }}>{t('home.log_session')}</div>
            </motion.button>
          </div>

          {/* Secondary: Water / Supps / Progress / Check-in — 4-col */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {([
              { icon: 'i-drop',     labelKey: 'home.water_short', action: () => addWater(), sub: `${waterGlasses}/${targetGlasses}` },
              { icon: 'i-sparkle',  labelKey: 'home.supps',       action: () => router.push('/dashboard/supplements'), sub: null },
              { icon: 'i-chart',    labelKey: 'home.progress',    action: () => router.push('/dashboard/progress'), sub: null },
              { icon: 'i-calendar', labelKey: 'home.check_in',    action: () => router.push('/dashboard/checkin'), sub: null },
            ] as const).map(a => (
              <motion.button
                key={a.labelKey}
                className="card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                whileTap={reducedMotion ? undefined : { scale: 0.94 }}
                style={{ minWidth: 44, minHeight: 44, padding: '11px 4px 9px', textAlign: 'center', cursor: 'pointer' }}
                onClick={a.action}
              >
                <Icon name={a.icon as Parameters<typeof Icon>[0]['name']} size={17}
                  style={{ color: 'var(--gold-300,#D4A853)' }} />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, color: 'var(--content-primary)' }}>{t(a.labelKey)}</div>
                {a.sub && <div className="ds-sub" style={{ fontSize: 12, marginTop: 1 }}>{a.sub}</div>}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ══ 6 · Smart insight strip (coach-toggleable; calorie phrasing
               only when showCalories — protein-first otherwise) ══ */}
        {showSmartInsight && (() => {
          let icon: Parameters<typeof Icon>[0]['name'] = 'i-zap';
          let text = '';
          let color = 'var(--gold-300,#D4A853)';
          if (foodLog.length === 0) {
            icon = 'i-leaf'; text = t('insight.log_first'); color = 'var(--content-secondary)';
          } else if (totalSugar > 30) {
            icon = 'i-flame'; text = t('insight.sugar_high', { n: Math.round(totalSugar) }); color = '#f59e0b';
          } else if (targetProtein > 0 && (totalProtein / targetProtein) < 0.3) {
            icon = 'i-dumbbell';
            text = t('insight.protein_low', { n: Math.round(Math.max(targetProtein - totalProtein, 0)) }); color = 'var(--err,#E87A6E)';
          } else if (totalWater < 500) {
            icon = 'i-drop'; text = t('insight.hydration_low'); color = 'var(--info,#7DA3D9)';
          } else if (showCalories && targetCalories > 0 && totalCalories >= targetCalories) {
            icon = 'i-target'; text = t('insight.goal_reached'); color = 'var(--ok,#65D387)';
          } else if (showCalories && targetCalories > 0 && (totalCalories / targetCalories) > 0.8) {
            icon = 'i-check';
            text = t('insight.almost_there', { n: remaining.toLocaleString() }); color = 'var(--ok,#65D387)';
          } else if (showCalories) {
            icon = 'i-zap';
            const pct = targetCalories > 0 ? Math.round((totalCalories / targetCalories) * 100) : 0;
            text = t('insight.pct_logged', { n: pct }); color = 'var(--gold-300,#D4A853)';
          } else if (targetProtein > 0 && totalProtein >= targetProtein) {
            // Protein-first fallbacks — no calorie numbers for clients.
            icon = 'i-target'; text = t('insight.protein_hit'); color = 'var(--ok,#65D387)';
          } else if (targetProtein > 0) {
            icon = 'i-dumbbell';
            text = t('insight.protein_progress', { n: Math.round(totalProtein), target: Math.round(targetProtein) });
            color = 'var(--gold-300,#D4A853)';
          } else {
            icon = 'i-check'; text = t('insight.keep_logging'); color = 'var(--ok,#65D387)';
          }
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="card"
              style={{
                padding: '10px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--surface-2)',
              }}
            >
              <Icon name={icon} size={13} style={{ color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--content-secondary)', flex: 1 }}>{text}</span>
            </motion.div>
          );
        })()}
        {/* ══ 7 · Coach message box ════════════════════════════ */}
        <motion.div
          id="coach-message-box"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="card mb-3"
          style={{ padding: '12px 14px', background: 'var(--surface-2)' }}
        >
          <div className="row-i mb-2.5" style={{ gap: 8 }}>
            {/* Coach avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: 15, flexShrink: 0,
              background: 'linear-gradient(135deg,rgba(212,168,83,.3),rgba(212,168,83,.1))',
              border: '1px solid rgba(212,168,83,.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="i-user" size={14} style={{ color: 'var(--gold-300,#D4A853)' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)' }}>
                {coachName ? `${t('coach_msg.coach_prefix')} ${coachName}` : t('coach_msg.your_coach')}
                {' '}
                <a href="/dashboard/messages" className="inline-flex min-h-11 min-w-11 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                  · open chat →
                </a>
                {' '}
                <a href="/dashboard/book" className="inline-flex min-h-11 min-w-11 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                  · book session →
                </a>
              </div>
              {latestCoachNote && (
                <div style={{ fontSize: 12, color: 'var(--content-muted)', marginTop: 1, lineHeight: 1.4, maxWidth: 220 }} className="truncate">
                  {latestCoachNote.slice(0, 60)}{latestCoachNote.length > 60 ? '…' : ''}
                </div>
              )}
            </div>
          </div>

          {msgSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--ok,#65D387)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              <Icon name="i-check" size={12} />
              {t('coach_msg.sent_confirm')}
            </motion.div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msgError && (
              <div style={{ fontSize: 12, color: 'var(--err,#E87A6E)', textAlign: 'center' }}>
                {t('coach_msg.send_failed')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={coachMessage}
                onChange={e => setCoachMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCoachMessage()}
                placeholder={t('coach_msg.placeholder')}
                className="min-h-11 text-base sm:text-sm"
                style={{
                  flex: 1, background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
                  borderRadius: 10, padding: '7px 10px', color: 'var(--content-primary)',
                  outline: 'none',
                }}
              />
              <motion.button
                className="btn-gold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label={t('coach_msg.send')}
                whileTap={reducedMotion ? undefined : { scale: 0.93 }}
                onClick={sendCoachMessage}
                disabled={sendingMsg || !coachMessage.trim()}
                style={{ padding: '7px 12px', fontSize: 12, borderRadius: 10, flexShrink: 0 }}
              >
                <Icon name="i-send" size={11} />
              </motion.button>
            </div>
            </div>
          )}
        </motion.div>
        </div>{/* /dash-cols */}
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
      <BotNav routes={clientNav} />
    </div>
  );
}
