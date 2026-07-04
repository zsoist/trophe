'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TrendingDown, TrendingUp, Plus, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Measurement, ClientProfile, ClientHabit } from '@/lib/types';
import { BotNav } from '@/components/ui/BotNav';
import { Icon, AnimatedValue } from '@/components/ui';
import { useClientNav } from '@/lib/useClientNav';
import ProgressPhotos from '@/components/progress/ProgressPhotos';
import CustomizeSheet from '@/components/progress/CustomizeSheet';
import WeeklyMacroChart from '@/components/charts/WeeklyMacroChart';
import HabitRadar from '@/components/charts/HabitRadar';
import BodyCompCalculator from '@/components/health/BodyCompCalculator';
import { CLIENT_VIEW_PANELS, isPanelVisible, parseClientViewPrefs } from '@/lib/display-prefs';
import { useAppearance } from '@/components/shared/AppearanceProvider';
import { isProgressPanelOn, orderedPanels } from '@/lib/appearance';
import { MACRO_COLORS } from '@/lib/macro-colors';
import { localToday } from '../../../lib/utils/dates';

/*
 * Client Progress — registry-driven, user-customizable.
 * Panels render in the user's order (lib/appearance PROGRESS_PANELS), each
 * togglable from the header gear; coach gates (client_view_prefs) always win.
 * All accent styling reads var(--accent) so the settings accent picker
 * re-themes this page live.
 */

