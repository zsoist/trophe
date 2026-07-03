'use client';

// ═══════════════════════════════════════════════════════════════
// τροφή (Trophē) — Screen 06 "Daily Check-in"
// Handoff v2 design system · production-ready
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';
import { BotNav } from '@/components/ui/BotNav';
import type { ClientHabit, HabitCheckin, Mood } from '@/lib/types';
import { localToday } from '@/lib/utils/dates';
import { useClientNav } from '@/lib/useClientNav';

// ─── Shimmer skeleton atoms ───────────────────────────────────
const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(120,113,108,.1) 0%, rgba(212,168,83,.06) 50%, rgba(120,113,108,.1) 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.6s ease-in-out infinite',
  borderRadius: 10,
};

function SkimBlock({ h = 16, w = '100%' }: { h?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, ...shimmerStyle }} />;
}

function CheckinSkeleton({ nav }: { nav: ReturnType<typeof useClientNav> }) {
  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <style>{`@keyframes shimmer { 0%,100%{background-position:200% 0} 50%{background-position:-200% 0} }`}</style>
      <div className="max-w-md mx-auto px-4 pt-3">
        {/* header */}
        <div className="row-b mb-4">
          <SkimBlock h={32} w={32} />
          <SkimBlock h={12} w={100} />
          <div style={{ width: 16 }} />
        </div>
        {/* habit card */}
        <div className="card-g p-4 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkimBlock h={10} w={100} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SkimBlock h={40} w={40} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkimBlock h={14} w="70%" />
              <SkimBlock h={10} w="90%" />
            </div>
          </div>
          <SkimBlock h={10} w={120} />
        </div>
        {/* mood card */}
        <div className="card p-4 mb-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkimBlock h={10} w={130} />
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4,5].map(i => <SkimBlock key={i} h={36} w="20%" />)}
          </div>
        </div>
        {/* complete card */}
        <div className="card p-4 mb-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkimBlock h={10} w={140} />
          <div style={{ display: 'flex', gap: 12 }}>
            <SkimBlock h={46} w="50%" />
            <SkimBlock h={46} w="50%" />
          </div>
        </div>
        {/* note card */}
        <div className="card p-4 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkimBlock h={10} w={110} />
          <SkimBlock h={60} />
        </div>
        {/* button */}
        <SkimBlock h={48} />
      </div>
      <BotNav routes={nav} />
    </div>
  );
}

// ─── Mood options ─────────────────────────────────────────────
const MOOD_OPTIONS: { value: Mood; label: string; icon: string }[] = [
  { value: 'great',      label: 'GREAT',     icon: 'i-zap'      },
  { value: 'good',       label: 'GOOD',      icon: 'i-check'    },
  { value: 'okay',       label: 'OKAY',      icon: 'i-pulse'    },
  { value: 'tough',      label: 'TOUGH',     icon: 'i-warning'  },
  { value: 'struggled',  label: 'HARD',      icon: 'i-graph-down' },
];

