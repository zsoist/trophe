'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  X,
  Save,
  Search,
  ChevronDown,
  ChevronUp,
  UserPlus,
  ArrowUp,
  ArrowDown,
  Dumbbell,
  LayoutTemplate,
  GripVertical,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type {
  WorkoutTemplate,
  TemplateExercise,
  Exercise,
  Profile,
  ClientProfile,
  MuscleGroup,
} from '@/lib/types';
import { CoachNav } from '../page';

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const difficultyOptions = ['beginner', 'intermediate', 'advanced'];
const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-500/15 text-green-400 border-green-500/20',
  intermediate: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  advanced: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const muscleOptions: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
];

const muscleLabels: Record<string, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps',
  triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings',
  glutes: 'Glutes', calves: 'Calves', core: 'Core', full_body: 'Full Body',
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function TemplatesPage() {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Exercise search
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDayLabel, setFormDayLabel] = useState('');
  const [formDifficulty, setFormDifficulty] = useState('intermediate');
  const [formTargetMuscles, setFormTargetMuscles] = useState<string[]>([]);
  const [formExercises, setFormExercises] = useState<(TemplateExercise & { _name?: string })[]>([]);
  const [formShared, setFormShared] = useState(false);
  const [saving, setSaving] = useState(false);

  // Assign state
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null);
  const [clients, setClients] = useState<(ClientProfile & { profile?: Profile })[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      loadTemplates();
      loadExerciseLibrary();
    }
    checkAuth();
  }, [router]);

  async function loadTemplates() {
    try {
      const { data } = await supabase
        .from('workout_templates')
        .select('*')
        .order('created_at', { ascending: false });

      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadExerciseLibrary() {
    try {
      const { data } = await supabase
        .from('exercises')
        .select('*')
        .order('name');

      setExerciseLibrary(data || []);
    } catch (err) {
      console.error('Error loading exercises:', err);
    }
  }

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormDayLabel('');
    setFormDifficulty('intermediate');
    setFormTargetMuscles([]);
    setFormExercises([]);
    setFormShared(false);
  }

  // ── Exercise search ──

  const searchExercises = useCallback(
    (q: string) => {
      setExerciseQuery(q);
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      const lower = q.toLowerCase();
      const matches = exerciseLibrary.filter(
        (ex) =>
          ex.name.toLowerCase().includes(lower) ||
          ex.muscle_group.toLowerCase().includes(lower)
      );
      setSearchResults(matches.slice(0, 8));
    },
    [exerciseLibrary]
  );

  function addExerciseToForm(exercise: Exercise) {
    setFormExercises([
      ...formExercises,
      {
        exercise_id: exercise.id,
        target_sets: 3,
        target_reps: '8-12',
        target_rpe: undefined,
        notes: '',
        _name: exercise.name,
      },
    ]);
    setExerciseQuery('');
    setSearchResults([]);
  }

  function removeExercise(index: number) {
    setFormExercises(formExercises.filter((_, i) => i !== index));
  }

  function moveExercise(index: number, direction: 'up' | 'down') {
    const newList = [...formExercises];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    setFormExercises(newList);
  }

  function updateExercise(
    index: number,
    field: keyof TemplateExercise,
    value: string | number | undefined
  ) {
    const updated = [...formExercises];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setFormExercises(updated);
  }

  function toggleMuscle(muscle: string) {
    setFormTargetMuscles((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    );
  }

  // ── Save ──

  async function saveTemplate() {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const exercisesForDB: TemplateExercise[] = formExercises
        .filter((e) => e.exercise_id)
        .map((exercise) => ({
          exercise_id: exercise.exercise_id,
          target_sets: exercise.target_sets,
          target_reps: exercise.target_reps,
          target_rpe: exercise.target_rpe,
          notes: exercise.notes,
        }));

      const { data } = await supabase
        .from('workout_templates')
        .insert({
          created_by: user.id,
          name: formName.trim(),
          description: formDesc.trim() || null,
          day_label: formDayLabel.trim() || null,
          difficulty: formDifficulty,
          target_muscles: formTargetMuscles.length > 0 ? formTargetMuscles : null,
          exercises: exercisesForDB,
          shared: formShared,
        })
        .select()
        .maybeSingle();

      if (data) {
        setTemplates([data, ...templates]);
        setShowForm(false);
        resetForm();
        toast.success('Template created');
      }
    } catch (err) {
      console.error('Error saving template:', err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await supabase.from('workout_templates').delete().eq('id', id);
      setTemplates(templates.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  }

  // ── Assign to Client ──

  async function openAssign(templateId: string) {
    setAssigningTemplateId(templateId);
    setLoadingClients(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientProfiles } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('coach_id', user.id);

      if (clientProfiles) {
        const userIds = clientProfiles.map((cp: ClientProfile) => cp.user_id);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);

        const merged = clientProfiles.map((cp: ClientProfile) => ({
          ...cp,
          profile: (profiles || []).find((p: Profile) => p.id === cp.user_id),
        }));
        setClients(merged);
      }
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }

  async function assignToClient(clientUserId: string) {
    if (!assigningTemplateId) return;
    try {
      // Update client's active template reference
      await supabase
        .from('client_profiles')
        .update({ current_template_id: assigningTemplateId })
        .eq('user_id', clientUserId);

      setAssigningTemplateId(null);
      toast.success('Template assigned to client');
    } catch (err) {
      console.error('Error assigning template:', err);
      toast.error('Failed to assign template');
    }
  }

  // ── Render ──

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/templates" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-stone-100">
                Workout Templates
              </h1>
              <p className="text-stone-500 text-sm mt-1">
                {templates.length} template{templates.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="btn-gold flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> New Template
            </button>
          </div>

          {/* Template List */}
          {loading ? (
            <div className="text-center py-20 text-stone-500">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <LayoutTemplate size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="text-stone-500">No templates created yet</p>
              <p className="text-stone-600 text-sm mt-1">
                Create workout routines and assign them to clients
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template, i) => {
                const isExpanded = expandedId === template.id;
                const exercises = template.exercises || [];
                const muscles = template.target_muscles || [];

                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="glass"
                  >
                    {/* Header row */}
                    <div
                      className="p-4 sm:p-5 flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : template.id)}
                    >
                      <Dumbbell size={18} className="text-[#D4A853] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-stone-100">{template.name}</h3>
                          {template.day_label && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D4A853]/10 text-[#D4A853] font-medium">
                              {template.day_label}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                              difficultyColors[template.difficulty] || difficultyColors.intermediate
                            }`}
                          >
                            {template.difficulty}
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-xs text-stone-500 mt-0.5 truncate">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
                          <span>
                            {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                          </span>
                          {muscles.length > 0 && (
                            <span className="truncate">
                              {muscles.map((m) => muscleLabels[m] || m).join(', ')}
                            </span>
                          )}
                          {template.shared && (
                            <span className="text-green-400/70">Shared</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssign(template.id);
                          }}
                          className="p-2 rounded-lg hover:bg-white/5 text-stone-400 hover:text-[#D4A853] transition-colors"
                          title="Assign to client"
                        >
                          <UserPlus size={15} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTemplate(template.id);
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-stone-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-stone-500" />
                        ) : (
                          <ChevronDown size={16} className="text-stone-500" />
                        )}
                      </div>
                    </div>

                    {/* Expanded exercise list */}
                    {isExpanded && exercises.length > 0 && (
                      <div className="px-4 sm:px-5 pb-4 border-t border-white/5">
                        <div className="mt-3 space-y-2">
                          {exercises.map((ex, ei) => {
                            const exInfo = exerciseLibrary.find(
                              (e) => e.id === ex.exercise_id
                            );
                            return (
                              <div
                                key={ei}
                                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03]"
                              >
                                <span className="text-xs text-stone-600 w-5 text-center font-mono">
                                  {ei + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-stone-200">
                                    {exInfo?.name || ex.exercise_id}
                                  </span>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-500">
                                    <span>{ex.target_sets} sets</span>
                                    <span>{ex.target_reps} reps</span>
                                    {ex.target_rpe && <span>RPE {ex.target_rpe}</span>}
                                    {ex.notes && (
                                      <span className="text-stone-600 truncate">{ex.notes}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ─── Create Template Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-stone-100 text-lg">New Template</h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-stone-500 hover:text-stone-300"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Template Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Upper Body Hypertrophy"
                    className="input-dark"
                  />
                </div>

                {/* Description + Day Label */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Description</label>
                    <input
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Brief description"
                      className="input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Day Label</label>
                    <input
                      value={formDayLabel}
                      onChange={(e) => setFormDayLabel(e.target.value)}
                      placeholder="e.g. Push A"
                      className="input-dark"
                    />
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">Difficulty</label>
                  <div className="flex gap-2">
                    {difficultyOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setFormDifficulty(d)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                          formDifficulty === d
                            ? difficultyColors[d]
                            : 'border-white/5 text-stone-500 hover:bg-white/5'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Muscles */}
                <div>
                  <label className="text-xs text-stone-500 mb-2 block">Target Muscles</label>
                  <div className="flex flex-wrap gap-1.5">
                    {muscleOptions.map((m) => (
                      <button
                        key={m}
                        onClick={() => toggleMuscle(m)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          formTargetMuscles.includes(m)
                            ? 'bg-[#D4A853]/15 text-[#D4A853] border border-[#D4A853]/30'
                            : 'bg-white/[0.03] text-stone-500 border border-white/5 hover:bg-white/5'
                        }`}
                      >
                        {muscleLabels[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exercises */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-stone-500">
                      Exercises ({formExercises.length})
                    </label>
                  </div>

                  {formExercises.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {formExercises.map((ex, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-white/[0.03] space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical size={14} className="text-stone-700 shrink-0" />
                            <span className="text-sm font-medium text-stone-200 flex-1 truncate">
                              {ex._name || ex.exercise_id}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => moveExercise(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 text-stone-600 hover:text-stone-300 disabled:opacity-20 transition-colors"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                onClick={() => moveExercise(idx, 'down')}
                                disabled={idx === formExercises.length - 1}
                                className="p-1 text-stone-600 hover:text-stone-300 disabled:opacity-20 transition-colors"
                              >
                                <ArrowDown size={12} />
                              </button>
                              <button
                                onClick={() => removeExercise(idx)}
                                className="p-1 text-stone-600 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-stone-600 mb-0.5 block">Sets</label>
                              <input
                                type="number"
                                min={1}
                                value={ex.target_sets}
                                onChange={(e) =>
                                  updateExercise(idx, 'target_sets', parseInt(e.target.value) || 1)
                                }
                                className="input-dark !py-1.5 text-sm text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-stone-600 mb-0.5 block">Reps</label>
                              <input
                                value={ex.target_reps}
                                onChange={(e) => updateExercise(idx, 'target_reps', e.target.value)}
                                placeholder="8-12"
                                className="input-dark !py-1.5 text-sm text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-stone-600 mb-0.5 block">RPE</label>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={ex.target_rpe || ''}
                                onChange={(e) =>
                                  updateExercise(
                                    idx,
                                    'target_rpe',
                                    e.target.value ? parseInt(e.target.value) : undefined
                                  )
                                }
                                placeholder="-"
                                className="input-dark !py-1.5 text-sm text-center"
                              />
                            </div>
                          </div>
                          <input
                            value={ex.notes || ''}
                            onChange={(e) => updateExercise(idx, 'notes', e.target.value)}
                            placeholder="Notes (optional)"
                            className="input-dark !py-1.5 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Exercise search */}
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600"
                        />
                        <input
                          value={exerciseQuery}
                          onChange={(e) => searchExercises(e.target.value)}
                          placeholder="Search exercises to add..."
                          className="input-dark !pl-9 text-sm"
                        />
                      </div>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 z-10 glass-elevated max-h-48 overflow-y-auto rounded-xl">
                        {searchResults.map((ex) => (
                          <button
                            key={ex.id}
                            onClick={() => addExerciseToForm(ex)}
                            className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0"
                          >
                            <Dumbbell size={14} className="text-stone-600 shrink-0" />
                            <div>
                              <div className="text-sm text-stone-200">{ex.name}</div>
                              <div className="text-[10px] text-stone-500 capitalize">
                                {muscleLabels[ex.muscle_group] || ex.muscle_group}
                                {ex.equipment && ` \u00B7 ${ex.equipment}`}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Shared toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                  <div>
                    <span className="text-sm text-stone-200">Share with clients</span>
                    <p className="text-[10px] text-stone-600 mt-0.5">
                      Visible to assigned clients
                    </p>
                  </div>
                  <button
                    onClick={() => setFormShared(!formShared)}
                    className={`w-11 h-6 rounded-full transition-all ${
                      formShared ? 'bg-[#D4A853]' : 'bg-stone-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        formShared ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Save */}
                <button
                  onClick={saveTemplate}
                  disabled={saving || !formName.trim()}
                  className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Create Template'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── Assign to Client Modal ─── */}
        {assigningTemplateId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated p-5 w-full max-w-md max-h-[70vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-100">Assign to Client</h3>
                <button
                  onClick={() => setAssigningTemplateId(null)}
                  className="text-stone-500 hover:text-stone-300"
                >
                  <X size={18} />
                </button>
              </div>
              {loadingClients ? (
                <p className="text-stone-500 text-sm text-center py-6">Loading clients...</p>
              ) : clients.length === 0 ? (
                <p className="text-stone-600 text-sm text-center py-6">
                  No clients assigned to you
                </p>
              ) : (
                <div className="space-y-2">
                  {clients.map((client) => (
                    <button
                      key={client.user_id}
                      onClick={() => assignToClient(client.user_id)}
                      className="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#D4A853]/10 flex items-center justify-center text-[#D4A853] text-sm font-semibold">
                        {client.profile?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-stone-200">
                          {client.profile?.full_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-stone-500">{client.profile?.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
