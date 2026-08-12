'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Lock } from 'lucide-react';
import { Icon } from '@/components/ui';
import MealSuggestPicker from '@/components/coach/MealSuggestPicker';
import ShoppingListModal from '@/components/coach/ShoppingListModal';
import MacroRollupModal from '@/components/coach/MacroRollupModal';

// ═══════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════

interface ClientProfile {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_water_ml: number | null;
  coaching_phase: string | null;
}

interface HabitRef {
  id: string;
  name_en: string;
  emoji: string;
  category: string;
  difficulty: string;
}

interface ClientHabit {
  id: string;
  status: string;
  sequence_number: number | null;
  coach_note: string | null;
  habit: HabitRef;
}

interface TemplateHabit {
  id: string;
  name_en: string;
  emoji: string;
  category: string;
  difficulty: string;
}

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
}

// Calories are derived, never typed: protein 4 kcal/g, carbs 4, fat 9.
const kcalFromMacros = (t: Pick<MacroTargets, 'protein' | 'carbs' | 'fat'>): number =>
  Math.round(t.protein * 4 + t.carbs * 4 + t.fat * 9);

const MEAL_SLOTS = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'] as const;
type MealSlot = (typeof MEAL_SLOTS)[number];
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  snack1: 'Snack (am)',
  lunch: 'Lunch',
  snack2: 'Snack (pm)',
  dinner: 'Dinner',
};
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Share of the daily macro budget each slot should cover — used to scope the
// AI meal-suggest call to a sensible per-slot target. Sums to 1.0.
const SLOT_FRACTION: Record<MealSlot, number> = {
  breakfast: 0.25,
  snack1: 0.1,
  lunch: 0.3,
  snack2: 0.1,
  dinner: 0.25,
};
/** key = `${day}-${slot}` */
type MealGrid = Record<string, string>;

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const initials = (name: string | null): string =>
  name
    ? name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

const stepBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid var(--border-default)',
  background: 'var(--border-subtle)',
  color: 'var(--content-secondary)',
  cursor: 'pointer',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function PlanEditorPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  // Auth / identity
  const [coachId, setCoachId] = useState<string | null>(null);

  // Client data
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [activeHabits, setActiveHabits] = useState<ClientHabit[]>([]);
  const [templateHabits, setTemplateHabits] = useState<TemplateHabit[]>([]);
  const [habitActionPending, setHabitActionPending] = useState<string | null>(null);
  const [habitActionError, setHabitActionError] = useState<string | null>(null);

  // Editable state
  const [targets, setTargets] = useState<MacroTargets>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    water: 2500,
  });
  const [phase, setPhase] = useState<string>('active');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);

  // Weekly meal plan (free-text per day x slot)
  const [mealGrid, setMealGrid] = useState<MealGrid>({});
  const [activeDay, setActiveDay] = useState(0);
  const [mealSaving, setMealSaving] = useState(false);
  const [mealSaveError, setMealSaveError] = useState<string | null>(null);
  const mealSavesInFlight = useRef(0);
  // AI meal-suggest picker — scoped to a specific (day, slot) cell.
  const [picker, setPicker] = useState<{ day: number; slot: MealSlot } | null>(null);
  // Shopping-list generator modal.
  const [showShopping, setShowShopping] = useState(false);
  // Per-day macro rollup modal.
  const [showMacros, setShowMacros] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    setLoadError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Verify coach role
      const { data: coachProfile, error: coachProfileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (coachProfileError) throw new Error('plan_load_failed');

      const role = coachProfile?.role ?? '';
      if (!['coach', 'admin', 'super_admin'].includes(role)) {
        setAuthError(true);
        return;
      }

      setCoachId(user.id);

      const [profileRes, clientProfileRes, activeHabitsRes, templateHabitsRes, mealPlanRes] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', clientId)
            .maybeSingle(),
          supabase
            .from('client_profiles')
            .select('*')
            .eq('user_id', clientId)
            .maybeSingle(),
          supabase
            .from('client_habits')
            .select(
              'id, status, sequence_number, coach_note, habit:habits(id, name_en, emoji, category, difficulty)'
            )
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('sequence_number'),
          supabase
            .from('habits')
            .select('id, name_en, emoji, category, difficulty')
            .eq('is_template', true)
            .order('suggested_order'),
          supabase
            .from('meal_plan_entries')
            .select('day_of_week, meal_slot, description')
             .eq('client_id', clientId),
         ]);

      const loadFailure = [
        profileRes.error,
        clientProfileRes.error,
        activeHabitsRes.error,
        templateHabitsRes.error,
        mealPlanRes.error,
      ].find(Boolean);
      if (loadFailure || !profileRes.data || !clientProfileRes.data) {
        throw new Error('plan_load_failed');
      }

      setProfileName(profileRes.data?.full_name ?? null);
      setProfileEmail(profileRes.data?.email ?? null);

      const cp: ClientProfile | null = clientProfileRes.data ?? null;
      if (cp) {
        setTargets({
          calories: cp.target_calories ?? 0,
          protein: cp.target_protein_g ?? 0,
          carbs: cp.target_carbs_g ?? 0,
          fat: cp.target_fat_g ?? 0,
          water: cp.target_water_ml ?? 2500,
        });
        setPhase(cp.coaching_phase ?? 'active');
      }

      // Supabase PostgREST join returns `habit` as an object (not array)
      const rawHabits = (activeHabitsRes.data ?? []) as unknown as Array<{
        id: string;
        status: string;
        sequence_number: number | null;
        coach_note: string | null;
        habit: HabitRef;
      }>;
      setActiveHabits(rawHabits);
      setTemplateHabits((templateHabitsRes.data ?? []) as TemplateHabit[]);

      const grid: MealGrid = {};
      for (const row of (mealPlanRes.data ?? []) as Array<{ day_of_week: number; meal_slot: string; description: string }>) {
        grid[`${row.day_of_week}-${row.meal_slot}`] = row.description;
      }
      setMealGrid(grid);
    } catch {
      setLoadError('Could not load this client plan — try again');
    } finally {
      setLoading(false);
    }
  }, [clientId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Actions ─────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from('client_profiles')
        .update({
          target_calories: kcalFromMacros(targets),
          target_protein_g: targets.protein,
          target_carbs_g: targets.carbs,
          target_fat_g: targets.fat,
          target_water_ml: targets.water,
          coaching_phase: phase,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', clientId)
        .select('user_id')
        .maybeSingle();
      if (error || !data) {
        setSaveError('Could not save plan — try again');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('Could not save plan — try again');
    } finally {
      setSaving(false);
    }
  };

  // Deterministic calorie/macro baseline from the client's body composition.
  const suggestFromBodyComp = async () => {
    setSuggesting(true);
    setSuggestMsg(null);
    try {
      const res = await fetch('/api/coach/client-tdee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        target?: {
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          protein_capped?: boolean;
        };
        tdee?: number;
        error?: string;
      };
      if (res.ok && data.target) {
        setTargets((t) => ({ ...t, protein: data.target!.protein_g, carbs: data.target!.carbs_g, fat: data.target!.fat_g }));
        const capNote = data.target.protein_capped
          ? ' Protein was capped to fit the calorie target.'
          : '';
        setSuggestMsg(`Suggested from TDEE ≈ ${data.tdee} kcal — review and Save.${capNote}`);
      } else {
        setSuggestMsg(data.error || 'Need sex, age, height & weight on the client first');
      }
    } catch {
      setSuggestMsg('Could not compute — try again');
    } finally {
      setSuggesting(false);
    }
  };

  const addHabit = async (habitId: string) => {
    if (habitActionPending) return;
    if (!coachId) {
      setHabitActionError('Habit was not added — try again');
      return;
    }
    setHabitActionPending(`add:${habitId}`);
    setHabitActionError(null);
    try {
      const { data, error } = await supabase
        .from('client_habits')
        .insert({
          client_id: clientId,
          habit_id: habitId,
          assigned_by: coachId,
          status: 'active',
          sequence_number: activeHabits.length + 1,
        })
        .select(
          'id, status, sequence_number, coach_note, habit:habits(id, name_en, emoji, category, difficulty)'
        )
        .maybeSingle();
      if (error || !data) {
        setHabitActionError('Habit was not added — try again');
        return;
      }
      const typed = data as unknown as ClientHabit;
      setActiveHabits((prev) => [...prev, typed]);
    } catch {
      setHabitActionError('Habit was not added — try again');
    } finally {
      setHabitActionPending(null);
    }
  };

  const removeHabit = async (clientHabitId: string) => {
    if (habitActionPending) return;
    setHabitActionPending(`remove:${clientHabitId}`);
    setHabitActionError(null);
    try {
      const { data, error } = await supabase
        .from('client_habits')
        .update({ status: 'paused' })
        .eq('id', clientHabitId)
        .select('id')
        .maybeSingle();
      if (error || !data) {
        setHabitActionError('Habit was not removed — try again');
        return;
      }
      setActiveHabits((prev) => prev.filter((h) => h.id !== clientHabitId));
    } catch {
      setHabitActionError('Habit was not removed — try again');
    } finally {
      setHabitActionPending(null);
    }
  };

  // ── Step helpers ─────────────────────────────────

  const step = (key: keyof MacroTargets, delta: number) =>
    setTargets((t) => ({ ...t, [key]: Math.max(0, t[key] + delta) }));

  // ── Meal plan helpers ─────────────────────────────

  const beginMealSave = () => {
    mealSavesInFlight.current += 1;
    setMealSaving(true);
  };
  const finishMealSave = () => {
    mealSavesInFlight.current = Math.max(0, mealSavesInFlight.current - 1);
    if (mealSavesInFlight.current === 0) setMealSaving(false);
  };

  const saveMealCell = async (
    day: number,
    slot: MealSlot,
    description: string,
  ): Promise<boolean> => {
    if (!coachId) {
      setMealSaveError('Meal change not saved — try again');
      return false;
    }
    beginMealSave();
    setMealSaveError(null);
    try {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .upsert(
          {
            client_id: clientId,
            coach_id: coachId,
            day_of_week: day,
            meal_slot: slot,
            description,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,day_of_week,meal_slot' }
        )
        .select('day_of_week')
        .maybeSingle();
      if (error || !data) {
        setMealSaveError('Meal change not saved — try again');
        return false;
      }
      return true;
    } catch {
      setMealSaveError('Meal change not saved — try again');
      return false;
    } finally {
      finishMealSave();
    }
  };

  const setMealCell = (day: number, slot: MealSlot, value: string) =>
    setMealGrid((g) => ({ ...g, [`${day}-${slot}`]: value }));

  // AI picker chose a meal → write it into the scoped cell and persist.
  const handlePickMeal = async (text: string) => {
    if (!picker) return;
    const { day, slot } = picker;
    setMealCell(day, slot, text);
    const saved = await saveMealCell(day, slot, text);
    if (saved) setPicker(null);
  };

  // Michael: "breakfast should maybe be the same for all week"
  const copySlotToWeek = async (slot: MealSlot) => {
    if (!coachId) return;
    const source = mealGrid[`${activeDay}-${slot}`] ?? '';
    if (!source.trim()) return;
    beginMealSave();
    setMealSaveError(null);
    const rows = Array.from({ length: 7 }, (_, day) => ({
      client_id: clientId,
      coach_id: coachId,
      day_of_week: day,
      meal_slot: slot,
      description: source,
      updated_at: new Date().toISOString(),
    }));
    try {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .upsert(rows, { onConflict: 'client_id,day_of_week,meal_slot' })
        .select('day_of_week');
      if (error || data?.length !== 7) {
        setMealSaveError('Weekly copy not saved — try again');
        return;
      }
      setMealGrid((g) => {
        const next = { ...g };
        for (let day = 0; day < 7; day++) next[`${day}-${slot}`] = source;
        return next;
      });
    } catch {
      setMealSaveError('Weekly copy not saved — try again');
    } finally {
      finishMealSave();
    }
  };

  // ── Render guards ────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--canvas)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '2px solid var(--border-default)',
              borderTopColor: 'var(--gold-300,#D4A853)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span className="eye-d">Loading plan…</span>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--canvas)' }}
      >
        <div className="card" style={{ padding: 24, textAlign: 'center', maxWidth: 320 }}>
          <Lock size={28} style={{ color: 'var(--gold-300,#D4A853)', margin: '0 auto 8px', display: 'block' }} aria-hidden />
          <div style={{ fontSize: 14, color: 'var(--content-secondary)', marginBottom: 16 }}>
            Coach access required
          </div>
          <button
            data-coach-primary-action
            data-icon-only
            aria-label="Back to client workspace"
            onClick={() => router.back()}
            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{
              background: 'var(--gold-300,#D4A853)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--canvas)' }}
      >
        <div className="card" style={{ padding: 24, textAlign: 'center', maxWidth: 340 }}>
          <div role="alert" style={{ fontSize: 13, color: 'var(--content-secondary)', marginBottom: 16 }}>
            {loadError}
          </div>
          <button
            onClick={loadData}
            style={{
              background: 'var(--gold-300,#D4A853)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const macroFields: Array<{
    key: keyof MacroTargets;
    label: string;
    unit: string;
    stepSize: number;
  }> = [
    { key: 'protein', label: 'Protein', unit: 'g', stepSize: 5 },
    { key: 'carbs', label: 'Carbs', unit: 'g', stepSize: 5 },
    { key: 'fat', label: 'Fat', unit: 'g', stepSize: 5 },
    { key: 'water', label: 'Water', unit: 'ml', stepSize: 250 },
  ];

  const derivedKcal = kcalFromMacros(targets);

  const availableToAdd = templateHabits.filter(
    (h) => !activeHabits.some((ah) => ah.habit.id === h.id)
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--canvas)', paddingBottom: 40 }}
    >
      {/* Spin keyframe injected inline — works without global CSS changes */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div
        className="max-w-md lg:max-w-5xl mx-auto px-4 pt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ── Header ── */}
        <div className="row-b" style={{ marginBottom: 16 }}>
          <button
            data-coach-primary-action
            data-icon-only
            aria-label="Back to client workspace"
            onClick={() => router.back()}
            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--content-muted)' }}
          >
            <Icon name="i-chev-l" size={16} />
          </button>
          <span className="eye-d">Plan Editor</span>
          <div style={{ width: 16 }} />
        </div>

        {/* ── Client identity ── */}
        <div className="row-i" style={{ gap: 10, marginBottom: 16 }}>
          <div className="av" style={{ flexShrink: 0 }}>
            {initials(profileName)}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--content-primary)' }}>
              {profileName ?? '—'}
            </div>
            <div className="ds-sub">{profileEmail ?? '—'}</div>
          </div>
        </div>

        {/* ══ Macro Targets ══ */}
        <div className="eye" style={{ marginBottom: 8 }}>
          MACRO TARGETS
        </div>
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          {/* Phase selector */}
          <div className="row-b" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--content-muted)' }}>Coaching Phase</span>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              style={{
                background: 'var(--surface,#141414)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                padding: '4px 8px',
                color: 'var(--content-primary)',
                fontSize: 16,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {/* Calories — derived from macros (P/C 4 kcal/g, fat 9), never typed */}
          <div className="row-b" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: 12, color: 'var(--content-secondary)' }} title="Auto-computed: protein ×4 + carbs ×4 + fat ×9">
              Calories (auto)
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--gold-300,#D4A853)' }}>
              {derivedKcal} kcal
            </span>
          </div>

          {/* Suggest macros from the client's body composition (Mifflin/Katch → TDEE → split) */}
          <button
            onClick={suggestFromBodyComp}
            disabled={suggesting}
            className="row-i"
            style={{
              gap: 6, marginBottom: 10, padding: '7px 10px', borderRadius: 8, width: '100%',
              justifyContent: 'center', cursor: suggesting ? 'not-allowed' : 'pointer',
              background: 'rgba(212,168,83,.1)', border: '1px solid rgba(212,168,83,.25)',
              color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)',
              fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
            }}
          >
            <Icon name="i-sparkle" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
            {suggesting ? 'Computing…' : 'Suggest from body comp'}
          </button>
          {suggestMsg && (
            <div style={{ fontSize: 12, color: 'var(--content-muted)', marginBottom: 10, textAlign: 'center' }}>{suggestMsg}</div>
          )}

          {/* Macro stepper rows */}
          {macroFields.map((f) => (
            <div key={f.key} className="row-b" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--content-secondary)', width: 60 }}>{f.label}</span>
              <div className="row-i" style={{ gap: 6 }}>
                <button style={stepBtn} onClick={() => step(f.key, -f.stepSize)}>
                  −
                </button>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--content-primary)',
                    minWidth: 64,
                    textAlign: 'center',
                  }}
                >
                  {targets[f.key]}
                  {f.unit}
                </span>
                <button style={stepBtn} onClick={() => step(f.key, f.stepSize)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ══ Weekly Meal Plan ══ */}
         <div className="row-b" style={{ marginBottom: 8 }}>
           <span className="eye">WEEKLY MEAL PLAN</span>
          <div className="row-i" style={{ gap: 12 }}>
            {mealSaving && (
              <span style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'var(--font-mono)' }}>saving…</span>
            )}
            <button
              onClick={() => setShowMacros(true)}
              title="Count this week's plan into macros per day vs target"
              className="row-i"
              style={{
                gap: 5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(212,168,83,.12)', border: '1px solid rgba(212,168,83,.3)',
                color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)',
                fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
              }}
            >
              <Icon name="i-chart" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
              Macros
            </button>
            <button
              onClick={() => setShowShopping(true)}
              title="Generate a shopping list from this week's plan"
              className="row-i"
              style={{
                gap: 5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(212,168,83,.12)', border: '1px solid rgba(212,168,83,.3)',
                color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)',
                fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
              }}
            >
              <Icon name="i-list" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
              Shopping list
             </button>
           </div>
         </div>
         {mealSaveError && (
           <div
             role="alert"
             style={{ color: 'var(--err,#E87A6E)', fontSize: 12, marginBottom: 8 }}
           >
             {mealSaveError}
           </div>
         )}
         {/* Desktop: full 7-day week grid (Michael demos on PC) */}
        <div className="hidden lg:block card" style={{ padding: 14, marginBottom: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 6 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }} />
                {DAY_LABELS.map((d) => (
                  <th key={d} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--content-muted)', fontWeight: 700, paddingBottom: 2 }}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_SLOTS.map((slot) => (
                <tr key={slot}>
                  <td style={{ fontSize: 12, color: 'var(--content-muted)', textTransform: 'uppercase', letterSpacing: '.05em', verticalAlign: 'top', paddingTop: 8 }}>
                    {SLOT_LABELS[slot]}
                  </td>
                  {DAY_LABELS.map((_, day) => (
                    <td key={day} style={{ verticalAlign: 'top' }}>
                      <div style={{ position: 'relative' }}>
                        <textarea
                          value={mealGrid[`${day}-${slot}`] ?? ''}
                          onChange={(e) => setMealCell(day, slot, e.target.value)}
                          onBlur={(e) => saveMealCell(day, slot, e.target.value)}
                          rows={2}
                          style={{
                            width: '100%', minWidth: 96,
                            background: 'var(--surface,#141414)',
                            border: '1px solid var(--border-default)', borderRadius: 8,
                            padding: '6px 20px 6px 8px', color: 'var(--content-primary)', fontSize: 16,
                            resize: 'vertical', fontFamily: 'inherit',
                          }}
                        />
                        <button
                          onClick={() => setPicker({ day, slot })}
                          title="AI: suggest a meal for this slot"
                          style={{
                            position: 'absolute', top: 4, right: 4, padding: 2,
                            background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0,
                          }}
                        >
                          <Icon name="i-sparkle" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ds-sub" style={{ fontSize: 12, marginTop: 4 }}>
            Cells save on blur · use the mobile view&apos;s &quot;→ all week&quot; to repeat a meal
          </div>
        </div>

        {/* Mobile: per-day editor with slot copy */}
        <div data-coach-mobile-workspace className="lg:hidden card grid grid-cols-1" style={{ padding: 12, marginBottom: 16 }}>
          {/* Day selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {DAY_LABELS.map((d, i) => {
              const dayHasContent = MEAL_SLOTS.some((s) => (mealGrid[`${i}-${s}`] ?? '').trim());
              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(i)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: activeDay === i ? 'var(--gold-300,#D4A853)' : 'var(--border-default)',
                    background: activeDay === i ? 'rgba(212,168,83,.12)' : 'transparent',
                    color: activeDay === i ? 'var(--gold-300,#D4A853)' : dayHasContent ? 'var(--content-primary)' : 'var(--content-muted)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Slot editors for the active day */}
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} style={{ marginBottom: 10 }}>
              <div className="row-b" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--content-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {SLOT_LABELS[slot]}
                </span>
                <div className="row-i" style={{ gap: 10 }}>
                  <button
                    onClick={() => setPicker({ day: activeDay, slot })}
                    title="AI: suggest a meal for this slot"
                    className="row-i"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', gap: 3,
                      color: 'var(--gold-300,#D4A853)', fontSize: 12, fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <Icon name="i-sparkle" size={11} style={{ color: 'var(--gold-300,#D4A853)' }} />
                    AI
                  </button>
                  <button
                    onClick={() => copySlotToWeek(slot)}
                    disabled={!(mealGrid[`${activeDay}-${slot}`] ?? '').trim()}
                    title="Copy this meal to every day of the week"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--content-muted)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    → all week
                  </button>
                </div>
              </div>
              <textarea
                value={mealGrid[`${activeDay}-${slot}`] ?? ''}
                onChange={(e) => setMealCell(activeDay, slot, e.target.value)}
                onBlur={(e) => saveMealCell(activeDay, slot, e.target.value)}
                placeholder={slot === 'breakfast' ? 'e.g. 1 cup oatmeal with berries' : '—'}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--surface,#141414)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: 'var(--content-primary)',
                  fontSize: 16,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
        </div>
        <span data-coach-mobile-workspace-end className="sr-only" />

        {/* ══ Active Habits ══ */}
         <div className="eye" style={{ marginBottom: 8 }}>
           ACTIVE HABITS ({activeHabits.length})
         </div>
         {habitActionError && (
           <div
             role="alert"
             style={{ color: 'var(--err,#E87A6E)', fontSize: 12, marginBottom: 8 }}
           >
             {habitActionError}
           </div>
         )}
         <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {activeHabits.map((ch) => (
            <div
              key={ch.id}
              className="card row-b"
              style={{ padding: '10px 12px' }}
            >
              <div className="row-i" style={{ gap: 8 }}>
                <span style={{ fontSize: 18 }}>{ch.habit.emoji}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--content-primary)' }}>
                    {ch.habit.name_en}
                  </div>
                  <div className="ds-sub">
                    {ch.habit.category} · {ch.habit.difficulty}
                  </div>
                </div>
              </div>
               <button
                 onClick={() => removeHabit(ch.id)}
                 disabled={habitActionPending !== null}
                 style={{
                   background: 'none',
                   border: 'none',
                   cursor: habitActionPending ? 'not-allowed' : 'pointer',
                   color: 'var(--content-muted)',
                  padding: 4,
                }}
                title="Remove habit"
              >
                <Icon name="i-x" size={14} />
              </button>
            </div>
          ))}
          {activeHabits.length === 0 && (
            <div
              className="card ds-sub"
              style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}
            >
              No active habits assigned
            </div>
          )}
        </div>

        {/* ══ Add Habit ══ */}
        {availableToAdd.length > 0 && (
          <>
            <div className="eye" style={{ marginBottom: 8 }}>
              ADD HABIT
            </div>
            <div className="card" style={{ padding: 12, marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {availableToAdd.map((h) => (
                   <button
                     key={h.id}
                     onClick={() => addHabit(h.id)}
                     disabled={habitActionPending !== null}
                     style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      background: 'transparent',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                       cursor: habitActionPending ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{h.emoji}</span>
                    <span style={{ fontSize: 12, color: 'var(--content-primary)', flex: 1 }}>
                      {h.name_en}
                    </span>
                    <Icon name="i-plus" size={12} style={{ color: 'var(--gold-300,#D4A853)' }} />
                  </button>
                ))}
              </div>
            </div>
          </>
         )}

         {/* ══ Save Button ══ */}
         {saveError && (
           <div
             role="alert"
             style={{
               color: 'var(--err,#E87A6E)',
               fontSize: 12,
               marginBottom: 8,
               textAlign: 'center',
             }}
           >
             {saveError}
           </div>
         )}
         <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            background: saved ? 'rgba(34,197,94,.15)' : 'var(--gold-300,#D4A853)',
            color: saved ? 'rgb(34,197,94)' : '#0a0a0a',
            border: saved ? '1px solid rgba(34,197,94,.3)' : 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '.1em',
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
            transition: 'background .2s, color .2s',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Plan'}
        </button>
      </motion.div>

      {/* AI meal-suggest / recipe-analyze picker, scoped to the chosen cell */}
      {picker && (
        <MealSuggestPicker
          isOpen={true}
          slotLabel={SLOT_LABELS[picker.slot]}
          slotFraction={SLOT_FRACTION[picker.slot]}
          targets={{ calories: derivedKcal, protein: targets.protein, carbs: targets.carbs, fat: targets.fat }}
          initialText={mealGrid[`${picker.day}-${picker.slot}`] ?? ''}
          onPick={handlePickMeal}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Shopping list generated from the week's meal plan */}
      <ShoppingListModal
        isOpen={showShopping}
        clientId={clientId}
        clientName={profileName}
        onClose={() => setShowShopping(false)}
      />

      {/* Per-day macro rollup vs targets */}
      <MacroRollupModal
        isOpen={showMacros}
        clientId={clientId}
        clientName={profileName}
        onClose={() => setShowMacros(false)}
      />
    </div>
  );
}
