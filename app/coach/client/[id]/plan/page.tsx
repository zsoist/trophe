'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui';

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
  border: '1px solid var(--line)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--t2)',
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

  // UI state
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  // ── Load ────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Verify coach role
      const { data: coachProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = coachProfile?.role ?? '';
      if (!['coach', 'admin', 'super_admin'].includes(role)) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      setCoachId(user.id);

      const [profileRes, clientProfileRes, activeHabitsRes, templateHabitsRes] =
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
        ]);

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
    } catch (err) {
      console.error('PlanEditor: load error', err);
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
    await supabase
      .from('client_profiles')
      .update({
        target_calories: targets.calories,
        target_protein_g: targets.protein,
        target_carbs_g: targets.carbs,
        target_fat_g: targets.fat,
        target_water_ml: targets.water,
        coaching_phase: phase,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', clientId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  const addHabit = async (habitId: string) => {
    if (!coachId) return;
    const { data } = await supabase
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
    if (data) {
      const typed = data as unknown as ClientHabit;
      setActiveHabits((prev) => [...prev, typed]);
    }
  };

  const removeHabit = async (clientHabitId: string) => {
    await supabase
      .from('client_habits')
      .update({ status: 'paused' })
      .eq('id', clientHabitId);
    setActiveHabits((prev) => prev.filter((h) => h.id !== clientHabitId));
  };

  // ── Step helpers ─────────────────────────────────

  const step = (key: keyof MacroTargets, delta: number) =>
    setTargets((t) => ({ ...t, [key]: Math.max(0, t[key] + delta) }));

  // ── Render guards ────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg,#0a0a0a)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '2px solid var(--line)',
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
        style={{ background: 'var(--bg,#0a0a0a)' }}
      >
        <div className="card" style={{ padding: 24, textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 16 }}>
            Coach access required
          </div>
          <button
            onClick={() => router.back()}
            style={{
              background: 'var(--gold-300,#D4A853)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
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

  const macroFields: Array<{
    key: keyof MacroTargets;
    label: string;
    unit: string;
    stepSize: number;
  }> = [
    { key: 'calories', label: 'Calories', unit: 'kcal', stepSize: 50 },
    { key: 'protein', label: 'Protein', unit: 'g', stepSize: 5 },
    { key: 'carbs', label: 'Carbs', unit: 'g', stepSize: 5 },
    { key: 'fat', label: 'Fat', unit: 'g', stepSize: 5 },
    { key: 'water', label: 'Water', unit: 'ml', stepSize: 250 },
  ];

  const availableToAdd = templateHabits.filter(
    (h) => !activeHabits.some((ah) => ah.habit.id === h.id)
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}
    >
      {/* Spin keyframe injected inline — works without global CSS changes */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div
        className="max-w-md mx-auto px-4 pt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ── Header ── */}
        <div className="row-b" style={{ marginBottom: 16 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}
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
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
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
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>Coaching Phase</span>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              style={{
                background: 'var(--surface,#141414)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '4px 8px',
                color: 'var(--t1)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {/* Macro stepper rows */}
          {macroFields.map((f) => (
            <div key={f.key} className="row-b" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--t2)', width: 60 }}>{f.label}</span>
              <div className="row-i" style={{ gap: 6 }}>
                <button style={stepBtn} onClick={() => step(f.key, -f.stepSize)}>
                  −
                </button>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--t1)',
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

        {/* ══ Active Habits ══ */}
        <div className="eye" style={{ marginBottom: 8 }}>
          ACTIVE HABITS ({activeHabits.length})
        </div>
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
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>
                    {ch.habit.name_en}
                  </div>
                  <div className="ds-sub">
                    {ch.habit.category} · {ch.habit.difficulty}
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeHabit(ch.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--t4)',
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{h.emoji}</span>
                    <span style={{ fontSize: 12, color: 'var(--t1)', flex: 1 }}>
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
    </div>
  );
}
