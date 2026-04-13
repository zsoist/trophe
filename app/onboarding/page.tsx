'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { calculateFullProfile, calculateBMR, calculateTDEE, calculateTargetCalories, GOAL_DESCRIPTIONS, ACTIVITY_DESCRIPTIONS } from '@/lib/nutrition-engine';
import type { Sex, ActivityLevel, Goal } from '@/lib/types';

const GOAL_ADJUSTMENT_LABELS: Record<Goal, string> = {
  fat_loss: '20% deficit',
  muscle_gain: '+300 kcal surplus',
  maintenance: 'No adjustment',
  recomp: '5% deficit',
  endurance: '+15%',
  health: 'No adjustment',
};

const steps = ['welcome', 'body', 'goal', 'activity', 'plan'] as const;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form state
  const [age, setAge] = useState(28);
  const [sex, setSex] = useState<Sex>('male');
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(78);
  const [goal, setGoal] = useState<Goal>('muscle_gain');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');

  const step = steps[stepIdx];

  // Calculate nutrition profile live
  const profile = useMemo(
    () => calculateFullProfile(weightKg, heightCm, age, sex, activity, goal),
    [weightKg, heightCm, age, sex, activity, goal],
  );

  function next() {
    setDirection(1);
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setDirection(-1);
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      await supabase.from('client_profiles').upsert({
        user_id: user.id,
        age, sex, height_cm: heightCm, weight_kg: weightKg,
        activity_level: activity, goal,
        bmr: profile.bmr, tdee: profile.tdee,
        target_calories: profile.calories,
        target_protein_g: profile.protein_g,
        target_carbs_g: profile.carbs_g,
        target_fat_g: profile.fat_g,
        target_fiber_g: profile.fiber_g,
        target_water_ml: profile.water_ml,
        coaching_phase: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      router.push('/dashboard');
    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center px-6 py-12">
      {/* Progress dots + percentage */}
      <div className="flex flex-col items-center gap-2 mb-12">
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === stepIdx ? 'w-8 bg-[#D4A853]' : i < stepIdx ? 'w-4 bg-[#D4A853]/40' : 'w-4 bg-stone-800'
              }`}
            />
          ))}
        </div>
        <p className="text-stone-600 text-xs">
          Step {stepIdx + 1} of {steps.length} &mdash; {Math.round(((stepIdx + 1) / steps.length) * 100)}%
        </p>
      </div>

      {/* Step content */}
      <div className="w-full max-w-md relative min-h-[480px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as const }}
            className="absolute inset-0"
          >
            {step === 'welcome' && (
              <div className="text-center space-y-6">
                <h1 className="font-serif text-4xl font-bold text-[#D4A853]">τροφή</h1>
                <p className="text-stone-300 text-lg">Welcome to your nutrition journey</p>
                <p className="text-stone-500 text-sm max-w-sm mx-auto">
                  We&apos;ll set up your personalized plan in just 4 quick steps.
                  Everything is based on evidence from ISSN, ACSM, and IOC.
                </p>
                <p className="text-stone-600 text-xs mt-2">
                  Trusted by Precision Nutrition certified coaches
                </p>
                <div className="pt-6">
                  <button onClick={next} className="btn-gold text-lg px-10 py-4">
                    Let&apos;s go →
                  </button>
                </div>
              </div>
            )}

            {step === 'body' && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-semibold text-stone-100">Body Stats</h2>
                  <p className="text-stone-500 text-sm">Used to calculate your BMR & targets</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-stone-400 text-sm mb-1.5">Age</label>
                    <input
                      type="number" value={age} onChange={(e) => setAge(+e.target.value)}
                      className="input-dark" min={14} max={80}
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 text-sm mb-2">Sex</label>
                    <div className="flex gap-2">
                      {(['male', 'female'] as Sex[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setSex(s)}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            sex === s
                              ? 'border-[#D4A853] bg-[rgba(212,168,83,0.08)] text-stone-100'
                              : 'border-stone-800 text-stone-500 hover:border-stone-600'
                          }`}
                        >
                          {s === 'male' ? '♂ Male' : '♀ Female'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-stone-400 text-sm mb-1.5">Height (cm): {heightCm}</label>
                  <input
                    type="range" min={140} max={220} value={heightCm}
                    onChange={(e) => setHeightCm(+e.target.value)}
                    className="w-full accent-[#D4A853]"
                  />
                  <div className="flex justify-between text-xs text-stone-600"><span>140</span><span>220</span></div>
                </div>

                <div>
                  <label className="block text-stone-400 text-sm mb-1.5">Weight (kg): {weightKg}</label>
                  <input
                    type="range" min={40} max={160} value={weightKg}
                    onChange={(e) => setWeightKg(+e.target.value)}
                    className="w-full accent-[#D4A853]"
                  />
                  <div className="flex justify-between text-xs text-stone-600"><span>40</span><span>160</span></div>
                </div>
              </div>
            )}

            {step === 'goal' && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-semibold text-stone-100">Your Goal</h2>
                  <p className="text-stone-500 text-sm">This shapes your macro targets</p>
                </div>

                <div className="space-y-3">
                  {(Object.keys(GOAL_DESCRIPTIONS) as Goal[]).map((g) => {
                    const d = GOAL_DESCRIPTIONS[g];
                    const previewBmr = calculateBMR(weightKg, heightCm, age, sex);
                    const previewTdee = calculateTDEE(previewBmr, activity);
                    const previewCals = calculateTargetCalories(previewTdee, g);
                    return (
                      <button
                        key={g}
                        onClick={() => setGoal(g)}
                        className={`w-full p-4 rounded-xl border text-left transition-all ${
                          goal === g
                            ? 'border-[#D4A853] bg-[rgba(212,168,83,0.08)] gold-glow'
                            : 'border-stone-800 hover:border-stone-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-lg mr-2">{d.emoji}</span>
                            <span className={`font-medium ${goal === g ? 'text-stone-100' : 'text-stone-300'}`}>
                              {d.en}
                            </span>
                          </div>
                          <span className="text-xs text-stone-500">
                            ~{previewCals} kcal
                          </span>
                        </div>
                        {goal === g && (
                          <p className="text-xs text-stone-500 mt-1 ml-8">
                            {GOAL_ADJUSTMENT_LABELS[g]} = ~{previewCals} kcal/day
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'activity' && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-semibold text-stone-100">Activity Level</h2>
                  <p className="text-stone-500 text-sm">How active are you on average?</p>
                </div>

                <div className="space-y-3">
                  {(Object.keys(ACTIVITY_DESCRIPTIONS) as ActivityLevel[]).map((a) => {
                    const d = ACTIVITY_DESCRIPTIONS[a];
                    return (
                      <button
                        key={a}
                        onClick={() => setActivity(a)}
                        className={`w-full p-4 rounded-xl border text-left transition-all ${
                          activity === a
                            ? 'border-[#D4A853] bg-[rgba(212,168,83,0.08)] gold-glow'
                            : 'border-stone-800 hover:border-stone-600'
                        }`}
                      >
                        <span className={`font-medium ${activity === a ? 'text-stone-100' : 'text-stone-300'}`}>
                          {a.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <p className="text-stone-500 text-xs mt-0.5">{d.en}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'plan' && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="text-2xl font-semibold text-stone-100">Your Plan</h2>
                  <p className="text-stone-500 text-sm">Calculated using Mifflin-St Jeor + ISSN</p>
                </div>

                <div className="glass-elevated p-6 space-y-4 gold-border">
                  <div className="text-center">
                    <p className="text-stone-500 text-xs uppercase tracking-wide">Daily Target</p>
                    <p className="text-4xl font-bold text-[#D4A853] mt-1">{profile.calories}</p>
                    <p className="text-stone-400 text-sm">kcal / day</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-stone-900/50 rounded-xl p-3">
                      <p className="text-lg font-semibold text-blue-400">{profile.protein_g}g</p>
                      <p className="text-xs text-stone-500">Protein</p>
                    </div>
                    <div className="bg-stone-900/50 rounded-xl p-3">
                      <p className="text-lg font-semibold text-amber-400">{profile.carbs_g}g</p>
                      <p className="text-xs text-stone-500">Carbs</p>
                    </div>
                    <div className="bg-stone-900/50 rounded-xl p-3">
                      <p className="text-lg font-semibold text-rose-400">{profile.fat_g}g</p>
                      <p className="text-xs text-stone-500">Fat</p>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-stone-500 pt-2 border-t border-stone-800">
                    <span>💧 {(profile.water_ml / 1000).toFixed(1)}L water</span>
                    <span>🌿 {profile.fiber_g}g fiber</span>
                    <span>BMR: {profile.bmr}</span>
                  </div>

                  {/* Protein per meal & leucine info */}
                  <div className="pt-2 border-t border-stone-800 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Protein per meal (4 meals)</span>
                      <span className="text-stone-300 font-medium">{Math.round(profile.protein_g / 4)}g</span>
                    </div>
                    <p className="text-stone-600 text-xs">
                      You need ~3g of leucine per meal (~{Math.round(profile.protein_g / 4)}g protein from quality sources)
                    </p>
                  </div>
                </div>

                <div className="glass p-4 text-center">
                  <p className="text-stone-400 text-sm">
                    🎯 Your coach will assign your first habit — one step at a time.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex gap-4 mt-8 w-full max-w-md">
        {stepIdx > 0 && (
          <button onClick={back} className="btn-ghost flex-1">← Back</button>
        )}
        {step !== 'welcome' && step !== 'plan' && (
          <button onClick={next} className="btn-gold flex-1">Next →</button>
        )}
        {step === 'plan' && (
          <button onClick={finish} disabled={loading} className="btn-gold flex-1 disabled:opacity-50">
            {loading ? 'Saving...' : '🚀 Start my journey'}
          </button>
        )}
      </div>
    </div>
  );
}