// ─── Gold button style helper ─────────────────────────────────
const goldBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  borderRadius: 12,
  cursor: 'pointer',
  background: 'var(--gold-300,#D4A853)',
  color: '#0a0a0a',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '.1em',
  fontWeight: 700,
  border: 'none',
  textTransform: 'uppercase' as const,
  transition: 'all .2s',
};

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function CheckinPage() {
  const clientNav = useClientNav();
  const router = useRouter();

  // ─── Data state ───────────────────────────────────────────
  const [loading, setLoading]       = useState(true);
  const [userId, setUserId]         = useState<string | null>(null);
  const [habit, setHabit]           = useState<ClientHabit | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<HabitCheckin | null>(null);
  const [noHabit, setNoHabit]       = useState(false);

  // ─── Form state ───────────────────────────────────────────
  const [completed, setCompleted]   = useState<boolean | null>(null);
  const [mood, setMood]             = useState<Mood | null>(null);
  const [note, setNote]             = useState('');
  // Daily lifestyle signals (Michael 2026-06-12): digestion, sleep, energy,
  // water — context for the coach AND self-awareness for the client.
  const [bowel, setBowel]           = useState<boolean | null>(null);
  const [slept8h, setSlept8h]       = useState<boolean | null>(null);
  const [energy, setEnergy]         = useState<number | null>(null);
  const [waterOk, setWaterOk]       = useState<boolean | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  const today = localToday();

  // ─── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: habits } = await supabase
        .from('client_habits')
        .select('*, habit:habits(id,name_en,description_en,emoji,category,target_value,target_unit,cycle_days)')
        .eq('client_id', user.id)
        .eq('status', 'active')
        .order('sequence_number', { ascending: true })
        .limit(1);

      if (!habits || habits.length === 0) {
        setNoHabit(true);
        return;
      }

      const activeHabit = habits[0] as ClientHabit;
      setHabit(activeHabit);

      const { data: checkins } = await supabase
        .from('habit_checkins')
        .select('id, completed, mood, note, value')
        .eq('client_habit_id', activeHabit.id)
        .eq('checked_date', today)
        .limit(1);

      if (checkins && checkins.length > 0) {
        setTodayCheckin(checkins[0] as HabitCheckin);
      }

      const { data: dc } = await supabase
        .from('daily_checkins')
        .select('bowel_movement, slept_8h, energy, water_ok')
        .eq('user_id', user.id)
        .eq('checked_date', today)
        .maybeSingle();
      if (dc) {
        setBowel(dc.bowel_movement);
        setSlept8h(dc.slept_8h);
        setEnergy(dc.energy);
        setWaterOk(dc.water_ok);
      }
    } catch (err) {
      console.error('Check-in load error:', err);
    } finally {
      setLoading(false);
    }
  }, [today, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Submit handler ───────────────────────────────────────
  const handleSubmit = async () => {
    if (completed === null || !habit || !userId || saving) return;
    setSaving(true);
    try {
      await supabase.from('habit_checkins').upsert({
        client_habit_id: habit.id,
        user_id: userId,
        checked_date: today,
        completed,
        mood: mood ?? undefined,
        note: note.trim() || undefined,
      }, { onConflict: 'client_habit_id,checked_date' });

      // Lifestyle signals — saved independently of the habit result
      if (bowel !== null || slept8h !== null || energy !== null || waterOk !== null) {
        await supabase.from('daily_checkins').upsert({
          user_id: userId,
          checked_date: today,
          bowel_movement: bowel,
          slept_8h: slept8h,
          energy,
          water_ok: waterOk,
        }, { onConflict: 'user_id,checked_date' });
      }

      // Update streak only on completion
      if (completed) {
        await supabase.from('client_habits').update({
          current_streak: (habit.current_streak || 0) + 1,
          total_completions: (habit.total_completions || 0) + 1,
        }).eq('id', habit.id);
      }

      setSaved(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      console.error('Check-in submit error:', err);
      setSaving(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────
  if (loading) return <CheckinSkeleton nav={clientNav} />;

  // ─── No habit assigned ────────────────────────────────────
  if (noHabit) {
    return (
      <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-md mx-auto px-4 pt-3"
        >
          {/* Header */}
          <div className="row-b mb-6">
            <button
              onClick={() => router.back()}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--t3)', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <Icon name="i-chev-l" size={18} />
            </button>
            <span className="eye-d">Daily Check-in</span>
            <div style={{ width: 16 }} />
          </div>

          <div className="card-g p-6 text-center">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--t5)' }}>
              <Icon name="i-target" size={32} />
            </div>
            <div className="eye" style={{ marginBottom: 6 }}>NO HABIT ASSIGNED</div>
            <div className="ds-sub">
              No active habit assigned yet. Your coach will assign one soon.
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              style={{ ...goldBtnStyle, marginTop: 20 }}
            >
              Back to Dashboard
            </button>
          </div>
        </motion.div>
        <BotNav routes={clientNav} />
      </div>
    );
  }

  // ─── Already checked in today ─────────────────────────────
  if (todayCheckin) {
    return (
      <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-md mx-auto px-4 pt-3"
        >
          {/* Header */}
          <div className="row-b mb-6">
            <button
              onClick={() => router.back()}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--t3)', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <Icon name="i-chev-l" size={18} />
            </button>
            <span className="eye-d">Daily Check-in</span>
            <div style={{ width: 16 }} />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
            className="card-g p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.2 }}
              style={{ marginBottom: 8, display: 'inline-flex' }}
            >
              <Check size={36} strokeWidth={2.5} style={{ color: 'var(--ok,#65D387)' }} aria-hidden />
            </motion.div>
            <div className="eye" style={{ marginTop: 8, marginBottom: 4 }}>ALREADY LOGGED</div>
            <div className="ds-sub">You checked in earlier today.</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginTop: 12 }}>
              {habit?.habit?.name_en}
            </div>
            <div style={{
              marginTop: 6, fontSize: 12,
              color: todayCheckin.completed ? 'var(--gold-300,#D4A853)' : 'rgb(239,68,68)',
              fontFamily: 'var(--font-mono)',
            }}>
              {todayCheckin.completed
                ? <><Check size={12} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> Completed</>
                : <><X size={12} style={{ display: 'inline', verticalAlign: -2 }} aria-hidden /> Skipped</>}
              {todayCheckin.mood ? ` · ${todayCheckin.mood}` : ' · no mood'}
            </div>
            {todayCheckin.note && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,.04)',
                fontSize: 12, color: 'var(--t3)', textAlign: 'left',
                fontStyle: 'italic',
              }}>
                &ldquo;{todayCheckin.note}&rdquo;
              </div>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              style={{ ...goldBtnStyle, marginTop: 20 }}
            >
              Back to Dashboard
            </button>
          </motion.div>
        </motion.div>
        <BotNav routes={clientNav} />
      </div>
    );
  }

  // ─── MAIN CHECK-IN FORM ───────────────────────────────────
  const h = habit!;
  const streakDays = h.current_streak ?? 0;

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <style>{`@keyframes shimmer { 0%,100%{background-position:200% 0} 50%{background-position:-200% 0} }`}</style>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-md mx-auto px-4 pt-3"
      >

        {/* ══ Header ═══════════════════════════════════════════ */}
        <div className="row-b mb-4">
          <button
            onClick={() => router.back()}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--t3)', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <Icon name="i-chev-l" size={18} />
          </button>
          <span className="eye-d">Daily Check-in</span>
          <div style={{ width: 16 }} />
        </div>

        {/* ══ Habit card (gold) ═════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="card-g p-4 mb-4"
        >
          <div className="eye" style={{ marginBottom: 8 }}>TODAY&apos;S HABIT</div>
          <div className="row-i" style={{ gap: 12 }}>
            <span style={{ flexShrink: 0, color: 'var(--gold-300,#D4A853)' }}>
              <Icon name="i-target" size={26} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: 'var(--t1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {h.habit?.name_en ?? 'Daily Habit'}
              </div>
              <div className="ds-sub" style={{
                fontSize: 11, marginTop: 2,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
              }}>
                {h.habit?.description_en ?? ''}
              </div>
            </div>
          </div>

          {/* Streak badge */}
          <div className="row-i" style={{ marginTop: 12, gap: 6 }}>
            <Icon name="i-flame" size={12} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
            <span className="eye" style={{ fontSize: 10 }}>
              {streakDays} day{streakDays !== 1 ? 's' : ''} streak
            </span>
            {h.habit?.target_value && h.habit?.target_unit && (
              <>
                <span style={{ color: 'var(--t4)', fontSize: 9 }}>·</span>
                <span className="eye-d" style={{ fontSize: 9 }}>
                  Target: {h.habit.target_value} {h.habit.target_unit}
                </span>
              </>
            )}
          </div>
        </motion.div>

        {/* ══ Mood selector ════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="card p-4 mb-3"
        >
          <div className="eye" style={{ marginBottom: 12 }}>HOW DID IT GO?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {MOOD_OPTIONS.map(({ value, label }) => {
              const isSelected = mood === value;
              return (
                <button
                  key={value}
                  onClick={() => setMood(isSelected ? null : value)}
                  style={{
                    flex: 1,
                    padding: '9px 2px',
                    borderRadius: 10,
                    border: isSelected
                      ? '1px solid var(--gold-300,#D4A853)'
                      : '1px solid var(--line,rgba(255,255,255,.08))',
                    background: isSelected ? 'rgba(212,168,83,.1)' : 'transparent',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: isSelected ? 'var(--gold-300,#D4A853)' : 'var(--t3)',
                    cursor: 'pointer',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '.08em',
                    transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ══ Did you complete it? ══════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="card p-4 mb-3"
        >
          <div className="eye" style={{ marginBottom: 12 }}>DID YOU COMPLETE IT?</div>
          <div className="row-i" style={{ gap: 10 }}>
            {/* YES */}
            <button
              onClick={() => setCompleted(completed === true ? null : true)}
              style={{
                flex: 1, padding: 13, borderRadius: 12, cursor: 'pointer',
                border: completed === true
                  ? '1px solid var(--gold-300,#D4A853)'
                  : '1px solid var(--line,rgba(255,255,255,.08))',
                background: completed === true ? 'rgba(212,168,83,.1)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                color: completed === true ? 'var(--gold-300,#D4A853)' : 'var(--t3)',
                transition: 'all .15s',
              }}
            >
              <Icon name="i-check" size={14} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>YES</span>
            </button>
            {/* SKIP */}
            <button
              onClick={() => setCompleted(completed === false ? null : false)}
              style={{
                flex: 1, padding: 13, borderRadius: 12, cursor: 'pointer',
                border: completed === false
                  ? '1px solid rgba(239,68,68,.5)'
                  : '1px solid var(--line,rgba(255,255,255,.08))',
                background: completed === false ? 'rgba(239,68,68,.08)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                color: completed === false ? 'rgb(239,68,68)' : 'var(--t3)',
                transition: 'all .15s',
              }}
            >
              <Icon name="i-x" size={14} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>SKIP</span>
            </button>
          </div>
        </motion.div>

        {/* ══ Daily signals (optional, Phase 2) ═══════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="card p-4 mb-4"
        >
          <div className="eye" style={{ marginBottom: 10 }}>
            DAILY SIGNALS <span style={{ color: 'var(--t4)', fontSize: 9, fontWeight: 400 }}>(OPTIONAL)</span>
          </div>
          {([
            ['Went to the toilet today (№2)', bowel, setBowel],
            ['Slept 8h or more', slept8h, setSlept8h],
            ['Drank enough water (~1.5 L+)', waterOk, setWaterOk],
          ] as Array<[string, boolean | null, (v: boolean | null) => void]>).map(([label, value, setter]) => (
            <div key={label} className="row-b" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--t2)' }}>{label}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[true, false].map((opt) => (
                  <button key={String(opt)}
                    onClick={() => setter(value === opt ? null : opt)}
                    style={{
                      width: 40, padding: '4px 0', borderRadius: 8, cursor: 'pointer', fontSize: 10,
                      fontFamily: 'var(--font-mono)', fontWeight: 700,
                      border: `1px solid ${value === opt ? (opt ? 'rgba(101,211,135,.5)' : 'rgba(239,68,68,.4)') : 'var(--line)'}`,
                      background: value === opt ? (opt ? 'rgba(101,211,135,.1)' : 'rgba(239,68,68,.07)') : 'transparent',
                      color: value === opt ? (opt ? 'var(--ok,#65D387)' : 'rgb(239,68,68)') : 'var(--t4)',
                    }}>
                    {opt ? 'YES' : 'NO'}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="row-b">
            <span style={{ fontSize: 11, color: 'var(--t2)' }}>Energy today</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n}
                  onClick={() => setEnergy(energy === n ? null : n)}
                  style={{
                    width: 26, padding: '4px 0', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    border: `1px solid ${energy === n ? 'var(--gold-300,#D4A853)' : 'var(--line)'}`,
                    background: energy === n ? 'rgba(212,168,83,.12)' : 'transparent',
                    color: energy === n ? 'var(--gold-300,#D4A853)' : 'var(--t4)',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ══ Note (optional) ══════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
          className="card p-4 mb-4"
        >
          <div className="eye" style={{ marginBottom: 8 }}>NOTE <span style={{ color: 'var(--t4)', fontSize: 9, fontWeight: 400 }}>(OPTIONAL)</span></div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="How are you feeling? Any obstacles?"
            maxLength={500}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--t1)',
              fontSize: 13,
              resize: 'none',
              fontFamily: 'inherit',
              minHeight: 64,
              lineHeight: 1.5,
              caretColor: 'var(--gold-300,#D4A853)',
            }}
          />
          {note.length > 0 && (
            <div style={{ textAlign: 'right', fontSize: 9, color: 'var(--t4)', marginTop: 2,
              fontFamily: 'var(--font-mono)' }}>
              {note.length}/500
            </div>
          )}
        </motion.div>

        {/* ══ Submit button ═════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          <AnimatePresence mode="wait">
            {saved ? (
              /* ── Success state ── */
              <motion.button
                key="saved"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                style={{
                  ...goldBtnStyle,
                  background: '#22c55e',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'default',
                }}
                disabled
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                  style={{ display: 'inline-flex' }}
                >
                  <Check size={16} strokeWidth={2.5} aria-hidden />
                </motion.span>
                Logged!
              </motion.button>
            ) : (
              /* ── Default / saving state ── */
              <motion.button
                key="submit"
                onClick={handleSubmit}
                disabled={completed === null || saving}
                whileTap={completed !== null && !saving ? { scale: 0.97 } : {}}
                style={{
                  ...goldBtnStyle,
                  background: completed !== null ? 'var(--gold-300,#D4A853)' : 'rgba(255,255,255,.05)',
                  color: completed !== null ? '#0a0a0a' : 'var(--t4)',
                  cursor: completed !== null && !saving ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {saving ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,.3)',
                        borderTopColor: '#0a0a0a', borderRadius: '50%', display: 'inline-block' }}
                    />
                    Saving…
                  </>
                ) : 'Log Check-in'}
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

      </motion.div>

      <BotNav routes={clientNav} />
    </div>
  );
}
