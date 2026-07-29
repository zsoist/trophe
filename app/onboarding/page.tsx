'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Icon, BrandWordmark, AnimatedValue } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { MACRO_COLORS } from '@/lib/macro-colors';
import { calculateFullProfile, calculateBMR, calculateTDEE, calculateTargetCalories, GOAL_DESCRIPTIONS, ACTIVITY_DESCRIPTIONS } from '@/lib/food/nutrition-engine';
import type { Sex, ActivityLevel, Goal } from '@/lib/types';

const GOAL_ADJUSTMENT_LABELS: Record<Goal, string> = {
  fat_loss: '20% deficit',
  muscle_gain: '+300 kcal surplus',
  maintenance: 'No adjustment',
  recomp: '5% deficit',
  endurance: '+15%',
  health: 'No adjustment',
};

// Sprite icons for goals (replaces GOAL_DESCRIPTIONS emoji — icon work only)
const GOAL_ICONS: Record<Goal, IconName> = {
  fat_loss: 'i-flame',
  muscle_gain: 'i-dumbbell',
  maintenance: 'i-target',
  recomp: 'i-refresh',
  endurance: 'i-shoe',
  health: 'i-leaf',
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
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

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
    if (!Number.isInteger(age) || age < 14 || age > 80) {
      setOnboardingError('Enter an age between 14 and 80');
      return;
    }
    setLoading(true);
    setOnboardingError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data, error } = await supabase
        .from('client_profiles')
        .upsert({
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
        }, { onConflict: 'user_id' })
        .select('user_id')
        .maybeSingle();
      if (error || !data) {
        setOnboardingError('Your profile was not saved — try again');
        return;
      }

      router.push('/dashboard');
    } catch {
      setOnboardingError('Your profile was not saved — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: 'var(--bg-primary, #0a0a0a)' }}>
      {/* Progress dots + percentage */}
      <div className="flex flex-col items-center gap-2 mb-10">
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === stepIdx ? 'w-8 bg-[#D4A853]' : i < stepIdx ? 'w-4 bg-[#D4A853]/40' : 'w-4 bg-[var(--bg-4,#242424)]'
              }`}
            />
          ))}
        </div>
        <p className="caption" style={{ color: 'var(--t4)' }}>
          Step {stepIdx + 1} of {steps.length} &mdash; {Math.round(((stepIdx + 1) / steps.length) * 100)}%
        </p>
      </div>

      {/* Step content — flows in normal layout so the nav buttons below are
          always reachable at 390px (was absolute inset-0 inside min-h-[480px],
          which let tall steps overflow under the buttons). */}
      <div className="w-full max-w-md relative overflow-x-clip">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as const }}
          >
            {step === 'welcome' && (
              <div className="text-center space-y-6">
                <BrandWordmark size="default" />
                <p className="body-md" style={{ color: 'var(--t2)', fontSize: 17 }}>Welcome to your nutrition journey</p>
                <p className="body-md max-w-sm mx-auto" style={{ color: 'var(--t3)' }}>
                  We&apos;ll set up your personalized plan in just 4 quick steps.
                  Everything is based on evidence from ISSN, ACSM, and IOC.
                </p>
                <p className="caption" style={{ color: 'var(--t4)' }}>
                  Trusted by Precision Nutrition certified coaches
                </p>
                <div className="pt-6">
                  <button onClick={next} className="btn-gold text-lg px-10 py-4 inline-flex items-center gap-2">
                    Let&apos;s go
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 'body' && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="display-lg" style={{ color: 'var(--t1)' }}>Body Stats</h2>
                  <p className="caption mt-1">Used to calculate your BMR &amp; targets</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block body-md mb-1.5" style={{ color: 'var(--t3)' }}>Age</label>
                    <input
                      type="number" value={age} onChange={(e) => setAge(+e.target.value)}
                      className="input-dark" min={14} max={80}
                    />
                  </div>
                  <div>
                    <label className="block body-md mb-2" style={{ color: 'var(--t3)' }}>Sex</label>
                    <div className="flex gap-2">
                      {(['male', 'female'] as Sex[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setSex(s)}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            sex === s
                              ? 'border-[#D4A853] bg-[rgba(212,168,83,0.08)] text-[var(--t1)]'
                              : 'border-[var(--line-2)] text-[var(--t4)] hover:border-[var(--t5)]'
                          }`}
                        >
                          {s === 'male' ? 'Male' : 'Female'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block body-md mb-1.5" style={{ color: 'var(--t3)' }}>Height (cm): {heightCm}</label>
                  <input
                    type="range" min={140} max={220} value={heightCm}
                    onChange={(e) => setHeightCm(+e.target.value)}
                    className="w-full accent-[#D4A853]"
                  />
                  <div className="flex justify-between caption" style={{ color: 'var(--t4)' }}><span>140</span><span>220</span></div>
                </div>

                <div>
                  <label className="block body-md mb-1.5" style={{ color: 'var(--t3)' }}>Weight (kg): {weightKg}</label>
                  <input
                    type="range" min={40} max={160} value={weightKg}
                    onChange={(e) => setWeightKg(+e.target.value)}
                    className="w-full accent-[#D4A853]"
                  />
                  <div className="flex justify-between caption" style={{ color: 'var(--t4)' }}><span>40</span><span>160</span></div>
                </div>
              </div>
            )}

            {step === 'goal' && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <h2 className="display-lg" style={{ color: 'var(--t1)' }}>Your Goal</h2>
                  <p className="caption mt-1">This shapes your macro targets</p>
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
                            : 'border-[var(--line-2)] hover:border-[var(--t5)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Icon
                              name={GOAL_ICONS[g]}
                              size={18}
                              style={{ color: goal === g ? 'var(--gold-300,#D4A853)' : 'var(--t4)', flexShrink: 0 }}
                            />
                            <span className={`font-medium ${goal === g ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>
                              {d.en}
                            </span>
                          </div>
                          <span className="caption" style={{ color: 'var(--t4)' }}>
                            ~{previewCals} kcal
                          </span>
                        </div>
                        {goal === g && (
                          <p className="caption mt-1 ml-8" style={{ color: 'var(--t4)' }}>
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
                  <h2 className="display-lg" style={{ color: 'var(--t1)' }}>Activity Level</h2>
                  <p className="caption mt-1">How active are you on average?</p>
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
                            : 'border-[var(--line-2)] hover:border-[var(--t5)]'
                        }`}
                      >
                        <span className={`font-medium ${activity === a ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>
                          {a.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <p className="caption mt-0.5" style={{ color: 'var(--t4)' }}>{d.en}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'plan' && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <h2 className="display-lg" style={{ color: 'var(--t1)' }}>Your Plan</h2>
                  <p className="caption mt-1">Calculated using Mifflin-St Jeor + ISSN</p>
                </div>

                <div className="glass-elevated p-6 space-y-4 gold-border">
                  <div className="text-center">
                    <p className="label-sm" style={{ color: 'var(--t4)' }}>Daily Target</p>
                    {/* Serif hero numeral + count-up */}
                    <p className="display-xl mt-1" style={{ color: 'var(--gold-300,#D4A853)' }}>
                      <AnimatedValue value={profile.calories} grouped={false} />
                    </p>
                    <p className="body-md" style={{ color: 'var(--t3)' }}>kcal / day</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="glass rounded-xl p-3">
                      <p className="text-lg font-semibold" style={{ color: MACRO_COLORS.protein }}>
                        <AnimatedValue value={profile.protein_g} grouped={false} />g
                      </p>
                      <p className="caption" style={{ color: 'var(--t4)' }}>Protein</p>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <p className="text-lg font-semibold" style={{ color: MACRO_COLORS.carbs }}>
                        <AnimatedValue value={profile.carbs_g} grouped={false} />g
                      </p>
                      <p className="caption" style={{ color: 'var(--t4)' }}>Carbs</p>
                    </div>
                    <div className="glass rounded-xl p-3">
                      <p className="text-lg font-semibold" style={{ color: MACRO_COLORS.fat }}>
                        <AnimatedValue value={profile.fat_g} grouped={false} />g
                      </p>
                      <p className="caption" style={{ color: 'var(--t4)' }}>Fat</p>
                    </div>
                   </div>

                  {profile.macros_adjusted && (
                    <div
                      role="note"
                      className="rounded-xl p-3 text-center"
                      style={{
                        background: 'rgba(212,168,83,.08)',
                        border: '1px solid rgba(212,168,83,.2)',
                        color: 'var(--t3)',
                        fontSize: 11,
                      }}
                    >
                      Protein and fat were adjusted to fit your calorie target. Your coach can review these starting targets.
                    </div>
                  )}

                  <div className="flex justify-between items-center body-md pt-2" style={{ color: 'var(--t4)', borderTop: '1px solid var(--line-2)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="i-drop" size={14} style={{ color: MACRO_COLORS.water }} />
                      {(profile.water_ml / 1000).toFixed(1)}L water
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="i-leaf" size={14} style={{ color: MACRO_COLORS.fiber }} />
                      {profile.fiber_g}g fiber
                    </span>
                    <span>BMR: {profile.bmr}</span>
                  </div>

                  {/* Protein per meal & leucine info */}
                  <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--line-2)' }}>
                    <div className="flex justify-between body-md">
                      <span style={{ color: 'var(--t4)' }}>Protein per meal (4 meals)</span>
                      <span className="font-medium" style={{ color: 'var(--t2)' }}>{Math.round(profile.protein_g / 4)}g</span>
                    </div>
                    <p className="caption" style={{ color: 'var(--t4)' }}>
                      You need ~3g of leucine per meal (~{Math.round(profile.protein_g / 4)}g protein from quality sources)
                    </p>
                  </div>
                </div>

                <div className="glass p-4 text-center">
                  <p className="body-md inline-flex items-center gap-2" style={{ color: 'var(--t3)' }}>
                    <Icon name="i-target" size={15} style={{ color: 'var(--gold-300,#D4A853)', flexShrink: 0 }} />
                    Your coach will assign your first habit — one step at a time.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {onboardingError && (
        <div
          role="alert"
          className="w-full max-w-md mt-6 text-center"
          style={{ color: 'var(--err,#E87A6E)', fontSize: 12 }}
        >
          {onboardingError}
        </div>
      )}
      <div className="flex gap-4 mt-8 w-full max-w-md">
        {stepIdx > 0 && (
          <button onClick={back} className="btn-ghost flex-1 inline-flex items-center justify-center gap-2">
            <ArrowLeft size={16} />
            Back
          </button>
        )}
        {step !== 'welcome' && step !== 'plan' && (
          <button onClick={next} className="btn-gold flex-1 inline-flex items-center justify-center gap-2">
            Next
            <ArrowRight size={16} />
          </button>
        )}
        {step === 'plan' && (
          <button onClick={finish} disabled={loading} className="btn-gold flex-1 disabled:opacity-50">
            {loading ? 'Saving...' : 'Start my journey'}
          </button>
        )}
      </div>
    </div>
  );
}
