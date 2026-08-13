'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
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
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { trpc } from '@/lib/trpc/client';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/shared/Toast';
import type {
  WorkoutTemplate,
  TemplateExercise,
  Exercise,
  Profile,
  ClientProfile,
  MuscleGroup,
} from '@/lib/types';
import { CoachNav } from '@/components/coach/CoachNav';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import { useDialogFocus } from '@/components/shared/useDialogFocus';
import ProgramBuilder, { type BuilderClient } from '@/components/coach/ProgramBuilder';
import { BotNav } from '@/components/ui/BotNav';
import { Icon, ConfirmSheet } from '@/components/ui';

/* All four tabs point at real routes (were /coach/clients + /coach/profile 404s) */
const COACH_NAV = [
  { href: '/coach',           label: 'Today',    icon: <Icon name="i-grid"     size={18} /> },
  { href: '/coach/inbox',     label: 'Inbox',    icon: <Icon name="i-message"  size={18} /> },
  { href: '/coach/calendar',  label: 'Calendar', icon: <Icon name="i-calendar" size={18} /> },
  { href: '/coach/templates', label: 'Workouts', icon: <Icon name="i-dumbbell" size={18} /> },
];

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

/**
 * useSearchParams() requires a Suspense boundary for static prerender —
 * without it `next build` fails on this route (CSR bailout). The ?client=
 * deep-link from the client-detail Workouts panel is read inside the inner
 * component, so the boundary wraps the whole page.
 */
export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <TemplatesPageInner />
    </Suspense>
  );
}

function TemplatesPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Exercise search
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);

  // Form state (create + edit share the same modal)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDayLabel, setFormDayLabel] = useState('');
  const [formDifficulty, setFormDifficulty] = useState('intermediate');
  const [formTargetMuscles, setFormTargetMuscles] = useState<string[]>([]);
  const [formExercises, setFormExercises] = useState<(TemplateExercise & { _name?: string })[]>([]);
  const [formShared, setFormShared] = useState(false);
  const [saving, setSaving] = useState(false);

  // tRPC: template edit (the CRUD gap — create/delete existed, edit didn't)
  const updateTemplate = trpc.workouts.templates.update.useMutation();

  // Program Builder (real assignment — replaces the fake current_template_id write)
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderInitialClient, setBuilderInitialClient] = useState<string | null>(null);
  const [clients, setClients] = useState<BuilderClient[]>([]);
  const formDialogRef = useRef<HTMLDivElement | null>(null);
  const builderDialogRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  useDialogFocus(showForm, () => { setShowForm(false); resetForm(); }, formDialogRef);
  useDialogFocus(showBuilder, () => { setShowBuilder(false); setBuilderInitialClient(null); }, builderDialogRef);

  const loadClients = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: clientProfiles } = await supabase
      .from('client_profiles')
      .select('user_id')
      .eq('coach_id', user.id);
    const userIds = ((clientProfiles ?? []) as Array<Pick<ClientProfile, 'user_id'>>).map((cp) => cp.user_id);
    if (userIds.length === 0) { setClients([]); return; }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    setClients(
      ((profiles ?? []) as Array<Pick<Profile, 'id' | 'full_name' | 'email'>>).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || 'Unnamed client',
        email: p.email,
      })),
    );
  }, []);

  const loadTemplates = useCallback(async () => {
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
  }, []);

  const loadExerciseLibrary = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('exercises')
        .select('*')
        .order('name');

      setExerciseLibrary(data || []);
    } catch (err) {
      console.error('Error loading exercises:', err);
    }
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      // Role guard — only coaches can access
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role === 'client') { router.push('/dashboard'); return; }
      loadTemplates();
      loadExerciseLibrary();
      loadClients();
    }
    checkAuth();
  }, [router, loadClients, loadTemplates, loadExerciseLibrary]);

  // ?client=<uuid> deep link (from the client-detail Workouts panel):
  // preselect that client and open the Program Builder.
  useEffect(() => {
    const preselect = searchParams.get('client');
    if (preselect && !loading) {
      setBuilderInitialClient(preselect);
      setShowBuilder(true);
    }
  }, [searchParams, loading]);

  function resetForm() {
    setEditingTemplateId(null);
    setFormName('');
    setFormDesc('');
    setFormDayLabel('');
    setFormDifficulty('intermediate');
    setFormTargetMuscles([]);
    setFormExercises([]);
    setFormShared(false);
  }

  /** Reuse the create modal prefilled with an existing template (Task 4.1). */
  function openEdit(template: WorkoutTemplate) {
    setEditingTemplateId(template.id);
    setFormName(template.name);
    setFormDesc(template.description || '');
    setFormDayLabel(template.day_label || '');
    setFormDifficulty(template.difficulty || 'intermediate');
    setFormTargetMuscles(template.target_muscles || []);
    setFormExercises(
      (template.exercises || []).map((ex) => ({
        ...ex,
        _name: exerciseLibrary.find((e) => e.id === ex.exercise_id)?.name,
      })),
    );
    setFormShared(Boolean(template.shared));
    setShowForm(true);
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

  // ── Save (create via supabase insert, edit via tRPC workouts.templates.update) ──

  async function saveTemplate() {
    if (!formName.trim() || saving) return;
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

      if (editingTemplateId) {
        // EDIT — server-side validation + creator-only guard live in the router.
        if (exercisesForDB.length === 0) {
          toast.error(t('coach.templates.addExercise'));
          return;
        }
        try {
          const updated = await updateTemplate.mutateAsync({
            templateId: editingTemplateId,
            name: formName.trim(),
            description: formDesc.trim() || null,
            dayLabel: formDayLabel.trim() || null,
            difficulty: formDifficulty as 'beginner' | 'intermediate' | 'advanced',
            targetMuscles: formTargetMuscles,
            exercises: exercisesForDB.map((e) => ({
              exercise_id: e.exercise_id,
              target_sets: e.target_sets,
              target_reps: e.target_reps,
              target_rpe: e.target_rpe ?? undefined,
              notes: e.notes || undefined,
            })),
            shared: formShared,
          });
          setTemplates(
            templates.map((t) =>
              t.id === editingTemplateId
                ? {
                    ...t,
                    name: updated?.name ?? formName.trim(),
                    description: updated?.description ?? (formDesc.trim() || null),
                    day_label: updated?.dayLabel ?? (formDayLabel.trim() || null),
                    difficulty: (updated?.difficulty ?? formDifficulty) as WorkoutTemplate['difficulty'],
                    target_muscles: (updated?.targetMuscles ?? formTargetMuscles) as WorkoutTemplate['target_muscles'],
                    exercises: (updated?.exercises ?? exercisesForDB) as TemplateExercise[],
                    shared: updated?.shared ?? formShared,
                  }
                : t,
            ),
          );
          setShowForm(false);
          resetForm();
          toast.success(t('coach.templates.updatedToast'));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t('coach.templates.updateFailedToast'));
        }
        return;
      }

      const { data, error } = await supabase
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
      } else if (error) {
        console.error('Error saving template:', error);
        toast.error(t('coach.templates.createFailedToast'));
      }
    } catch (err) {
      console.error('Error saving template:', err);
      toast.error(t('coach.templates.saveFailedToast'));
    } finally {
      setSaving(false);
    }
  }

  function deleteTemplate(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDeleteTemplate() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await supabase.from('workout_templates').delete().eq('id', pendingDeleteId);
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDeleteId));
    } catch (err) {
      console.error('Error deleting template:', err);
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  // ── Program Builder entry (replaces the fake current_template_id write) ──

  function openBuilder(initialClient: string | null = null) {
    setBuilderInitialClient(initialClient);
    setShowBuilder(true);
  }

  const builderTemplates = templates.map((t) => ({
    id: t.id,
    name: t.name,
    exerciseCount: (t.exercises || []).length,
  }));

  // ── Render ──

  return (
    <div data-coach-mobile-workspace className="min-h-screen min-w-0 pb-20 px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/templates" />

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--content-primary)]">
                Workout Templates
              </h1>
              <p className="text-[var(--content-secondary)] text-sm mt-1">
                {templates.length} template{templates.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> New Template
            </button>
          </div>

          {/* Template List */}
          {loading ? (
            <CoachLoadingSkeletons page="templates" />
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <LayoutTemplate size={48} className="mx-auto text-[var(--content-muted)] mb-4" />
              <p className="text-[var(--content-secondary)]">No templates created yet</p>
              <p className="text-[var(--content-muted)] text-sm mt-1">
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
                      <Dumbbell size={18} className="text-[var(--action-primary)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[var(--content-primary)]">{template.name}</h3>
                          {template.day_label && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-active)] text-[var(--action-primary)] font-medium">
                              {template.day_label}
                            </span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border font-bold ${
                              difficultyColors[template.difficulty] || difficultyColors.intermediate
                            }`}
                          >
                            {template.difficulty}
                          </span>
                        </div>
                        {template.description && (
                          <p className="text-xs text-[var(--content-secondary)] mt-0.5 truncate">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--content-secondary)]">
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
                            openEdit(template);
                          }}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--content-secondary)] hover:text-[var(--action-primary)] transition-colors"
                          title={t('coach.templates.edit')}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openBuilder();
                          }}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--content-secondary)] hover:text-[var(--action-primary)] transition-colors"
                          title={t('coach.templates.assignToProgram')}
                        >
                          <UserPlus size={15} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTemplate(template.id);
                          }}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-red-500/10 text-[var(--content-secondary)] hover:text-red-400 transition-colors"
                          title={t('coach.templates.delete')}
                        >
                          <Trash2 size={15} />
                        </button>
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-[var(--content-secondary)]" />
                        ) : (
                          <ChevronDown size={16} className="text-[var(--content-secondary)]" />
                        )}
                      </div>
                    </div>

                    {/* Expanded exercise list */}
                    {isExpanded && exercises.length > 0 && (
                      <div className="px-4 sm:px-5 pb-4 border-t border-[var(--border-subtle)]">
                        <div className="mt-3 space-y-2">
                          {exercises.map((ex, ei) => {
                            const exInfo = exerciseLibrary.find(
                              (e) => e.id === ex.exercise_id
                            );
                            return (
                              <div
                                key={ei}
                                className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-2)]"
                              >
                                <span className="text-xs text-[var(--content-muted)] w-5 text-center font-mono">
                                  {ei + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-[var(--content-primary)]">
                                    {exInfo?.name || ex.exercise_id}
                                  </span>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--content-secondary)]">
                                    <span>{ex.target_sets} sets</span>
                                    <span>{ex.target_reps} reps</span>
                                    {ex.target_rpe && <span>RPE {ex.target_rpe}</span>}
                                    {ex.notes && (
                                      <span className="text-[var(--content-muted)] truncate">{ex.notes}</span>
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
          {/* ═══ Client Programs — pick a client, see + edit their ACTIVE program ═══ */}
          {!loading && templates.length > 0 && (
            <div className="mt-8 glass p-5">
              <ProgramBuilder
                clients={clients}
                templates={builderTemplates}
              />
            </div>
          )}
        </motion.div>

        <BotNav routes={COACH_NAV} />

        <ConfirmSheet
          open={pendingDeleteId !== null}
          title={t('confirm.delete_template_title')}
          message={t('confirm.delete_template_msg')}
          confirmLabel={t('confirm.delete')}
          danger
          loading={deleting}
          onConfirm={confirmDeleteTemplate}
          onCancel={() => setPendingDeleteId(null)}
        />

        {/* ─── Create Template Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4">
            <motion.div
              ref={formDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="template-dialog-title"
              initial={reducedMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated safe-bottom p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 id="template-dialog-title" className="font-semibold text-[var(--content-primary)] text-lg">
                  {editingTemplateId ? t('coach.templates.editTitle') : 'New Template'}
                </h3>
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  aria-label="Close template editor"
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-[var(--content-secondary)] mb-1 block">Template Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Upper Body Hypertrophy"
                    className="text-base input-dark"
                  />
                </div>

                {/* Description + Day Label */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Description</label>
                    <input
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Brief description"
                      className="text-base input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Day Label</label>
                    <input
                      value={formDayLabel}
                      onChange={(e) => setFormDayLabel(e.target.value)}
                      placeholder="e.g. Push A"
                      className="text-base input-dark"
                    />
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <label className="text-xs text-[var(--content-secondary)] mb-1 block">Difficulty</label>
                  <div className="flex gap-2">
                    {difficultyOptions.map((d) => (
                      <button
                        key={d}
                        onClick={() => setFormDifficulty(d)}
                        className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                          formDifficulty === d
                            ? difficultyColors[d]
                            : 'border-[var(--border-subtle)] text-[var(--content-secondary)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Muscles */}
                <div>
                  <label className="text-xs text-[var(--content-secondary)] mb-2 block">Target Muscles</label>
                  <div className="flex flex-wrap gap-1.5">
                    {muscleOptions.map((m) => (
                      <button
                        key={m}
                        onClick={() => toggleMuscle(m)}
                        className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          formTargetMuscles.includes(m)
                            ? 'bg-[var(--surface-active)] text-[var(--action-primary)] border border-[var(--action-primary)]'
                            : 'bg-[var(--surface-2)] text-[var(--content-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--surface-2)]'
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
                    <label className="text-xs text-[var(--content-secondary)]">
                      Exercises ({formExercises.length})
                    </label>
                  </div>

                  {formExercises.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {formExercises.map((ex, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[var(--surface-2)] space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical size={14} className="text-[var(--content-muted)] shrink-0" />
                            <span className="text-sm font-medium text-[var(--content-primary)] flex-1 truncate">
                              {ex._name || ex.exercise_id}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => moveExercise(idx, 'up')}
                                aria-label={`Move ${ex._name || 'exercise'} up`}
                                disabled={idx === 0}
                                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1 text-[var(--content-muted)] hover:text-[var(--content-primary)] disabled:opacity-20 transition-colors"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                onClick={() => moveExercise(idx, 'down')}
                                aria-label={`Move ${ex._name || 'exercise'} down`}
                                disabled={idx === formExercises.length - 1}
                                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1 text-[var(--content-muted)] hover:text-[var(--content-primary)] disabled:opacity-20 transition-colors"
                              >
                                <ArrowDown size={12} />
                              </button>
                              <button
                                onClick={() => removeExercise(idx)}
                                aria-label={`Remove ${ex._name || 'exercise'}`}
                                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1 text-[var(--content-muted)] hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-[var(--content-muted)] mb-0.5 block">Sets</label>
                              <input
                                type="number"
                                min={1}
                                value={ex.target_sets}
                                onChange={(e) =>
                                  updateExercise(idx, 'target_sets', parseInt(e.target.value) || 1)
                                }
                                className="input-dark !py-1.5 text-base text-center"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-[var(--content-muted)] mb-0.5 block">Reps</label>
                              <input
                                value={ex.target_reps}
                                onChange={(e) => updateExercise(idx, 'target_reps', e.target.value)}
                                placeholder="8-12"
                                className="input-dark !py-1.5 text-base text-center"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-[var(--content-muted)] mb-0.5 block">RPE</label>
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
                                className="input-dark !py-1.5 text-base text-center"
                              />
                            </div>
                          </div>
                          <input
                            value={ex.notes || ''}
                            onChange={(e) => updateExercise(idx, 'notes', e.target.value)}
                            placeholder="Notes (optional)"
                            className="input-dark !py-1.5 text-base"
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
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-muted)]"
                        />
                        <input
                          value={exerciseQuery}
                          onChange={(e) => searchExercises(e.target.value)}
                          placeholder="Search exercises to add..."
                          className="input-dark !pl-9 text-base"
                        />
                      </div>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 z-10 glass-elevated max-h-48 overflow-y-auto rounded-xl">
                        {searchResults.map((ex) => (
                          <button
                            key={ex.id}
                            onClick={() => addExerciseToForm(ex)}
                            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full text-left px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors flex items-center gap-3 border-b border-[var(--border-subtle)] last:border-0"
                          >
                            <Dumbbell size={14} className="text-[var(--content-muted)] shrink-0" />
                            <div>
                              <div className="text-sm text-[var(--content-primary)]">{ex.name}</div>
                              <div className="text-xs text-[var(--content-secondary)] capitalize">
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
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-2)]">
                  <div>
                    <span className="text-sm text-[var(--content-primary)]">Share with clients</span>
                    <p className="text-xs text-[var(--content-muted)] mt-0.5">
                      Visible to assigned clients
                    </p>
                  </div>
                  <button
                    onClick={() => setFormShared(!formShared)}
                    aria-label={formShared ? 'Stop sharing with clients' : 'Share with clients'}
                    className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-11 h-6 rounded-full transition-all ${
                      formShared ? 'bg-[var(--action-primary)]' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-[var(--surface-1)] shadow-sm transition-transform ${
                        formShared ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Save */}
                <button
                  onClick={saveTemplate}
                  disabled={saving || updateTemplate.isPending || !formName.trim()}
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={16} />
                  {saving || updateTemplate.isPending
                    ? 'Saving...'
                    : editingTemplateId
                    ? t('coach.templates.saveChanges')
                    : 'Create Template'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── Program Builder Modal (real assignment via trpc workouts.program.assign) ─── */}
        {showBuilder && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4">
            <motion.div
              ref={builderDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="program-builder-dialog-title"
              initial={reducedMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated safe-bottom p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="program-builder-dialog-title" className="font-semibold text-[var(--content-primary)]">{t('coach.builder.modalTitle')}</h3>
                <button
                  onClick={() => { setShowBuilder(false); setBuilderInitialClient(null); }}
                  aria-label="Close program builder"
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                >
                  <X size={18} />
                </button>
              </div>
              {clients.length === 0 ? (
                <p className="text-[var(--content-muted)] text-sm text-center py-6">
                  {t('coach.builder.noClients')}
                </p>
              ) : (
                <ProgramBuilder
                  clients={clients}
                  templates={builderTemplates}
                  initialClientId={builderInitialClient}
                  onAssigned={() => { setShowBuilder(false); setBuilderInitialClient(null); }}
                />
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
