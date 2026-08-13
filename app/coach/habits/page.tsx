'use client';
import { useRouter } from 'next/navigation';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Dumbbell,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Habit, HabitCategory, HabitDifficulty } from '@/lib/types';
import { CoachNav } from '@/components/coach/CoachNav';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import { useDialogFocus } from '@/components/shared/useDialogFocus';
import { BotNav } from '@/components/ui/BotNav';
import { Icon, ConfirmSheet } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

/* All four tabs point at real routes — matches app/coach/page.tsx
   (were /coach/clients + /coach/profile 404s) */
const COACH_NAV = [
  { href: '/coach',           label: 'Today',    icon: <Icon name="i-grid"     size={18} /> },
  { href: '/coach/inbox',     label: 'Inbox',    icon: <Icon name="i-message"  size={18} /> },
  { href: '/coach/calendar',  label: 'Calendar', icon: <Icon name="i-calendar" size={18} /> },
  { href: '/coach/templates', label: 'Workouts', icon: <Icon name="i-dumbbell" size={18} /> },
];

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const categories: HabitCategory[] = ['nutrition', 'hydration', 'movement', 'sleep', 'mindset', 'recovery'];
const difficulties: HabitDifficulty[] = ['beginner', 'intermediate', 'advanced'];

const categoryColors: Record<HabitCategory, string> = {
  nutrition: 'bg-green-500/10 text-green-400',
  hydration: 'bg-blue-500/10 text-blue-400',
  movement: 'bg-orange-500/10 text-orange-400',
  sleep: 'bg-purple-500/10 text-purple-400',
  mindset: 'bg-pink-500/10 text-pink-400',
  recovery: 'bg-teal-500/10 text-teal-400',
};

const difficultyColors: Record<HabitDifficulty, string> = {
  beginner: 'bg-green-500/10 text-green-400',
  intermediate: 'bg-yellow-500/10 text-yellow-400',
  advanced: 'bg-red-500/10 text-red-400',
};

