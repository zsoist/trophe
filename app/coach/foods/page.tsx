'use client';
import { useRouter } from 'next/navigation';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  UtensilsCrossed,
  Search,
  Share2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CustomFood } from '@/lib/types';
import { CoachNav } from '../page';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import { BotNav } from '@/components/ui/BotNav';
import { Icon } from '@/components/ui';

const COACH_NAV = [
  { href: '/coach',         label: 'Today',   icon: <Icon name="i-grid"    size={18} /> },
  { href: '/coach/clients', label: 'Clients', icon: <Icon name="i-users"   size={18} /> },
  { href: '/coach/inbox',   label: 'Inbox',   icon: <Icon name="i-message" size={18} /> },
  { href: '/coach/profile', label: 'Me',      icon: <Icon name="i-user"    size={18} /> },
];

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const foodCategories = [
  'protein',
  'carbohydrate',
  'fat',
  'vegetable',
  'fruit',
  'dairy',
  'supplement',
  'snack',
  'beverage',
  'other',
];

const emptyFood = {
  name: '',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
  fiber_g: '',
  unit: '100g',
  category: 'protein',
  shared: false,
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function FoodsPage() {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyFood });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const loadFoods = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      // Role guard — only coaches can access
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role === 'client') { router.push('/dashboard'); return; }
      setUserId(user.id);

      // Get coach's custom foods + shared foods from other coaches
      const { data } = await supabase
        .from('custom_foods')
        .select('*')
        .or(`created_by.eq.${user?.id},shared.eq.true`)
        .order('name', { ascending: true });

      setFoods(data || []);
    } catch (err) {
      console.error('Error loading foods:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadFoods();
  }, [loadFoods]);

  function openCreate() {
    setForm({ ...emptyFood });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(food: CustomFood) {
    setForm({
      name: food.name,
      calories: food.calories?.toString() || '',
      protein_g: food.protein_g?.toString() || '',
      carbs_g: food.carbs_g?.toString() || '',
      fat_g: food.fat_g?.toString() || '',
      fiber_g: food.fiber_g?.toString() || '',
      unit: food.unit,
      category: food.category || 'protein',
      shared: food.shared,
    });
    setEditingId(food.id);
    setShowForm(true);
  }

  async function saveFood() {
    if (!form.name.trim()) return;
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        calories: form.calories ? parseFloat(form.calories) : null,
        protein_g: form.protein_g ? parseFloat(form.protein_g) : null,
        carbs_g: form.carbs_g ? parseFloat(form.carbs_g) : null,
        fat_g: form.fat_g ? parseFloat(form.fat_g) : null,
        fiber_g: form.fiber_g ? parseFloat(form.fiber_g) : null,
        unit: form.unit.trim() || '100g',
        category: form.category || null,
        shared: form.shared,
      };

      if (editingId) {
        const { data } = await supabase
          .from('custom_foods')
          .update(payload)
          .eq('id', editingId)
          .select()
          .maybeSingle();

        if (data) {
          setFoods(foods.map((f) => (f.id === editingId ? data : f)));
        }
      } else {
        const { data } = await supabase
          .from('custom_foods')
          .insert({
            ...payload,
            created_by: userId,
          })
          .select()
          .maybeSingle();

        if (data) {
          setFoods([...foods, data].sort((a, b) => a.name.localeCompare(b.name)));
        }
      }

      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      console.error('Error saving food:', err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteFood(id: string) {
    if (!confirm('Delete this custom food?')) return;
    try {
      await supabase.from('custom_foods').delete().eq('id', id);
      setFoods(foods.filter((f) => f.id !== id));
    } catch (err) {
      console.error('Error deleting food:', err);
    }
  }

  async function toggleShared(food: CustomFood) {
    const newShared = !food.shared;
    const { data } = await supabase
      .from('custom_foods')
      .update({ shared: newShared })
      .eq('id', food.id)
      .select()
      .maybeSingle();

    if (data) {
      setFoods(foods.map((f) => (f.id === food.id ? data : f)));
    }
  }

  const filtered = foods.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.category && f.category.toLowerCase().includes(search.toLowerCase()))
  );

  const myFoods = filtered.filter((f) => f.created_by === userId);
  const sharedFoods = filtered.filter((f) => f.created_by !== userId && f.shared);

  return (
    <div className="min-h-screen pb-20 px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--bg,#0a0a0a)' }}>
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/foods" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-100">Custom Foods</h1>
              <p className="text-stone-500 text-sm mt-1">
                {foods.length} food{foods.length !== 1 ? 's' : ''} in database
              </p>
            </div>
            <button onClick={openCreate} className="btn-gold flex items-center gap-2 text-sm">
              <Plus size={16} /> Add Food
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search foods or categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-dark pl-10"
            />
          </div>

          {/* My Foods */}
          {loading ? (
            <CoachLoadingSkeletons page="foods" />
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <UtensilsCrossed size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500">
                {foods.length === 0 ? 'No custom foods yet' : 'No foods match your search'}
              </p>
            </div>
          ) : (
            <>
              {/* My Foods Section */}
              {myFoods.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">
                    My Foods ({myFoods.length})
                  </h2>
                  <div className="glass overflow-hidden">
                    {/* Table header */}
                    <div className="hidden sm:grid grid-cols-[1fr_70px_60px_60px_60px_60px_70px_50px_50px] gap-2 px-4 py-2.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider border-b border-white/5">
                      <div>Name</div>
                      <div className="text-right">Cal</div>
                      <div className="text-right">P</div>
                      <div className="text-right">C</div>
                      <div className="text-right">F</div>
                      <div className="text-right">Fiber</div>
                      <div className="text-center">Unit</div>
                      <div className="text-center">Share</div>
                      <div></div>
                    </div>
                    {myFoods.map((food, i) => (
                      <div
                        key={food.id}
                        className={`px-4 py-3 ${i > 0 ? 'border-t border-white/5' : ''}`}
                      >
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-[1fr_70px_60px_60px_60px_60px_70px_50px_50px] gap-2 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-stone-200 truncate">{food.name}</span>
                            {food.category && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/5 text-stone-500 capitalize whitespace-nowrap">
                                {food.category}
                              </span>
                            )}
                          </div>
                          <div className="text-right text-sm text-stone-300">{food.calories ?? '-'}</div>
                          <div className="text-right text-sm text-stone-400">{food.protein_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-400">{food.carbs_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-400">{food.fat_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-500">{food.fiber_g ?? '-'}g</div>
                          <div className="text-center text-xs text-stone-500">{food.unit}</div>
                          <div className="flex justify-center">
                            <button
                              onClick={() => toggleShared(food)}
                              className={`p-1 rounded transition-colors ${
                                food.shared
                                  ? 'text-[#D4A853]'
                                  : 'text-stone-700 hover:text-stone-500'
                              }`}
                              title={food.shared ? 'Shared with clients' : 'Not shared'}
                            >
                              <Share2 size={14} />
                            </button>
                          </div>
                          <div className="flex gap-0.5 justify-end">
                            <button
                              onClick={() => openEdit(food)}
                              className="p-1 text-stone-600 hover:text-stone-300 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteFood(food.id)}
                              className="p-1 text-stone-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Mobile card */}
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-stone-200">{food.name}</span>
                              {food.shared && <Share2 size={12} className="text-[#D4A853]" />}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openEdit(food)} className="p-1.5 text-stone-600 hover:text-stone-300">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => deleteFood(food.id)} className="p-1.5 text-stone-600 hover:text-red-400">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-400">
                            <span className="text-stone-300 font-medium">{food.calories ?? '-'} kcal</span>
                            <span>P:{food.protein_g ?? '-'}g</span>
                            <span>C:{food.carbs_g ?? '-'}g</span>
                            <span>F:{food.fat_g ?? '-'}g</span>
                            <span className="text-stone-600">per {food.unit}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shared Foods Section */}
              {sharedFoods.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">
                    Shared Foods ({sharedFoods.length})
                  </h2>
                  <div className="glass overflow-hidden">
                    <div className="hidden sm:grid grid-cols-[1fr_70px_60px_60px_60px_60px_70px] gap-2 px-4 py-2.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider border-b border-white/5">
                      <div>Name</div>
                      <div className="text-right">Cal</div>
                      <div className="text-right">P</div>
                      <div className="text-right">C</div>
                      <div className="text-right">F</div>
                      <div className="text-right">Fiber</div>
                      <div className="text-center">Unit</div>
                    </div>
                    {sharedFoods.map((food, i) => (
                      <div
                        key={food.id}
                        className={`px-4 py-3 ${i > 0 ? 'border-t border-white/5' : ''}`}
                      >
                        <div className="hidden sm:grid grid-cols-[1fr_70px_60px_60px_60px_60px_70px] gap-2 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-stone-300 truncate">{food.name}</span>
                            {food.category && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/5 text-stone-500 capitalize whitespace-nowrap">
                                {food.category}
                              </span>
                            )}
                          </div>
                          <div className="text-right text-sm text-stone-300">{food.calories ?? '-'}</div>
                          <div className="text-right text-sm text-stone-400">{food.protein_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-400">{food.carbs_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-400">{food.fat_g ?? '-'}g</div>
                          <div className="text-right text-sm text-stone-500">{food.fiber_g ?? '-'}g</div>
                          <div className="text-center text-xs text-stone-500">{food.unit}</div>
                        </div>
                        <div className="sm:hidden">
                          <div className="text-sm text-stone-300 mb-1">{food.name}</div>
                          <div className="flex items-center gap-3 text-xs text-stone-400">
                            <span className="text-stone-300">{food.calories ?? '-'} kcal</span>
                            <span>P:{food.protein_g ?? '-'}g</span>
                            <span>C:{food.carbs_g ?? '-'}g</span>
                            <span>F:{food.fat_g ?? '-'}g</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>

        <BotNav routes={COACH_NAV} />

        {/* ─── Create/Edit Food Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-stone-100 text-lg">
                  {editingId ? 'Edit Food' : 'Add Custom Food'}
                </h3>
                <button onClick={() => setShowForm(false)} className="text-stone-500 hover:text-stone-300">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Food Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Homemade Granola"
                    className="input-dark"
                  />
                </div>

                {/* Macros */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Calories</label>
                    <input
                      value={form.calories}
                      onChange={(e) => setForm({ ...form, calories: e.target.value })}
                      placeholder="0"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Protein (g)</label>
                    <input
                      value={form.protein_g}
                      onChange={(e) => setForm({ ...form, protein_g: e.target.value })}
                      placeholder="0"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Carbs (g)</label>
                    <input
                      value={form.carbs_g}
                      onChange={(e) => setForm({ ...form, carbs_g: e.target.value })}
                      placeholder="0"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Fat (g)</label>
                    <input
                      value={form.fat_g}
                      onChange={(e) => setForm({ ...form, fat_g: e.target.value })}
                      placeholder="0"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Fiber (g)</label>
                    <input
                      value={form.fiber_g}
                      onChange={(e) => setForm({ ...form, fiber_g: e.target.value })}
                      placeholder="0"
                      type="number"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Unit</label>
                    <input
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="100g"
                      className="input-dark"
                    />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input-dark capitalize"
                  >
                    {foodCategories.map((c) => (
                      <option key={c} value={c} className="bg-stone-900 capitalize">{c}</option>
                    ))}
                  </select>
                </div>

                {/* Shared toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      form.shared ? 'bg-[#D4A853]' : 'bg-stone-700'
                    }`}
                    onClick={() => setForm({ ...form, shared: !form.shared })}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        form.shared ? 'translate-x-5' : ''
                      }`}
                    />
                  </div>
                  <span className="text-sm text-stone-300">
                    Share with assigned clients
                  </span>
                </label>

                {/* Save */}
                <button
                  onClick={saveFood}
                  disabled={saving || !form.name.trim()}
                  className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : editingId ? 'Update Food' : 'Add Food'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
