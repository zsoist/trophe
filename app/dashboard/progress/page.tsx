'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingDown, TrendingUp, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Measurement, ClientProfile, ClientHabit } from '@/lib/types';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';
import ProgressPhotos from '@/components/ProgressPhotos';
import WeeklyMacroChart from '@/components/WeeklyMacroChart';
import HabitRadar from '@/components/HabitRadar';
import { localToday } from '../../../lib/dates';

// ─── Glass accordion card ─────────────────────────────────────────
function Section({
  title, icon, children, defaultOpen = true, accent = false,
}: {
  title: string; icon: string; children: React.ReactNode;
  defaultOpen?: boolean; accent?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={accent ? 'card-g mb-3' : 'card mb-3'} style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 14px', cursor: 'pointer', background: 'transparent', border: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={13}
            style={{ color: accent ? 'var(--gold-300,#D4A853)' : 'var(--t3,#A8A29E)' }} />
          <span className="eye-d">{title}</span>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <Icon name="i-chev-d" size={12} style={{ color: 'var(--t4,#78716C)' }} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WeightChart({ measurements }: { measurements: Measurement[] }) {
  if (measurements.length < 2) {
    return (
      <div className="text-center py-8 text-stone-500 text-sm">
        Log at least 2 weights to see a trend
      </div>
    );
  }

  const weights = measurements
    .filter((m) => m.weight_kg !== null)
    .map((m) => m.weight_kg as number);
  const minW = Math.min(...weights) - 1;
  const maxW = Math.max(...weights) + 1;
  const range = maxW - minW || 1;

  const width = 320;
  const height = 140;
  const padX = 8;
  const padY = 12;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = measurements
    .filter((m) => m.weight_kg !== null)
    .map((m, i, arr) => {
      const x = padX + (i / (Math.max(arr.length - 1, 1))) * chartW;
      const y = padY + (1 - ((m.weight_kg as number) - minW) / range) * chartH;
      return `${x},${y}`;
    });

  const polyline = points.join(' ');

  // Gradient area
  const areaPoints = `${padX},${height - padY} ${polyline} ${padX + chartW},${height - padY}`;

  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const diff = lastWeight - firstWeight;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {diff < 0 ? (
            <TrendingDown size={16} className="text-green-400" />
          ) : diff > 0 ? (
            <TrendingUp size={16} className="text-red-400" />
          ) : null}
          <span className="text-stone-400 text-xs">
            {diff > 0 ? '+' : ''}
            {diff.toFixed(1)} kg over {measurements.length} entries
          </span>
        </div>
        <span className="text-stone-100 font-semibold text-sm">
          {lastWeight.toFixed(1)} kg
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A853" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#D4A853" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((pct) => (
          <line
            key={pct}
            x1={padX}
            y1={padY + pct * chartH}
            x2={width - padX}
            y2={padY + pct * chartH}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}
        {/* Area */}
        <polygon points={areaPoints} fill="url(#weightGrad)" />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="#D4A853"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {measurements
          .filter((m) => m.weight_kg !== null)
          .map((m, i, arr) => {
            const x = padX + (i / (Math.max(arr.length - 1, 1))) * chartW;
            const y = padY + (1 - ((m.weight_kg as number) - minW) / range) * chartH;
            return (
              <circle
                key={m.id}
                cx={x}
                cy={y}
                r={i === arr.length - 1 ? 4 : 2.5}
                fill={i === arr.length - 1 ? '#D4A853' : '#B8923E'}
                stroke={i === arr.length - 1 ? '#0a0a0a' : 'none'}
                strokeWidth={2}
              />
            );
          })}
        {/* Min/Max labels */}
        <text x={width - padX} y={padY + 4} textAnchor="end" fill="#78716c" fontSize={9}>
          {maxW.toFixed(0)} kg
        </text>
        <text x={width - padX} y={height - padY + 10} textAnchor="end" fill="#78716c" fontSize={9}>
          {minW.toFixed(0)} kg
        </text>
      </svg>
    </div>
  );
}


export default function ProgressPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [completedHabits, setCompletedHabits] = useState<ClientHabit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formWeight, setFormWeight] = useState('');
  const [formBf, setFormBf] = useState('');
  const [formWaist, setFormWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const today = localToday();

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const [measRes, cpRes, habRes] = await Promise.all([
        supabase
          .from('measurements')
          .select('*')
          .eq('user_id', user.id)
          .order('measured_date', { ascending: true })
          .limit(30),
        supabase
          .from('client_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('client_habits')
          .select('*, habit:habits(*)')
          .eq('client_id', user.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(10),
      ]);

      if (measRes.data) setMeasurements(measRes.data);
      if (cpRes.data) setClientProfile(cpRes.data);
      if (habRes.data) setCompletedHabits(habRes.data as ClientHabit[]);
    } catch (err) {
      console.error('Progress load error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addMeasurement = async () => {
    if (!userId || !formWeight) return;
    setSaving(true);

    const entry = {
      user_id: userId,
      measured_date: today,
      weight_kg: parseFloat(formWeight),
      body_fat_pct: formBf ? parseFloat(formBf) : null,
      waist_cm: formWaist ? parseFloat(formWaist) : null,
    };

    const { data } = await supabase.from('measurements').insert(entry).select().maybeSingle();
    if (data) {
      setMeasurements((prev) => [...prev, data]);
      setShowForm(false);
      setFormWeight('');
      setFormBf('');
      setFormWaist('');
    }
    setSaving(false);
  };

  const CLIENT_NAV = [
    { href: '/dashboard',          label: 'Home',     icon: <Icon name="i-home"  size={18} /> },
    { href: '/dashboard/log',      label: 'Log',      icon: <Icon name="i-book"  size={18} /> },
    { href: '/dashboard/progress', label: 'Progress', icon: <Icon name="i-chart" size={18} /> },
    { href: '/dashboard/profile',  label: 'Me',       icon: <Icon name="i-user"  size={18} /> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <div className="max-w-md mx-auto px-4 pt-12 space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="card" style={{ height: 56, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
        <BotNav routes={CLIENT_NAV} />
      </div>
    );
  }

  // Goal projection logic
  const weights = measurements.filter(m => m.weight_kg !== null);
  const earliest = weights[0];
  const latest   = weights[weights.length - 1];
  const daysBetween = weights.length > 1
    ? Math.max(1, (new Date(latest.measured_date).getTime() - new Date(earliest.measured_date).getTime()) / 86400000)
    : 0;
  const weeklyChange  = daysBetween > 0 ? ((latest.weight_kg as number) - (earliest.weight_kg as number)) / (daysBetween / 7) : 0;
  const isLossGoal    = clientProfile?.goal === 'fat_loss';
  const isGainGoal    = clientProfile?.goal === 'muscle_gain';
  const movingWrong   = (isLossGoal && weeklyChange > 0.05) || (isGainGoal && weeklyChange < -0.05);
  const currentWeight = latest?.weight_kg as number ?? 0;
  let weeksToGoal: number | null = null;
  let goalWeightTarget: number | null = null;
  if (isLossGoal && weeklyChange < -0.01) { goalWeightTarget = currentWeight - 5; weeksToGoal = Math.abs(5 / weeklyChange); }
  if (isGainGoal && weeklyChange > 0.01)  { goalWeightTarget = currentWeight + 3; weeksToGoal = Math.abs(3 / weeklyChange); }

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-md mx-auto px-4 pt-4"
      >
        {/* Header */}
        <div className="row-b mb-4">
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1,#FAFAF9)', letterSpacing: '-.02em' }}>Progress</div>
            <div className="ds-sub">Track your body & habits</div>
          </div>
          <span className="tag tag-g">
            <Icon name="i-graph-up" size={9} />
            {measurements.length} entries
          </span>
        </div>

        {/* ── Weight Trend (accent, open by default) ── */}
        <Section title="Weight Trend" icon="i-pulse" accent defaultOpen>
          <WeightChart measurements={measurements} />
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10 }}>
            <button
              onClick={() => setShowForm(f => !f)}
              className="btn-ghost w-full"
              style={{ fontSize: 11, padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              <Plus size={12} />
              {showForm ? 'Cancel' : 'Log measurement'}
            </button>
          </div>
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', marginTop: 8 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {[
                    { label: 'Weight (kg)*', val: formWeight, set: setFormWeight, step: '0.1', ph: '75.0' },
                    { label: 'Body Fat %',   val: formBf,     set: setFormBf,     step: '0.1', ph: '18.0' },
                    { label: 'Waist (cm)',   val: formWaist,  set: setFormWaist,  step: '0.5', ph: '82' },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="eye-d" style={{ marginBottom: 4 }}>{f.label}</div>
                      <input type="number" step={f.step} value={f.val}
                        onChange={e => f.set(e.target.value)}
                        className="input-dark" style={{ fontSize: 12, width: '100%' }}
                        placeholder={f.ph} />
                    </div>
                  ))}
                </div>
                <button onClick={addMeasurement} disabled={saving || !formWeight}
                  className="btn-gold w-full" style={{ fontSize: 11, padding: '8px' }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* ── Goal Projection ── */}
        <Section title="Goal Projection" icon="i-target">
          {weights.length < 3 ? (
            <p className="ds-sub" style={{ textAlign: 'center', padding: '12px 0' }}>
              Log at least 3 weights to see projections
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row-b">
                <span className="ds-sub">Weekly trend</span>
                <span style={{
                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                  color: weeklyChange > 0 ? 'var(--err,#E87A6E)' : weeklyChange < 0 ? 'var(--ok,#65D387)' : 'var(--t4)',
                }}>
                  {weeklyChange > 0 ? <TrendingUp size={12}/> : weeklyChange < 0 ? <TrendingDown size={12}/> : null}
                  {weeklyChange > 0 ? '+' : ''}{weeklyChange.toFixed(2)} kg/wk
                </span>
              </div>
              {weeksToGoal !== null && goalWeightTarget !== null && !movingWrong && (
                <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(212,168,83,.06)', border: '1px solid rgba(212,168,83,.15)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t2)' }}>
                    At this rate, you&apos;ll reach{' '}
                    <span style={{ color: 'var(--gold-300,#D4A853)', fontWeight: 700 }}>{goalWeightTarget.toFixed(1)} kg</span>
                    {' '}in ~<span style={{ color: 'var(--gold-300,#D4A853)', fontWeight: 700 }}>{Math.round(weeksToGoal)}</span> weeks
                  </span>
                </div>
              )}
              {movingWrong && (
                <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(232,122,110,.05)', border: '1px solid rgba(232,122,110,.15)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={13} style={{ color: 'var(--err,#E87A6E)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--err,#E87A6E)' }}>
                    Trend moving away from your {isLossGoal ? 'fat loss' : 'muscle gain'} goal
                  </span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Weekly Macros ── */}
        <Section title="Weekly Macros" icon="i-bars">
          <WeeklyMacroChart
            userId={userId}
            targetCalories={clientProfile?.target_calories ?? 2000}
            targetProtein={clientProfile?.target_protein_g ?? 150}
            targetCarbs={clientProfile?.target_carbs_g ?? 200}
            targetFat={clientProfile?.target_fat_g ?? 65}
          />
        </Section>

        {/* ── Current Stats ── */}
        {clientProfile && (
          <Section title="Current Stats" icon="i-database">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
              {[
                { label: 'Weight', val: clientProfile.weight_kg, unit: 'kg' },
                { label: 'BMR',    val: clientProfile.bmr,        unit: 'kcal' },
                { label: 'TDEE',   val: clientProfile.tdee,       unit: 'kcal' },
                { label: 'Target', val: clientProfile.target_calories, unit: 'kcal', gold: true },
              ].map(s => (
                <div key={s.label}>
                  <div className="eye-d">{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.gold ? 'var(--gold-300,#D4A853)' : 'var(--t1,#FAFAF9)', marginTop: 2 }}>
                    {s.val ?? '—'}<span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 3 }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { label: 'Protein', val: clientProfile.target_protein_g, color: 'var(--err,#E87A6E)' },
                { label: 'Carbs',   val: clientProfile.target_carbs_g,   color: 'var(--info,#7DA3D9)' },
                { label: 'Fat',     val: clientProfile.target_fat_g,     color: '#B89DD9' },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.val ?? '—'}g</div>
                  <div className="eye-d">{m.label}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Completed Habits ── */}
        <Section title="Completed Habits" icon="i-trophy" defaultOpen={false}>
          {completedHabits.length === 0 ? (
            <p className="ds-sub" style={{ textAlign: 'center', padding: '12px 0' }}>No completed habits yet. Keep going!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {completedHabits.map(ch => (
                <div key={ch.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.02)',
                }}>
                  <Icon name="i-check" size={12} style={{ color: 'var(--ok,#65D387)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ch.habit?.name_en ?? 'Habit'}
                    </div>
                    <div className="ds-sub">
                      Best streak: {ch.best_streak}d
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-300,#D4A853)' }}>{ch.total_completions}</div>
                    <div className="eye-d">check-ins</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Habit Balance Radar ── */}
        <Section title="Habit Balance" icon="i-target" defaultOpen={false}>
          <HabitRadar userId={userId} />
        </Section>

        {/* ── Progress Photos ── */}
        <Section title="Progress Photos" icon="i-image" defaultOpen={false}>
          <ProgressPhotos />
        </Section>

      </motion.div>

      <BotNav routes={CLIENT_NAV} />
    </div>
  );
}
