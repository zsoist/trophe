'use client';

/**
 * Exercise picker (full-screen) + custom-exercise modal — extracted from
 * app/dashboard/workout/page.tsx in the 10/10 wave.
 *
 * Structure: sticky search → selectable atlas + muscle groups → compact
 * resolver-backed results → persistent multi-add plan tray. Result details
 * remain separate from Add, and adding never enters a live-session state.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, ChevronDown, Dumbbell, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup } from '@/lib/types';
import type { AnatomyMuscleId, MuscleActivation } from '@/lib/workout/anatomy';
import {
  MUSCLE_GROUPS,
  WORKOUT_BODY_AREAS,
  bodyAreaLabelKey,
  muscleColor,
  muscleLabelKey,
  exerciseDisplayName,
  type WorkoutBodyArea,
} from './muscle-groups';
import { ExerciseResults } from './ExerciseResults';
import { MuscleAtlas } from './MuscleAtlas';
import { WorkoutPlanTray } from './WorkoutPlanTray';

const DISCOVERY_ATLAS_REGIONS: Array<Omit<MuscleActivation, 'label'>> = [
  { id: 'pectoralis-major', role: 'primary', view: 'front' },
  { id: 'anterior-deltoid', role: 'primary', view: 'front' },
  { id: 'biceps-brachii', role: 'primary', view: 'front' },
  { id: 'rectus-abdominis', role: 'primary', view: 'front' },
  { id: 'quadriceps', role: 'primary', view: 'front' },
  { id: 'latissimus-dorsi', role: 'primary', view: 'back' },
  { id: 'triceps-brachii', role: 'primary', view: 'back' },
  { id: 'gluteus-maximus', role: 'primary', view: 'back' },
  { id: 'hamstrings', role: 'primary', view: 'back' },
  { id: 'gastrocnemius', role: 'primary', view: 'back' },
];

const atlasMuscleLabelKey = (id: AnatomyMuscleId) => `workout.atlas_muscle_${id.replaceAll('-', '_')}`;

const DISCOVERY_AREA_BY_MUSCLE: Record<AnatomyMuscleId, WorkoutBodyArea> = {
  'pectoralis-major': 'chest',
  'serratus-anterior': 'chest',
  'anterior-deltoid': 'shoulders',
  'middle-deltoid': 'shoulders',
  'posterior-deltoid': 'shoulders',
  'rotator-cuff': 'shoulders',
  'upper-trapezius': 'back',
  'lower-trapezius': 'back',
  'latissimus-dorsi': 'back',
  rhomboids: 'back',
  'erector-spinae': 'back',
  'biceps-brachii': 'arms',
  'triceps-brachii': 'arms',
  brachialis: 'arms',
  'forearm-flexors': 'arms',
  'forearm-extensors': 'arms',
  'rectus-abdominis': 'core',
  obliques: 'core',
  'gluteus-maximus': 'legs',
  'gluteus-medius': 'legs',
  quadriceps: 'legs',
  hamstrings: 'legs',
  adductors: 'legs',
  gastrocnemius: 'legs',
  soleus: 'legs',
  'tibialis-anterior': 'legs',
};

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapFocus(event: ReactKeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); container.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function PickerFrame({
  presentation,
  pickerRef,
  reducedMotion,
  label,
  children,
}: {
  presentation: 'dialog' | 'page';
  pickerRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean | null;
  label: string;
  children: ReactNode;
}) {
  if (presentation === 'dialog') {
    return (
      <motion.div
        ref={pickerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={(event) => trapFocus(event, pickerRef.current)}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0 }}
        className="fixed inset-0 z-[var(--z-modal,60)] flex flex-col safe-bottom bg-[var(--canvas)] outline-none"
        style={{ isolation: 'isolate' }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={pickerRef}
      aria-label={label}
      tabIndex={-1}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="flex min-h-[calc(100dvh-8rem)] flex-col bg-[var(--canvas)] outline-none"
      style={{ isolation: 'isolate' }}
    >
      {children}
    </motion.div>
  );
}

// ─── Custom Exercise Modal ───
export function CustomExerciseModal({
  onSave,
  onClose,
}: {
  onSave: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('dumbbell');
  const [isCompound, setIsCompound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment,
        is_compound: isCompound,
        is_template: false,
        created_by: user.id,
      })
      .select()
      .maybeSingle();

    if (data && !error) {
      onSave(data as Exercise);
      onClose();
    } else {
      console.error('Error creating exercise:', error);
    }
    setSaving(false);
  };

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-center justify-center px-4"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('workout.custom_title')}
        tabIndex={-1}
        onKeyDown={(event) => trapFocus(event, dialogRef.current)}
        initial={reducedMotion ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reducedMotion ? undefined : { scale: 0.9, opacity: 0 }}
        className="glass-elevated safe-bottom p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] w-full max-w-sm outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Dumbbell size={20} className="gold-text" />
          <h3 className="text-lg font-semibold">{t('workout.custom_title')}</h3>
        </div>

        <input
          ref={nameInputRef}
          type="text"
          placeholder={t('workout.custom_name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-dark mb-3 text-base"
        />

        <div className="mb-3">
          <label className="text-sm text-[var(--content-secondary)] mb-1 block">{t('workout.custom_muscle')}</label>
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
            className="input-dark w-full text-base"
          >
            {MUSCLE_GROUPS.map((mg) => (
              <option key={mg.key} value={mg.key}>{t(muscleLabelKey(mg.key))}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="text-sm text-[var(--content-secondary)] mb-1 block">{t('workout.custom_equipment')}</label>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="input-dark w-full text-base"
          >
            {['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'kettlebell'].map((eq) => (
              <option key={eq} value={eq}>{eq.charAt(0).toUpperCase() + eq.slice(1)}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={isCompound}
            onChange={(e) => setIsCompound(e.target.checked)}
            className="rounded border-[var(--border-default)]"
          />
          <span className="text-sm text-[var(--content-secondary)]">{t('workout.custom_compound')}</span>
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {t('workout.custom_cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-gold flex-1 text-sm py-2 font-semibold min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {saving ? t('workout.custom_saving') : t('workout.custom_create')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EquipmentFilter({
  value,
  options,
  onChange,
  label,
  allLabel,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label: string;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value === 'all'
    ? allLabel
    : value.charAt(0).toUpperCase() + value.slice(1);

  return (
    <div className="equipment-filter">
      <span className="equipment-filter__label">{label}</span>
      <div className="equipment-filter__control">
        <button
          type="button"
          aria-label={`${label}, ${selectedLabel}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="equipment-filter__trigger"
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {open ? (
          <div role="listbox" aria-label={label} className="equipment-filter__menu">
            {['all', ...options].map((option) => {
              const optionLabel = option === 'all'
                ? allLabel
                : option.charAt(0).toUpperCase() + option.slice(1);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option}
                  key={option}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <span>{optionLabel}</span>
                  {value === option ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Exercise Picker ───
export default function ExercisePicker({
  exercises,
  recentIds,
  onSelect,
  onClose,
  lang,
  onCustomCreated,
  onInfo,
  presetMuscles,
  presentation = 'dialog',
  onAddToDraft,
  onReturnToBuild,
  addedExerciseIds = [],
}: {
  exercises: Exercise[];
  recentIds: string[];
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  lang: string;
  onCustomCreated?: (ex: Exercise) => void;
  onInfo?: (ex: Exercise) => void;
  /** Split quick-start: limit browsing to these muscle groups (user can still search or tap All). */
  presetMuscles?: MuscleGroup[] | null;
  presentation?: 'dialog' | 'page';
  onAddToDraft?: (exerciseId: string) => void;
  onReturnToBuild?: () => void;
  addedExerciseIds?: string[];
}) {
  const [search, setSearch] = useState('');
  const [selectedAreaKey, setSelectedAreaKey] = useState<WorkoutBodyArea | null>(null);
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | 'all'>('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [optimisticAddedIds, setOptimisticAddedIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const firstAreaRef = useRef<HTMLButtonElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const showCustomModalRef = useRef(showCustomModal);
  const reducedMotion = useReducedMotion();
  const canUseDom = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { t } = useI18n();
  const discoveryAtlasActivations = DISCOVERY_ATLAS_REGIONS.map((activation) => ({
    ...activation,
    label: t(atlasMuscleLabelKey(activation.id)),
  }));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    showCustomModalRef.current = showCustomModal;
  }, [showCustomModal]);

  useEffect(() => {
    if (presentation !== 'dialog') return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showCustomModalRef.current) onCloseRef.current();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [presentation]);

  useEffect(() => {
    if (!canUseDom) return;
    const frame = requestAnimationFrame(() => firstAreaRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [canUseDom]);

  const nameOf = (ex: Exercise) => exerciseDisplayName(ex, lang);
  const addedIds = new Set([...addedExerciseIds, ...optimisticAddedIds]);

  const q = search.trim().toLowerCase();
  const selectedArea = WORKOUT_BODY_AREAS.find((area) => area.key === selectedAreaKey) ?? null;
  const isLanding = q === '' && selectedArea === null;
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));
  const matchesSearch = (ex: Exercise) => [
    nameOf(ex),
    ex.name,
    ex.name_es,
    ex.name_el,
    ex.equipment,
  ].some((value) => value?.toLowerCase().includes(q));

  const areaPool = q !== ''
    ? exercises.filter(matchesSearch)
    : selectedArea
      ? exercises.filter((ex) => selectedArea.muscles.includes(ex.muscle_group))
      : [];
  const musclePool = filterMuscle === 'all'
    ? areaPool
    : areaPool.filter((ex) => ex.muscle_group === filterMuscle);
  const equipmentOptions = Array.from(new Set(musclePool.map((ex) => ex.equipment).filter((value): value is string => Boolean(value)))).sort();
  const filtered = musclePool
    .filter((ex) => equipmentFilter === 'all' || ex.equipment === equipmentFilter)
    .sort((a, b) => {
      if (q) {
        const aStarts = nameOf(a).toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = nameOf(b).toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      const aRecent = recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRecent = recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aRecent !== bRecent) return aRecent - bRecent;
      if (a.is_compound !== b.is_compound) return a.is_compound ? -1 : 1;
      return nameOf(a).localeCompare(nameOf(b));
    });

  const pick = (ex: Exercise) => {
    if (addedIds.has(ex.id)) return;
    if (presentation === 'page' && onAddToDraft) {
      setOptimisticAddedIds((current) => new Set(current).add(ex.id));
      onAddToDraft(ex.id);
      return;
    }
    onSelect(ex);
    onClose();
  };

  const preset = presetMuscles && presetMuscles.length > 0 ? new Set<MuscleGroup>(presetMuscles) : null;
  const recentExercises = isLanding
    ? recentIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => Boolean(e))
        .filter((e) => !preset || preset.has(e.muscle_group))
        .slice(0, 6)
    : [];
  const orderedAreas = [...WORKOUT_BODY_AREAS].sort((a, b) => {
    if (!preset) return 0;
    const aSuggested = a.muscles.some((muscle) => preset.has(muscle));
    const bSuggested = b.muscles.some((muscle) => preset.has(muscle));
    return Number(bSuggested) - Number(aSuggested);
  });

  const chooseArea = (area: WorkoutBodyArea) => {
    setSelectedAreaKey(area);
    setFilterMuscle('all');
    setEquipmentFilter('all');
    requestAnimationFrame(() => resultHeadingRef.current?.focus({ preventScroll: true }));
  };

  const returnToAreas = () => {
    setSelectedAreaKey(null);
    setFilterMuscle('all');
    setEquipmentFilter('all');
    requestAnimationFrame(() => firstAreaRef.current?.focus({ preventScroll: true }));
  };

  const selectedExercises = Array.from(addedIds)
    .map((id) => exercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const showPlanTray = presentation === 'page'
    && Boolean(onAddToDraft)
    && Boolean(onReturnToBuild)
    && addedIds.size > 0;
  const scrollPadding = showPlanTray
    ? 'calc(var(--workout-plan-tray-reserve, 8rem) + var(--client-shell-nav-base-height, 4.5rem) + max(env(safe-area-inset-bottom, 0px), var(--client-shell-nav-min-bottom-padding, 1rem)) + var(--client-shell-content-buffer, 0.625rem))'
    : 'calc(7rem + env(safe-area-inset-bottom, 0px))';

  if (!canUseDom) return null;

  const picker = (
    <PickerFrame
      presentation={presentation}
      pickerRef={pickerRef}
      reducedMotion={reducedMotion}
      label={t('workout.add_exercise')}
    >
      <div className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-overlay)]/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <button onClick={onClose} aria-label={t('workout.picker_close')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--action-secondary)] text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none">
              <X size={20} style={{ color: 'var(--content-secondary)' }} />
            </button>
            <h2 className="text-base font-semibold text-[var(--content-primary)]">{t('workout.picker_title')}</h2>
          </div>
          <div className="relative mt-3">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-muted)]" />
            <input
              ref={inputRef}
              type="search"
              aria-label={t('workout.search_exercises')}
              placeholder={t('workout.search_exercises')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setEquipmentFilter('all');
              }}
              className="input-dark min-h-12 pl-10 pr-11 text-base"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setEquipmentFilter('all');
                  inputRef.current?.focus();
                }}
                aria-label={t('workout.picker_clear_search')}
                className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--content-muted)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          data-exercise-picker-scroll-content
          className="mx-auto w-full max-w-3xl px-4 pt-6"
          style={{ paddingBottom: scrollPadding }}
        >
          {isLanding ? (
            <>
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--content-primary)] sm:text-3xl">
                  {t('workout.picker_choose_area')}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--content-secondary)]">
                  {t('workout.picker_choose_area_hint')}
                </p>
              </div>

              <div className="mt-5 rounded-[0.875rem] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
                <MuscleAtlas
                  compact
                  homeCompact
                  activations={discoveryAtlasActivations}
                  selected={null}
                  onSelect={(muscle) => chooseArea(DISCOVERY_AREA_BY_MUSCLE[muscle])}
                />
              </div>

              <div role="group" aria-label={t('workout.picker_choose_area')} className="mt-3 flex flex-wrap gap-2">
                {orderedAreas.map((area, index) => {
                  const count = exercises.filter((ex) => area.muscles.includes(ex.muscle_group)).length;
                  const label = t(bodyAreaLabelKey(area.key));
                  return (
                    <button
                      key={area.key}
                      ref={index === 0 ? firstAreaRef : undefined}
                      type="button"
                      onClick={() => chooseArea(area.key)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm font-semibold text-[var(--content-secondary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                    >
                      <span>{label}</span>
                      <span className="font-mono text-xs tabular-nums text-[var(--content-muted)]">{t('workout.picker_options', { n: count })}</span>
                    </button>
                  );
                })}
              </div>

              {recentExercises.length > 0 && (
                <section aria-label={t('workout.picker_recent')} className="mt-8">
                  <h2 className="text-sm font-semibold text-[var(--content-secondary)]">{t('workout.picker_recent')}</h2>
                  <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
                    {recentExercises.map((ex) => {
                      const name = nameOf(ex);
                      const isAdded = addedIds.has(ex.id);
                      return (
                        <button
                          key={ex.id}
                          onClick={() => pick(ex)}
                          disabled={isAdded}
                          aria-label={isAdded ? t('workout.exercise_added_named', { name }) : t('workout.picker_add_named', { name })}
                          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm font-medium text-[var(--content-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none"
                        >
                          {isAdded
                            ? <Check size={15} aria-hidden="true" />
                            : <span className="h-2 w-2 rounded-full" style={{ background: muscleColor(ex.muscle_group) }} />}
                          {name}
                          {isAdded ? <span>{t('workout.exercise_added')}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {selectedArea && !q && (
                  <button
                    type="button"
                    onClick={returnToAreas}
                    aria-label={t('workout.picker_back_areas')}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div className="min-w-0 flex-1 pt-1.5">
                  <h1
                    ref={resultHeadingRef}
                    tabIndex={-1}
                    className="text-xl font-semibold tracking-[-0.02em] text-[var(--content-primary)] outline-none sm:text-2xl"
                  >
                    {q
                      ? t('workout.picker_search_results')
                      : t('workout.picker_result_title', { area: t(bodyAreaLabelKey(selectedArea!.key)) })}
                  </h1>
                  <p aria-live="polite" className="mt-1 text-sm tabular-nums text-[var(--content-muted)]">
                    {t('workout.picker_result_count', { n: filtered.length })}
                  </p>
                </div>
              </div>

              {selectedArea && !q && selectedArea.muscles.length > 1 && (
                <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide" role="group" aria-label={t('workout.picker_muscle_filter')}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMuscle('all');
                      setEquipmentFilter('all');
                    }}
                    aria-pressed={filterMuscle === 'all'}
                    className="min-h-11 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                    style={{
                      background: filterMuscle === 'all' ? 'color-mix(in srgb, var(--action-primary) 14%, transparent)' : 'var(--surface-1)',
                      borderColor: filterMuscle === 'all' ? 'var(--border-focus)' : 'var(--border-subtle)',
                      color: filterMuscle === 'all' ? 'var(--action-primary)' : 'var(--content-secondary)',
                    }}
                  >
                    {t('workout.picker_all_area', { area: t(bodyAreaLabelKey(selectedArea.key)) })}
                  </button>
                  {selectedArea.muscles.map((muscle) => (
                    <button
                      key={muscle}
                      type="button"
                      onClick={() => {
                        setFilterMuscle(muscle);
                        setEquipmentFilter('all');
                      }}
                      aria-pressed={filterMuscle === muscle}
                      className="min-h-11 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
                      style={{
                        background: filterMuscle === muscle ? 'color-mix(in srgb, var(--action-primary) 14%, transparent)' : 'var(--surface-1)',
                        borderColor: filterMuscle === muscle ? 'var(--border-focus)' : 'var(--border-subtle)',
                        color: filterMuscle === muscle ? 'var(--action-primary)' : 'var(--content-secondary)',
                      }}
                    >
                      {t(muscleLabelKey(muscle))}
                    </button>
                  ))}
                </div>
              )}

              {equipmentOptions.length > 1 && (
                <EquipmentFilter
                  value={equipmentFilter}
                  options={equipmentOptions}
                  onChange={setEquipmentFilter}
                  label={t('workout.picker_equipment')}
                  allLabel={t('workout.picker_all_equipment')}
                />
              )}

              {filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <Dumbbell size={28} className="mx-auto text-[var(--content-muted)]" />
                  <p className="mt-3 text-sm font-medium text-[var(--content-secondary)]">{t('workout.picker_none')}</p>
                  <p className="mt-1 text-sm text-[var(--content-muted)]">{t('workout.picker_none_hint')}</p>
                </div>
              ) : (
                <ExerciseResults
                  exercises={filtered}
                  lang={lang}
                  selectedIds={addedIds}
                  onAdd={pick}
                  onInfo={onInfo}
                />
              )}
            </>
          )}

          <button
            onClick={() => setShowCustomModal(true)}
            aria-label={t('workout.picker_custom')}
            className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-default)] bg-transparent px-4 text-sm font-semibold text-[var(--action-primary)] transition-colors hover:border-[var(--border-focus)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
          >
            <Plus size={16} />
            <span><span className="font-normal text-[var(--content-muted)]">{t('workout.picker_custom_hint')} </span>{t('workout.picker_custom')}</span>
          </button>
        </div>
      </div>

      {showPlanTray && onReturnToBuild ? (
        <WorkoutPlanTray
          exercises={selectedExercises}
          selectedCount={addedIds.size}
          lang={lang}
          onReview={onReturnToBuild}
        />
      ) : null}

      {/* Custom exercise modal */}
      <AnimatePresence>
        {showCustomModal && (
          <CustomExerciseModal
            onSave={(ex) => {
              if (onCustomCreated) onCustomCreated(ex);
              pick(ex);
            }}
            onClose={() => setShowCustomModal(false)}
          />
        )}
      </AnimatePresence>
    </PickerFrame>
  );

  return presentation === 'dialog' ? createPortal(picker, document.body) : picker;
}
