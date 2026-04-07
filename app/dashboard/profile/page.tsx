'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, LogOut, Save, Globe, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calculateFullProfile, ACTIVITY_DESCRIPTIONS, GOAL_DESCRIPTIONS } from '@/lib/nutrition-engine';
import type { ClientProfile, Profile, Sex, ActivityLevel, Goal, Language } from '@/lib/types';
import BottomNav from '@/components/BottomNav';
import BodyCompCalculator from '@/components/BodyCompCalculator';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const ACTIVITY_OPTIONS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOAL_OPTIONS: Goal[] = ['fat_loss', 'muscle_gain', 'maintenance', 'recomp', 'endurance', 'health'];
const LANG_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'es', label: 'Espanol', flag: '🇪🇸' },
  { value: 'el', label: 'Ellinika', flag: '🇬🇷' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  // Form state
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<Goal>('maintenance');
  const [language, setLanguage] = useState<Language>('en');

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [profRes, cpRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('client_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (profRes.data) {
        setProfile(profRes.data);
        setLanguage(profRes.data.language || 'en');
      }

      if (cpRes.data) {
        const cp = cpRes.data;
        setClientProfile(cp);
        setAge(cp.age?.toString() ?? '');
        setSex(cp.sex ?? 'male');
        setHeightCm(cp.height_cm?.toString() ?? '');
        setWeightKg(cp.weight_kg?.toString() ?? '');
        setActivity(cp.activity_level ?? 'moderate');
        setGoal(cp.goal ?? 'maintenance');
      }
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!clientProfile || !profile) return;
    setSaving(true);
    setSaved(false);

    const ageNum = parseInt(age);
    const heightNum = parseFloat(heightCm);
    const weightNum = parseFloat(weightKg);

    if (!ageNum || !heightNum || !weightNum) {
      setSaving(false);
      return;
    }

    // Recalculate
    const calc = calculateFullProfile(weightNum, heightNum, ageNum, sex, activity, goal);

    const updates = {
      age: ageNum,
      sex,
      height_cm: heightNum,
      weight_kg: weightNum,
      activity_level: activity,
      goal,
      bmr: calc.bmr,
      tdee: calc.tdee,
      target_calories: calc.calories,
      target_protein_g: calc.protein_g,
      target_carbs_g: calc.carbs_g,
      target_fat_g: calc.fat_g,
      target_fiber_g: calc.fiber_g,
      target_water_ml: calc.water_ml,
      updated_at: new Date().toISOString(),
    };

    await Promise.all([
      supabase.from('client_profiles').update(updates).eq('id', clientProfile.id),
      supabase.from('profiles').update({ language }).eq('id', profile.id),
    ]);

    setClientProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Preview calculations
  const ageNum = parseInt(age);
  const heightNum = parseFloat(heightCm);
  const weightNum = parseFloat(weightKg);
  const canCalc = ageNum > 0 && heightNum > 0 && weightNum > 0;
  const preview = canCalc ? calculateFullProfile(weightNum, heightNum, ageNum, sex, activity, goal) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 pb-24">
        <div className="max-w-md mx-auto px-4 pt-12 space-y-4">
          <div className="h-7 w-32 rounded bg-stone-800/60 animate-pulse" />
          <div className="glass p-5 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 rounded bg-stone-800/60 animate-pulse" />
                <div className="h-11 w-full rounded-xl bg-stone-800/40 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const goalInfo = GOAL_DESCRIPTIONS[goal];

  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
            <User size={24} className="text-stone-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-100">
              {profile?.full_name ?? 'Profile'}
            </h1>
            <p className="text-stone-500 text-xs">{profile?.email}</p>
          </div>
        </div>

        {/* Body Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-5 mb-4"
        >
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4">
            Body Stats
          </h3>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-stone-500 text-[10px] uppercase tracking-wider">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="input-dark text-sm mt-1"
                placeholder="30"
              />
            </div>
            <div>
              <label className="text-stone-500 text-[10px] uppercase tracking-wider">Sex</label>
              <div className="flex gap-2 mt-1">
                {SEX_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSex(s.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      sex === s.value
                        ? 'gold-border gold-text bg-white/5'
                        : 'border-white/5 text-stone-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-stone-500 text-[10px] uppercase tracking-wider">
                Height (cm)
              </label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="input-dark text-sm mt-1"
                placeholder="175"
              />
            </div>
            <div>
              <label className="text-stone-500 text-[10px] uppercase tracking-wider">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="input-dark text-sm mt-1"
                placeholder="75"
              />
            </div>
          </div>

          {/* Activity Level */}
          <div className="mb-4">
            <label className="text-stone-500 text-[10px] uppercase tracking-wider">
              Activity Level
            </label>
            <div className="space-y-1.5 mt-2">
              {ACTIVITY_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
                    activity === a
                      ? 'gold-border gold-text bg-white/5'
                      : 'border-white/5 text-stone-400 hover:bg-white/[0.02]'
                  }`}
                >
                  <span className="font-medium capitalize">{a.replaceAll('_', ' ')}</span>
                  <span className="text-stone-600 text-xs ml-2">
                    {ACTIVITY_DESCRIPTIONS[a].en}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-stone-500 text-[10px] uppercase tracking-wider">Goal</label>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {GOAL_OPTIONS.map((g) => {
                const info = GOAL_DESCRIPTIONS[g];
                return (
                  <button
                    key={g}
                    onClick={() => setGoal(g)}
                    className={`text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
                      goal === g
                        ? 'gold-border gold-text bg-white/5'
                        : 'border-white/5 text-stone-400 hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="mr-1">{info.emoji}</span>
                    <span className="capitalize text-xs">{g.replaceAll('_', ' ')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Macro Preview */}
        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass gold-border p-5 mb-4"
          >
            <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Calculated Targets
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div>
                <p className="text-stone-500 text-[10px]">BMR</p>
                <p className="text-stone-100 font-semibold">{preview.bmr}</p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px]">TDEE</p>
                <p className="text-stone-100 font-semibold">{preview.tdee}</p>
              </div>
              <div>
                <p className="text-stone-500 text-[10px]">Target</p>
                <p className="gold-text font-bold">{preview.calories}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-white/5">
              <div>
                <p className="text-red-400 font-bold text-sm">{preview.protein_g}g</p>
                <p className="text-stone-600 text-[10px]">Protein</p>
              </div>
              <div>
                <p className="text-blue-400 font-bold text-sm">{preview.carbs_g}g</p>
                <p className="text-stone-600 text-[10px]">Carbs</p>
              </div>
              <div>
                <p className="text-purple-400 font-bold text-sm">{preview.fat_g}g</p>
                <p className="text-stone-600 text-[10px]">Fat</p>
              </div>
              <div>
                <p className="text-blue-300 font-bold text-sm">{(preview.water_ml / 1000).toFixed(1)}L</p>
                <p className="text-stone-600 text-[10px]">Water</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Body Composition Calculator */}
        <BodyCompCalculator sex={sex} />

        {/* Language */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass p-5 mb-4"
        >
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe size={14} /> Language
          </h3>
          <div className="flex gap-2">
            {LANG_OPTIONS.map((l) => (
              <button
                key={l.value}
                onClick={() => setLanguage(l.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all text-center ${
                  language === l.value
                    ? 'gold-border gold-text bg-white/5'
                    : 'border-white/5 text-stone-400'
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              saved
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'btn-gold'
            }`}
          >
            {saved ? (
              <>Saved</>
            ) : saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save size={16} /> Save Profile
              </>
            )}
          </button>
        </motion.div>

        {/* Logout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 mb-4"
        >
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Log Out
          </button>
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
