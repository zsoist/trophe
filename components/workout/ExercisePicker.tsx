'use client';

/**
 * Exercise picker (full-screen) + custom-exercise modal — extracted from
 * app/dashboard/workout/page.tsx in the 10/10 wave.
 *
 * Structure: sticky search + muscle chips → Recent quick-add → sectioned list
 * (muscle headers, 2-col on desktop). Rows expose an info affordance that
 * opens the ExerciseInfoSheet (form cues, muscles, PR, recent history).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Dumbbell, Info, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup } from '@/lib/types';
import { MUSCLE_GROUPS, muscleColor, muscleLabelKey } from './muscle-groups';

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
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('dumbbell');
  const [isCompound, setIsCompound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
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
          type="text"
          placeholder={t('workout.custom_name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-dark mb-3 text-base"
          autoFocus
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

// ─── Exercise row ───
/** One dense, tappable exercise row — muscle dot + name + equipment meta + info. */
function ExerciseRow({
  ex,
  name,
  onPick,
  onInfo,
}: {
  ex: Exercise;
  name: string;
  onPick: () => void;
  onInfo?: (ex: Exercise) => void;
}) {
  const color = muscleColor(ex.muscle_group);
  const { t } = useI18n();
  const meta = [
    ex.equipment ? ex.equipment.charAt(0).toUpperCase() + ex.equipment.slice(1) : null,
    ex.is_compound ? t('workout.compound') : null,
  ].filter(Boolean).join(' · ');
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
      style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
    >
      <button onClick={onPick} className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--content-primary)' }}>{name}</span>
          {meta && <span className="block text-xs truncate" style={{ color: 'var(--content-muted)' }}>{meta}</span>}
        </span>
      </button>
      {onInfo && (
        <button
          onClick={() => onInfo(ex)}
          aria-label={t('workout.info_title')}
          className="p-1.5 rounded-lg shrink-0 transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          style={{ color: 'var(--content-muted)' }}
        >
          <Info size={15} />
        </button>
      )}
      <button onClick={onPick} aria-label={t('workout.add_exercise')} className="shrink-0 p-1 min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <Plus size={16} style={{ color: 'var(--content-muted)' }} />
      </button>
    </motion.div>
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
}: {
  exercises: Exercise[];
  recentIds: string[];
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  lang: string;
  onCustomCreated?: (ex: Exercise) => void;
  onInfo?: (ex: Exercise) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | 'all'>('all');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const reducedMotion = useReducedMotion();
  const canUseDom = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { t } = useI18n();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showCustomModal) onCloseRef.current();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [showCustomModal]);

  useEffect(() => {
    if (canUseDom) inputRef.current?.focus();
  }, [canUseDom]);

  const nameOf = (ex: Exercise) =>
    lang === 'es' && ex.name_es ? ex.name_es : lang === 'el' && ex.name_el ? ex.name_el : ex.name;

  const q = search.trim().toLowerCase();
  const browsing = q === '' && filterMuscle === 'all';

  const filtered = exercises.filter((ex) => {
    const matchesSearch = q === '' || nameOf(ex).toLowerCase().includes(q) || (ex.equipment ?? '').toLowerCase().includes(q);
    const matchesMuscle = filterMuscle === 'all' || ex.muscle_group === filterMuscle;
    return matchesSearch && matchesMuscle;
  });

  const pick = (ex: Exercise) => { onSelect(ex); onClose(); };

  // Recent quick-add — only while browsing (no search, no muscle filter).
  const recentExercises = browsing
    ? recentIds.map((id) => exercises.find((e) => e.id === id)).filter((e): e is Exercise => Boolean(e)).slice(0, 8)
    : [];

  // Sectioned by muscle group (in canonical order) so the list reads as
  // structure, not an undifferentiated scroll. Flat when searching/filtering.
  const sections = browsing
    ? MUSCLE_GROUPS.map((mg) => ({ mg, items: filtered.filter((e) => e.muscle_group === mg.key) })).filter((s) => s.items.length > 0)
    : [{ mg: null as (typeof MUSCLE_GROUPS)[number] | null, items: filtered }];

  if (!canUseDom) return null;

  return createPortal(
    <motion.div
      ref={pickerRef}
      tabIndex={-1}
      onKeyDown={(event) => trapFocus(event, pickerRef.current)}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('workout.add_exercise')}
      className="fixed inset-0 z-[var(--z-modal,60)] flex flex-col safe-bottom pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none"
      style={{ background: 'var(--canvas)', isolation: 'isolate' }}
    >
      {/* Sticky header: close · search · live count */}
      <div className="sticky top-0 z-10 glass-elevated">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <button onClick={onClose} aria-label={t('workout.custom_cancel')} className="p-2 rounded-xl transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)' }}>
              <X size={20} style={{ color: 'var(--content-secondary)' }} />
            </button>
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--content-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder={t('workout.search_exercises')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-dark pl-10 text-base"
              />
            </div>
          </div>

          {/* Muscle filter chips */}
          <div className="mt-2.5 -mx-1 px-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterMuscle('all')}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                style={{
                  background: filterMuscle === 'all' ? 'color-mix(in srgb, var(--action-primary) 20%, transparent)' : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                  color: filterMuscle === 'all' ? 'var(--action-primary)' : 'var(--content-secondary)',
                  border: filterMuscle === 'all' ? '1px solid color-mix(in srgb, var(--action-primary) 32%, transparent)' : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                }}
              >
                {t('workout.all')}
              </button>
              {MUSCLE_GROUPS.map((mg) => (
                <button
                  key={mg.key}
                  onClick={() => setFilterMuscle(filterMuscle === mg.key ? 'all' : mg.key)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  style={{
                    background: filterMuscle === mg.key ? `${mg.color}22` : 'color-mix(in srgb, var(--content-primary) 8%, transparent)',
                    color: filterMuscle === mg.key ? mg.color : 'var(--content-secondary)',
                    border: filterMuscle === mg.key ? `1px solid ${mg.color}55` : '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)',
                  }}
                >
                  {t(muscleLabelKey(mg.key))}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll body — width-constrained so rows never sprawl edge-to-edge */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-3 pb-28">
          {/* Recent quick-add */}
          {recentExercises.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--content-muted)' }}>
                {t('workout.picker_recent')}
              </p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {recentExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => pick(ex)}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    style={{ background: 'color-mix(in srgb, var(--content-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--content-primary) 8%, transparent)' }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: muscleColor(ex.muscle_group) }} />
                    <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--content-secondary)' }}>{nameOf(ex)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Result count */}
          <p className="text-xs mb-2" style={{ color: 'var(--content-muted)' }}>
            {filtered.length} {t('workout.picker_count')}
          </p>

          {filtered.length === 0 && (
            <p className="text-center py-10 text-sm" style={{ color: 'var(--content-muted)' }}>{t('workout.picker_none')}</p>
          )}

          {/* Sectioned, 2-col on desktop */}
          {sections.map((section) => (
            <div key={section.mg?.key ?? 'flat'} className="mb-4">
              {section.mg && (
                <div className="flex items-center gap-2 mb-2 sticky top-0 py-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: section.mg.color }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--content-secondary)' }}>
                    {t(muscleLabelKey(section.mg.key))}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--content-disabled)' }}>{section.items.length}</span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {section.items.map((ex) => (
                  <ExerciseRow key={ex.id} ex={ex} name={nameOf(ex)} onPick={() => pick(ex)} onInfo={onInfo} />
                ))}
              </div>
            </div>
          ))}

          {/* Create custom — subtle footer, not competing with the list */}
          <button
            onClick={() => setShowCustomModal(true)}
            className="w-full mt-2 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{ border: '1px dashed color-mix(in srgb, var(--action-primary) 30%, transparent)', background: 'color-mix(in srgb, var(--action-primary) 5%, transparent)', color: 'var(--action-primary)' }}
          >
            <Plus size={16} />
            {t('workout.picker_custom')}
          </button>
        </div>
      </div>

      {/* Custom exercise modal */}
      <AnimatePresence>
        {showCustomModal && (
          <CustomExerciseModal
            onSave={(ex) => {
              if (onCustomCreated) onCustomCreated(ex);
              onSelect(ex);
            }}
            onClose={() => setShowCustomModal(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