const emptyHabit = {
  name_en: '',
  name_es: '',
  name_el: '',
  description_en: '',
  emoji: '',
  category: 'nutrition' as HabitCategory,
  difficulty: 'beginner' as HabitDifficulty,
  target_value: '',
  target_unit: '',
  cycle_days: '21',
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function HabitsPage() {
  const { t } = useI18n();
  const [habits, setHabits] = useState<Habit[]>([]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyHabit });
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  useDialogFocus(showForm, () => setShowForm(false), dialogRef);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      // Role guard — only coaches can access
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role === 'client') { router.push('/dashboard'); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('habits')
        .select('*')
        .order('suggested_order', { ascending: true, nullsFirst: false });

      setHabits(data || []);
    } catch (err) {
      console.error('Error loading habits:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setForm({ ...emptyHabit });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(habit: Habit) {
    setForm({
      name_en: habit.name_en,
      name_es: habit.name_es || '',
      name_el: habit.name_el || '',
      description_en: habit.description_en || '',
      emoji: habit.emoji,
      category: habit.category || 'nutrition',
      difficulty: habit.difficulty,
      target_value: habit.target_value?.toString() || '',
      target_unit: habit.target_unit || '',
      cycle_days: habit.cycle_days.toString(),
    });
    setEditingId(habit.id);
    setShowForm(true);
  }

  async function saveHabit() {
    if (!form.name_en.trim() || !form.emoji.trim()) return;
    setSaving(true);

    try {
      const payload = {
        name_en: form.name_en.trim(),
        name_es: form.name_es.trim() || null,
        name_el: form.name_el.trim() || null,
        description_en: form.description_en.trim() || null,
        emoji: form.emoji.trim(),
        category: form.category,
        difficulty: form.difficulty,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        target_unit: form.target_unit.trim() || null,
        cycle_days: parseInt(form.cycle_days) || 21,
      };

      if (editingId) {
        const { data } = await supabase
          .from('habits')
          .update(payload)
          .eq('id', editingId)
          .select()
          .maybeSingle();

        if (data) {
          setHabits(habits.map((h) => (h.id === editingId ? data : h)));
        }
      } else {
        const { data } = await supabase
          .from('habits')
          .insert({
            ...payload,
            created_by: userId,
            is_template: false,
          })
          .select()
          .maybeSingle();

        if (data) {
          setHabits([...habits, data]);
        }
      }

      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      console.error('Error saving habit:', err);
    } finally {
      setSaving(false);
    }
  }

  function deleteHabit(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDeleteHabit() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await supabase.from('habits').delete().eq('id', pendingDeleteId);
      setHabits((prev) => prev.filter((h) => h.id !== pendingDeleteId));
    } catch (err) {
      console.error('Error deleting habit:', err);
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  const filtered = filterCategory === 'all'
    ? habits
    : habits.filter((h) => h.category === filterCategory);

  return (
    <div data-coach-mobile-workspace className="min-h-screen min-w-0 pb-20 px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/habits" />

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--content-primary)]">Habit Library</h1>
              <p className="text-[var(--content-secondary)] text-sm mt-1">
                {habits.length} habits ({habits.filter((h) => h.is_template).length} templates)
              </p>
            </div>
            <button onClick={openCreate} className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold flex items-center gap-2 text-sm">
              <Plus size={16} /> New Habit
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterCategory('all')}
              className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-all ${
                filterCategory === 'all'
                  ? 'border-[var(--action-primary)] bg-[var(--surface-active)] text-[var(--action-primary)]'
                  : 'border-[var(--border-default)] text-[var(--content-secondary)] hover:border-[var(--border-default)]'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-all capitalize ${
                  filterCategory === cat
                    ? 'border-[var(--action-primary)] bg-[var(--surface-active)] text-[var(--action-primary)]'
                    : 'border-[var(--border-default)] text-[var(--content-secondary)] hover:border-[var(--border-default)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Habit Cards */}
          {loading ? (
            <CoachLoadingSkeletons page="habits" />
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Dumbbell size={48} className="mx-auto text-[var(--content-muted)] mb-4" />
              <p className="text-[var(--content-secondary)]">No habits found</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((habit, i) => (
                <motion.div
                  key={habit.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{habit.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-[var(--content-primary)] truncate">{habit.name_en}</h3>
                        {habit.is_template && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--content-secondary)]">
                            TEMPLATE
                          </span>
                        )}
                      </div>
                      {habit.name_es && (
                        <div className="text-xs text-[var(--content-secondary)] truncate">{habit.name_es}</div>
                      )}
                      {habit.description_en && (
                        <p className="text-xs text-[var(--content-secondary)] mt-1 line-clamp-2">{habit.description_en}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {habit.category && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[habit.category]}`}>
                            {habit.category}
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${difficultyColors[habit.difficulty]}`}>
                          {habit.difficulty}
                        </span>
                        {habit.target_value && (
                          <span className="text-xs text-[var(--content-secondary)]">
                            Target: {habit.target_value} {habit.target_unit || ''}
                          </span>
                        )}
                        <span className="text-xs text-[var(--content-muted)]">
                          {habit.cycle_days}d cycle
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(habit)}
                        aria-label={`Edit ${habit.name_en}`}
                        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--content-secondary)] hover:text-[var(--content-primary)] transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {!habit.is_template && (
                        <button
                          onClick={() => deleteHabit(habit.id)}
                          aria-label={`Delete ${habit.name_en}`}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--content-secondary)] hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <BotNav routes={COACH_NAV} />

        <ConfirmSheet
          open={pendingDeleteId !== null}
          title={t('confirm.delete_habit_title')}
          message={t('confirm.delete_habit_msg')}
          confirmLabel={t('confirm.delete')}
          danger
          loading={deleting}
          onConfirm={confirmDeleteHabit}
          onCancel={() => setPendingDeleteId(null)}
        />

        {/* ─── Create/Edit Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4">
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="habit-dialog-title"
              initial={reducedMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated safe-bottom p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 id="habit-dialog-title" className="font-semibold text-[var(--content-primary)] text-lg">
                  {editingId ? 'Edit Habit' : 'Create New Habit'}
                </h3>
                <button onClick={() => setShowForm(false)} aria-label="Close habit editor" className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Emoji + Name EN */}
                <div className="grid grid-cols-[60px_1fr] gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Emoji</label>
                    <input
                      value={form.emoji}
                      onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                      placeholder={t('habits.emoji_placeholder')}
                      className="text-base input-dark text-center text-xl"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Name (English) *</label>
                    <input
                      value={form.name_en}
                      onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                      placeholder="Drink 2L water daily"
                      className="text-base input-dark"
                    />
                  </div>
                </div>

                {/* Name ES + EL */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Name (Spanish)</label>
                    <input
                      value={form.name_es}
                      onChange={(e) => setForm({ ...form, name_es: e.target.value })}
                      placeholder="Beber 2L de agua"
                      className="text-base input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Name (Greek)</label>
                    <input
                      value={form.name_el}
                      onChange={(e) => setForm({ ...form, name_el: e.target.value })}
                      className="text-base input-dark"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-[var(--content-secondary)] mb-1 block">Description</label>
                  <textarea
                    value={form.description_en}
                    onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                    placeholder="Why this habit matters and how to do it..."
                    className="text-base input-dark resize-none"
                    rows={3}
                  />
                </div>

                {/* Category + Difficulty */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as HabitCategory })}
                      className="text-base input-dark capitalize"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c} className="bg-[var(--surface-1)] capitalize">{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Difficulty</label>
                    <select
                      value={form.difficulty}
                      onChange={(e) => setForm({ ...form, difficulty: e.target.value as HabitDifficulty })}
                      className="text-base input-dark capitalize"
                    >
                      {difficulties.map((d) => (
                        <option key={d} value={d} className="bg-[var(--surface-1)] capitalize">{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target + Unit + Cycle */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Target Value</label>
                    <input
                      value={form.target_value}
                      onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                      placeholder="2000"
                      type="number"
                      className="text-base input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Unit</label>
                    <input
                      value={form.target_unit}
                      onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
                      placeholder="ml"
                      className="text-base input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Cycle Days</label>
                    <input
                      value={form.cycle_days}
                      onChange={(e) => setForm({ ...form, cycle_days: e.target.value })}
                      placeholder="21"
                      type="number"
                      className="text-base input-dark"
                    />
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={saveHabit}
                  disabled={saving || !form.name_en.trim() || !form.emoji.trim()}
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : editingId ? 'Update Habit' : 'Create Habit'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
