'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Scale, Activity, Target, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Measurement, ClientProfile, ClientHabit } from '@/lib/types';
import BottomNav from '@/components/BottomNav';

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
      const x = padX + (i / (arr.length - 1)) * chartW;
      const y = padY + (1 - ((m.weight_kg as number) - minW) / range) * chartH;
      return `${x},${y}`;
    });

  const polyline = points.join(' ');

  // Gradient area
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
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
            const x = padX + (i / (arr.length - 1)) * chartW;
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

  const today = new Date().toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
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
  }, []);

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

    const { data } = await supabase.from('measurements').insert(entry).select().single();
    if (data) {
      setMeasurements((prev) => [...prev, data]);
      setShowForm(false);
      setFormWeight('');
      setFormBf('');
      setFormWaist('');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="gold-text text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        <h1 className="text-2xl font-bold text-stone-100 mb-6">Progress</h1>

        {/* Weight Trend */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-5 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <Scale size={14} /> Weight Trend
            </h3>
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-xs gold-text flex items-center gap-1 font-medium"
            >
              <Plus size={14} /> Log
            </button>
          </div>

          <WeightChart measurements={measurements} />

          {/* Add Weight Form */}
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-white/5"
            >
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <label className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Weight (kg)*
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    className="input-dark text-sm mt-1"
                    placeholder="75.0"
                  />
                </div>
                <div>
                  <label className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Body Fat %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formBf}
                    onChange={(e) => setFormBf(e.target.value)}
                    className="input-dark text-sm mt-1"
                    placeholder="18.0"
                  />
                </div>
                <div>
                  <label className="text-stone-500 text-[10px] uppercase tracking-wider">
                    Waist (cm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formWaist}
                    onChange={(e) => setFormWaist(e.target.value)}
                    className="input-dark text-sm mt-1"
                    placeholder="82"
                  />
                </div>
              </div>
              <button
                onClick={addMeasurement}
                disabled={saving || !formWeight}
                className="btn-gold w-full text-sm py-2"
              >
                {saving ? 'Saving...' : 'Save Measurement'}
              </button>
            </motion.div>
          )}
        </motion.div>

        {/* Current Stats */}
        {clientProfile && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass p-5 mb-4"
          >
            <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Target size={14} /> Current Stats
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-stone-500 text-[10px] uppercase">Weight</p>
                <p className="text-stone-100 text-lg font-semibold">
                  {clientProfile.weight_kg ?? '—'} <span className="text-xs text-stone-500">kg</span>
                </p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px] uppercase">BMR</p>
                <p className="text-stone-100 text-lg font-semibold">
                  {clientProfile.bmr ?? '—'} <span className="text-xs text-stone-500">kcal</span>
                </p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px] uppercase">TDEE</p>
                <p className="text-stone-100 text-lg font-semibold">
                  {clientProfile.tdee ?? '—'} <span className="text-xs text-stone-500">kcal</span>
                </p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px] uppercase">Target</p>
                <p className="gold-text text-lg font-semibold">
                  {clientProfile.target_calories ?? '—'} <span className="text-xs">kcal</span>
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-red-400 font-bold text-sm">
                  {clientProfile.target_protein_g ?? '—'}g
                </p>
                <p className="text-stone-600 text-[10px]">Protein</p>
              </div>
              <div>
                <p className="text-blue-400 font-bold text-sm">
                  {clientProfile.target_carbs_g ?? '—'}g
                </p>
                <p className="text-stone-600 text-[10px]">Carbs</p>
              </div>
              <div>
                <p className="text-purple-400 font-bold text-sm">
                  {clientProfile.target_fat_g ?? '—'}g
                </p>
                <p className="text-stone-600 text-[10px]">Fat</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Habit History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass p-5"
        >
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity size={14} /> Completed Habits
          </h3>
          {completedHabits.length === 0 ? (
            <p className="text-stone-500 text-sm text-center py-4">
              No completed habits yet. Keep going!
            </p>
          ) : (
            <div className="space-y-3">
              {completedHabits.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]"
                >
                  <span className="text-xl">{ch.habit?.emoji ?? '✅'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-stone-200 text-sm font-medium truncate">
                      {ch.habit?.name_en ?? 'Habit'}
                    </p>
                    <p className="text-stone-500 text-xs">
                      {ch.completed_at
                        ? new Date(ch.completed_at).toLocaleDateString()
                        : ''}
                      {' '}&middot; Best streak: {ch.best_streak} days
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="gold-text text-sm font-semibold">
                      {ch.total_completions}
                    </p>
                    <p className="text-stone-600 text-[10px]">check-ins</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
