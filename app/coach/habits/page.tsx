'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
import { CoachNav } from '../page';

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
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyHabit });
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
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
  }

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
          .single();

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

  async function deleteHabit(id: string) {
    if (!confirm('Delete this custom habit?')) return;
    try {
      await supabase.from('habits').delete().eq('id', id);
      setHabits(habits.filter((h) => h.id !== id));
    } catch (err) {
      console.error('Error deleting habit:', err);
    }
  }

  const filtered = filterCategory === 'all'
    ? habits
    : habits.filter((h) => h.category === filterCategory);

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/habits" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-100">Habit Library</h1>
              <p className="text-stone-500 text-sm mt-1">
                {habits.length} habits ({habits.filter((h) => h.is_template).length} templates)
              </p>
            </div>
            <button onClick={openCreate} className="btn-gold flex items-center gap-2 text-sm">
              <Plus size={16} /> New Habit
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterCategory('all')}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-all ${
                filterCategory === 'all'
                  ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                  : 'border-stone-800 text-stone-500 hover:border-stone-700'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap transition-all capitalize ${
                  filterCategory === cat
                    ? 'border-[#D4A853]/40 bg-[#D4A853]/10 text-[#D4A853]'
                    : 'border-stone-800 text-stone-500 hover:border-stone-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Habit Cards */}
          {loading ? (
            <div className="text-center py-20 text-stone-500">Loading habits...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Dumbbell size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500">No habits found</p>
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
                        <h3 className="font-medium text-stone-100 truncate">{habit.name_en}</h3>
                        {habit.is_template && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/5 text-stone-500">
                            TEMPLATE
                          </span>
                        )}
                      </div>
                      {habit.name_es && (
                        <div className="text-xs text-stone-500 truncate">{habit.name_es}</div>
                      )}
                      {habit.description_en && (
                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">{habit.description_en}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {habit.category && (
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[habit.category]}`}>
                            {habit.category}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${difficultyColors[habit.difficulty]}`}>
                          {habit.difficulty}
                        </span>
                        {habit.target_value && (
                          <span className="text-[10px] text-stone-500">
                            Target: {habit.target_value} {habit.target_unit || ''}
                          </span>
                        )}
                        <span className="text-[10px] text-stone-600">
                          {habit.cycle_days}d cycle
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(habit)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-stone-500 hover:text-stone-300 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {!habit.is_template && (
                        <button
                          onClick={() => deleteHabit(habit.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-stone-500 hover:text-red-400 transition-colors"
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

        {/* ─── Create/Edit Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-stone-100 text-lg">
                  {editingId ? 'Edit Habit' : 'Create New Habit'}
                </h3>
                <button onClick={() => setShowForm(false)} className="text-stone-500 hover:text-stone-300">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Emoji + Name EN */}
                <div className="grid grid-cols-[60px_1fr] gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Emoji</label>
                    <input
                      value={form.emoji}
                      onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                      placeholder="💧"
                      className="input-dark text-center text-xl"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Name (English) *</label>
                    <input
                      value={form.name_en}
                      onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                      placeholder="Drink 2L water daily"
                      className="input-dark"
                    />
                  </div>
                </div>

                {/* Name ES + EL */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Name (Spanish)</label>
                    <input
                      value={form.name_es}
                      onChange={(e) => setForm({ ...form, name_es: e.target.value })}
                      placeholder="Beber 2L de agua"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Name (Greek)</label>
                    <input
                      value={form.name_el}
                      onChange={(e) => setForm({ ...form, name_el: e.target.value })}
                      className="input-dark"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Description</label>
                  <textarea
                    value={form.description_en}
                    onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                    placeholder="Why this habit matters and how to do it..."
                    className="input-dark resize-none"
                    rows={3}
                  />
                </div>

                {/* Category + Difficulty */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as HabitCategory })}
                      className="input-dark capitalize"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c} className="bg-stone-900 capitalize">{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Difficulty</label>
                    <select
                      value={form.difficulty}
                      onChange={(e) => setForm({ ...form, difficulty: e.target.value as HabitDifficulty })}
                      className="input-dark capitalize"
                    >
                      {difficulties.map((d) => (
                        <option key={d} value={d} className="bg-stone-900 capitalize">{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target + Unit + Cycle */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Target Value</label>
                    <input
                      value={form.target_value}
                      onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                      placeholder="2000"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Unit</label>
                    <input
                      value={form.target_unit}
                      onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
                      placeholder="ml"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Cycle Days</label>
                    <input
                      value={form.cycle_days}
                      onChange={(e) => setForm({ ...form, cycle_days: e.target.value })}
                      placeholder="21"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={saveHabit}
                  disabled={saving || !form.name_en.trim() || !form.emoji.trim()}
                  className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
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