// ─── Glass accordion card ─────────────────────────────────────────
function Section({
  title, icon, children, defaultOpen = true, accent = false,
}: {
  title: string; icon: string; children: React.ReactNode;
  defaultOpen?: boolean; accent?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={accent ? 'card-g mb-3 panel-gap' : 'card mb-3 panel-gap'} style={{ overflow: 'hidden' }}>
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
            style={{ color: accent ? 'var(--accent,#D4A853)' : 'var(--t3,#A8A29E)' }} />
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

// ─── Weight chart (accent-aware, period-filterable) ───────────────
type Period = 30 | 90 | 0; // 0 = all

function WeightChart({ measurements, onLogFirst }: { measurements: Measurement[]; onLogFirst?: () => void }) {
  const reducedMotion = useReducedMotion();
  const { t } = useI18n();
  const [period, setPeriod] = useState<Period>(90);
  // Clock snapshot per mount — period cutoffs don't need live ticking and
  // Date.now() during render violates react-hooks/purity.
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    if (period === 0) return measurements;
    const cutoff = now - period * 86400_000;
    return measurements.filter((m) => new Date(m.measured_date).getTime() >= cutoff);
  }, [measurements, period, now]);

  if (measurements.length < 2) {
    return (
      <div className="text-center py-8">
        <p className="text-stone-500 text-sm">{t('progress.need_two_weights')}</p>
        {onLogFirst && (
          <button
            onClick={onLogFirst}
            className="btn-ghost mt-3"
            style={{ fontSize: 12, padding: '10px 16px', minHeight: 40 }}
          >
            {t('progress.log_weight_cta')}
          </button>
        )}
      </div>
    );
  }

  const source = filtered.length >= 2 ? filtered : measurements;
  const rows = source.filter((m) => m.weight_kg !== null);
  const weights = rows.map((m) => m.weight_kg as number);
  const minW = Math.min(...weights) - 1;
  const maxW = Math.max(...weights) + 1;
  const range = maxW - minW || 1;

  const width = 320, height = 140, padX = 8, padY = 12;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const coords = rows.map((m, i, arr) => ({
    x: padX + (i / Math.max(arr.length - 1, 1)) * chartW,
    y: padY + (1 - ((m.weight_kg as number) - minW) / range) * chartH,
    id: m.id,
  }));
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPoints = `${padX},${height - padY} ${polyline} ${padX + chartW},${height - padY}`;

  const diff = weights[weights.length - 1] - weights[0];
  const lastWeight = weights[weights.length - 1];

  const PERIODS: Array<{ v: Period; label: string }> = [
    { v: 30, label: t('progress.period_30d') },
    { v: 90, label: t('progress.period_90d') },
    { v: 0, label: t('progress.period_all') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {diff < 0 ? (
            <TrendingDown size={16} style={{ color: 'var(--ok,#65D387)' }} />
          ) : diff > 0 ? (
            <TrendingUp size={16} style={{ color: 'var(--err,#E87A6E)' }} />
          ) : null}
          <span className="text-stone-400 text-xs">
            {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg · {rows.length} {t('progress.entries')}
          </span>
        </div>
        <span className="display-lg" style={{ fontSize: 26, lineHeight: '28px', color: 'var(--t1,#FAFAF9)' }}>
          {lastWeight.toFixed(1)}
          <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 11, color: 'var(--t4)', marginLeft: 3 }}>kg</span>
        </span>
      </div>

      {/* Period pills */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button
            key={p.v}
            onClick={() => setPeriod(p.v)}
            style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              background: period === p.v ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${period === p.v ? 'var(--accent)' : 'var(--line)'}`,
              color: period === p.v ? 'var(--accent)' : 'var(--t4)',
              transition: 'all .15s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent,#D4A853)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent,#D4A853)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((pct) => (
          <line
            key={pct}
            x1={padX} y1={padY + pct * chartH} x2={width - padX} y2={padY + pct * chartH}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}
        <motion.polygon
          key={`area-${period}`}
          points={areaPoints}
          fill="url(#weightGrad)"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7, ease: 'easeOut' }}
        />
        <motion.polyline
          key={`line-${period}`}
          points={polyline}
          fill="none"
          stroke="var(--accent,#D4A853)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reducedMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
        {coords.map((c, i, arr) => (
          <motion.circle
            key={`${c.id}-${period}`}
            cx={c.x} cy={c.y}
            r={i === arr.length - 1 ? 4 : 2.5}
            fill={i === arr.length - 1 ? 'var(--accent,#D4A853)' : 'var(--accent-strong,#B8923E)'}
            opacity={i === arr.length - 1 ? 1 : 0.7}
            stroke={i === arr.length - 1 ? 'var(--bg,#0a0a0a)' : 'none'}
            strokeWidth={2}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: i === arr.length - 1 ? 1 : 0.7 }}
            transition={{ duration: 0.3, delay: reducedMotion ? 0 : 0.15 + (i / Math.max(arr.length - 1, 1)) * 0.9 }}
          />
        ))}
        <text x={width - padX} y={padY + 4} textAnchor="end" fill="var(--t4,#78716c)" fontSize={9}>
          {maxW.toFixed(0)} kg
        </text>
        <text x={width - padX} y={height - padY + 10} textAnchor="end" fill="var(--t4,#78716c)" fontSize={9}>
          {minW.toFixed(0)} kg
        </text>
      </svg>
    </div>
  );
}

export default function ProgressPage() {
  const router = useRouter();
  const clientNav = useClientNav();
  const { t } = useI18n();
  const { prefs } = useAppearance();
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [completedHabits, setCompletedHabits] = useState<ClientHabit[]>([]);
  const [activeStreak, setActiveStreak] = useState<number>(0);
  const [showForm, setShowForm] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [formWeight, setFormWeight] = useState('');
  const [formBf, setFormBf] = useState('');
  const [formWaist, setFormWaist] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const today = localToday();

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const [measRes, cpRes, habRes, activeRes] = await Promise.all([
        supabase
          .from('measurements')
          .select('*')
          .eq('user_id', user.id)
          .order('measured_date', { ascending: true }),
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
        supabase
          .from('client_habits')
          .select('current_streak')
          .eq('client_id', user.id)
          .eq('status', 'active')
          .limit(1),
      ]);

      if (measRes.data) setMeasurements(measRes.data);
      if (cpRes.data) setClientProfile(cpRes.data);
      if (habRes.data) setCompletedHabits(habRes.data as ClientHabit[]);
      if (activeRes.data?.[0]) setActiveStreak(activeRes.data[0].current_streak ?? 0);
    } catch (err) {
      console.error('Progress load error:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

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
      setFormWeight(''); setFormBf(''); setFormWaist('');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: 'var(--bg,#0a0a0a)' }}>
        <div className="max-w-md mx-auto px-4 pt-12 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{ height: 56, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
        <BotNav routes={clientNav} />
      </div>
    );
  }

  // Coach-controlled gates (client_view_prefs) — always win over user prefs.
  const viewPrefs = parseClientViewPrefs(
    (clientProfile as (ClientProfile & { client_view_prefs?: unknown }) | null)?.client_view_prefs,
  );
  const coachGates = {
    showCalories: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'showCalories'),
    logAnalytics: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'logAnalytics'),
    nutritionIntel: isPanelVisible(CLIENT_VIEW_PANELS, viewPrefs, 'nutritionIntel'),
  };
  const showCalories = coachGates.showCalories;

  // Trend math
  const weights = measurements.filter(m => m.weight_kg !== null);
  const earliest = weights[0];
  const latest = weights[weights.length - 1];
  const daysBetween = weights.length > 1
    ? Math.max(1, (new Date(latest.measured_date).getTime() - new Date(earliest.measured_date).getTime()) / 86400000)
    : 0;
  const weeklyChange = daysBetween > 0 ? ((latest.weight_kg as number) - (earliest.weight_kg as number)) / (daysBetween / 7) : 0;
  const totalDelta = weights.length > 1 ? (latest.weight_kg as number) - (earliest.weight_kg as number) : 0;
  const isLossGoal = clientProfile?.goal === 'fat_loss';
  const isGainGoal = clientProfile?.goal === 'muscle_gain';
  const movingWrong = (isLossGoal && weeklyChange > 0.05) || (isGainGoal && weeklyChange < -0.05);
  const currentWeight = latest?.weight_kg as number ?? 0;
  let weeksToGoal: number | null = null;
  let goalWeightTarget: number | null = null;
  if (isLossGoal && weeklyChange < -0.01) { goalWeightTarget = currentWeight - 5; weeksToGoal = Math.abs(5 / weeklyChange); }
  if (isGainGoal && weeklyChange > 0.01) { goalWeightTarget = currentWeight + 3; weeksToGoal = Math.abs(3 / weeklyChange); }
  const deltaGood = (isLossGoal && totalDelta < 0) || (isGainGoal && totalDelta > 0);

  // ─── Panel renderers (registry-driven) ───────────────────────────
  const renderPanel = (id: string): React.ReactNode => {
    switch (id) {
      case 'journey':
        return (
          <div key={id} className="card-g mb-3 panel-gap" style={{ padding: '14px 16px' }}>
            <div className="eye-d" style={{ marginBottom: 10, color: 'var(--accent)' }}>{t('progress.panel_journey')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div className="display-lg" style={{ fontSize: 24, color: 'var(--t1)' }}>
                  {weights.length ? (
                    <AnimatedValue value={Number(currentWeight.toFixed(1))} decimals={1} />
                  ) : '—'}
                  <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', fontSize: 10, color: 'var(--t4)', marginLeft: 2 }}>kg</span>
                </div>
                <div className="eye-d" style={{ marginTop: 2 }}>{t('progress.journey_current')}</div>
              </div>
              <div>
                <div style={{
                  fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: weights.length > 1 ? (deltaGood ? 'var(--ok,#65D387)' : totalDelta === 0 ? 'var(--t1)' : 'var(--warn,#E8B86E)') : 'var(--t1)',
                }}>
                  {weights.length > 1 ? (
                    <>
                      {totalDelta > 0 ? '+' : ''}
                      <AnimatedValue value={Number(totalDelta.toFixed(1))} decimals={1} />
                    </>
                  ) : '—'}
                  <span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 2 }}>kg</span>
                </div>
                <div className="eye-d" style={{ marginTop: 2 }}>{t('progress.journey_change')}</div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  <AnimatedValue value={activeStreak} />
                  <span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 2 }}>{t('progress.journey_days')}</span>
                </div>
                <div className="eye-d" style={{ marginTop: 2 }}>{t('progress.journey_streak')}</div>
              </div>
            </div>
          </div>
        );
      case 'weightTrend':
        return (
          <Section key={id} title={t('progress.panel_weight')} icon="i-pulse" accent defaultOpen>
            <WeightChart
              measurements={measurements}
              onLogFirst={() => {
                setShowForm(true);
                requestAnimationFrame(() =>
                  document.getElementById('weight-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                );
              }}
            />
            <div id="weight-form" style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10 }}>
              <button
                onClick={() => setShowForm(f => !f)}
                className="btn-ghost w-full"
                style={{ fontSize: 11, padding: '10px 7px', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <Plus size={12} />
                {showForm ? t('general.cancel') : t('progress.log_measurement')}
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
                      { label: t('progress.form_weight'), val: formWeight, set: setFormWeight, step: '0.1', ph: '75.0' },
                      { label: t('progress.form_bf'), val: formBf, set: setFormBf, step: '0.1', ph: '18.0' },
                      { label: t('progress.form_waist'), val: formWaist, set: setFormWaist, step: '0.5', ph: '82' },
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
                    {saving ? t('profile.saving') : t('general.save')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>
        );
      case 'goalProjection':
        return (
          <Section key={id} title={t('progress.panel_goal')} icon="i-target">
            {weights.length < 3 ? (
              <p className="ds-sub" style={{ textAlign: 'center', padding: '12px 0' }}>
                {t('progress.need_three_weights')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="row-b">
                  <span className="ds-sub">{t('progress.weekly_trend')}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                    color: weeklyChange > 0 ? 'var(--err,#E87A6E)' : weeklyChange < 0 ? 'var(--ok,#65D387)' : 'var(--t4)',
                  }}>
                    {weeklyChange > 0 ? <TrendingUp size={12} /> : weeklyChange < 0 ? <TrendingDown size={12} /> : null}
                    {weeklyChange > 0 ? '+' : ''}{weeklyChange.toFixed(2)} kg/wk
                  </span>
                </div>
                {weeksToGoal !== null && goalWeightTarget !== null && !movingWrong && (
                  <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>
                      {t('progress.projection_prefix')}{' '}
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{goalWeightTarget.toFixed(1)} kg</span>
                      {' '}{t('progress.projection_in')} ~<span style={{ color: 'var(--accent)', fontWeight: 700 }}>{Math.round(weeksToGoal)}</span> {t('progress.projection_weeks')}
                    </span>
                  </div>
                )}
                {movingWrong && (
                  <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(232,122,110,.05)', border: '1px solid rgba(232,122,110,.15)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <AlertTriangle size={13} style={{ color: 'var(--err,#E87A6E)', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--err,#E87A6E)' }}>
                      {isLossGoal ? t('progress.wrong_way_loss') : t('progress.wrong_way_gain')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Section>
        );
      case 'bodyComp':
        return (
          <Section key={id} title={t('progress.panel_bodycomp')} icon="i-pulse" defaultOpen={false}>
            <BodyCompCalculator sex={clientProfile?.sex === 'female' ? 'female' : 'male'} />
          </Section>
        );
      case 'weeklyMacros':
        if (!showCalories) return null;
        return (
          <Section key={id} title={t('progress.panel_macros')} icon="i-bars">
            <WeeklyMacroChart
              userId={userId}
              targetCalories={clientProfile?.target_calories ?? 2000}
              targetProtein={clientProfile?.target_protein_g ?? 150}
              targetCarbs={clientProfile?.target_carbs_g ?? 200}
              targetFat={clientProfile?.target_fat_g ?? 65}
            />
          </Section>
        );
      case 'currentStats':
        if (!clientProfile) return null;
        return (
          <Section key={id} title={t('progress.panel_stats')} icon="i-database">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
              {[
                { label: t('onboard.weight'), val: clientProfile.weight_kg, unit: 'kg' },
                { label: 'BMR', val: clientProfile.bmr, unit: 'kcal' },
                { label: 'TDEE', val: clientProfile.tdee, unit: 'kcal' },
                { label: t('progress.stat_target'), val: clientProfile.target_calories, unit: 'kcal', accent: true },
              ].filter(s => showCalories || s.unit !== 'kcal').map(s => (
                <div key={s.label}>
                  <div className="eye-d">{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.accent ? 'var(--accent)' : 'var(--t1,#FAFAF9)', marginTop: 2 }}>
                    {s.val ?? '—'}<span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 3 }}>{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { label: t('general.protein'), val: clientProfile.target_protein_g, color: MACRO_COLORS.protein },
                { label: t('general.carbs'), val: clientProfile.target_carbs_g, color: MACRO_COLORS.carbs },
                { label: t('general.fat'), val: clientProfile.target_fat_g, color: MACRO_COLORS.fat },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.val ?? '—'}g</div>
                  <div className="eye-d">{m.label}</div>
                </div>
              ))}
            </div>
          </Section>
        );
      case 'habitRadar':
        return (
          <Section key={id} title={t('progress.panel_radar')} icon="i-target" defaultOpen={false}>
            <HabitRadar userId={userId} />
          </Section>
        );
      case 'completedHabits':
        return (
          <Section key={id} title={t('progress.panel_habits')} icon="i-trophy" defaultOpen={false}>
            {completedHabits.length === 0 ? (
              <p className="ds-sub" style={{ textAlign: 'center', padding: '12px 0' }}>{t('progress.no_completed_habits')}</p>
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
                        {ch.habit?.name_en ?? t('progress.habit_fallback')}
                      </div>
                      <div className="ds-sub">
                        {t('progress.best_streak')}: {ch.best_streak}d
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{ch.total_completions}</div>
                      <div className="eye-d">{t('progress.checkins')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        );
      case 'photos':
        return (
          <Section key={id} title={t('progress.panel_photos')} icon="i-image" defaultOpen={false}>
            <ProgressPhotos />
          </Section>
        );
      default:
        return null;
    }
  };

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
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1,#FAFAF9)', letterSpacing: '-.02em' }}>
              {t('progress.title')}
            </div>
            <div className="ds-sub">{t('progress.subtitle')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tag tag-g">
              <Icon name="i-graph-up" size={9} />
              {measurements.length} {t('progress.entries')}
            </span>
            <button
              aria-label={t('progress.customize_title')}
              onClick={() => setShowCustomize(true)}
              style={{
                background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)', borderRadius: 10,
                padding: '7px 8px', cursor: 'pointer', color: 'var(--t3)', lineHeight: 0,
              }}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>

        {/* Registry-driven panels in the user's order */}
        {orderedPanels(prefs)
          .filter((p) => isProgressPanelOn(prefs, p.id))
          .map((p) => renderPanel(p.id))}
      </motion.div>

      <CustomizeSheet open={showCustomize} onClose={() => setShowCustomize(false)} coachGates={coachGates} />
      <BotNav routes={clientNav} />
    </div>
  );
}
