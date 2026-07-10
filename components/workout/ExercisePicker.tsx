'use client';

/**
 * Exercise picker (full-screen) + custom-exercise modal — extracted from
 * app/dashboard/workout/page.tsx in the 10/10 wave.
 *
 * Structure: sticky search + muscle chips → Recent quick-add → sectioned list
 * (muscle headers, 2-col on desktop). Rows expose an info affordance that
 * opens the ExerciseInfoSheet (form cues, muscles, PR, recent history).
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Info, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import type { Exercise, MuscleGroup } from '@/lib/types';
import { MUSCLE_GROUPS, muscleColor, muscleLabelKey } from './muscle-groups';

// ─── Custom Exercise Modal ───
export function CustomExerciseModal({
  onSave,
  onClose,
}: {
  onSave: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState('dumbbell');
  const [isCompound, setIsCompound] = useState(false);
  const [saving, setSaving] = useState(false);

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[var(--z-modal,60)] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-elevated p-6 w-full max-w-sm"
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
          className="input-dark mb-3"
          autoFocus
        />

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">{t('workout.custom_muscle')}</label>
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
            className="input-dark w-full"
          >
            {MUSCLE_GROUPS.map((mg) => (
              <option key={mg.key} value={mg.key}>{t(muscleLabelKey(mg.key))}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">{t('workout.custom_equipment')}</label>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="input-dark w-full"
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
            className="rounded border-stone-600"
          />
          <span className="text-sm text-stone-400">{t('workout.custom_compound')}</span>
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2">
            {t('workout.custom_cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="btn-gold flex-1 text-sm py-2 font-semibold"
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
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <button onClick={onPick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--t1)' }}>{name}</span>
          {meta && <span className="block text-[11px] truncate" style={{ color: 'var(--t4)' }}>{meta}</span>}
        </span>
      </button>
      {onInfo && (
        <button
          onClick={() => onInfo(ex)}
          aria-label={t('workout.info_title')}
          className="p-1.5 rounded-lg shrink-0 transition-colors"
          style={{ color: 'var(--t4)' }}
        >
          <Info size={15} />
        </button>
      )}
      <button onClick={onPick} aria-label={t('workout.add_exercise')} className="shrink-0 p-1">
        <Plus size={16} style={{ color: 'var(--t4)' }} />
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
  const { t } = useI18n();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg, #0a0a0a)' }}
    >
      {/* Sticky header: close · search · live count */}
      <div className="sticky top-0 z-10 glass-elevated">
        <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <button onClick={onClose} aria-label={t('workout.custom_cancel')} className="p-2 rounded-xl transition-colors" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <X size={20} style={{ color: 'var(--t2)' }} />
            </button>
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t4)' }} />
              <input
                ref={inputRef}
                type="text"
                placeholder={t('workout.search_exercises')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-dark pl-10"
              />
            </div>
          </div>

          {/* Muscle filter chips */}
          <div className="mt-2.5 -mx-1 px-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterMuscle('all')}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: filterMuscle === 'all' ? 'color-mix(in srgb, var(--accent, #D4A853) 20%, transparent)' : 'rgba(255,255,255,0.05)',
                  color: filterMuscle === 'all' ? 'var(--accent, #D4A853)' : 'var(--t3)',
                  border: filterMuscle === 'all' ? '1px solid color-mix(in srgb, var(--accent, #D4A853) 32%, transparent)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {t('workout.all')}
              </button>
              {MUSCLE_GROUPS.map((mg) => (
                <button
                  key={mg.key}
                  onClick={() => setFilterMuscle(filterMuscle === mg.key ? 'all' : mg.key)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
                  style={{
                    background: filterMuscle === mg.key ? `${mg.color}22` : 'rgba(255,255,255,0.05)',
                    color: filterMuscle === mg.key ? mg.color : 'var(--t3)',
                    border: filterMuscle === mg.key ? `1px solid ${mg.color}55` : '1px solid rgba(255,255,255,0.06)',
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
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--t4)' }}>
                {t('workout.picker_recent')}
              </p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {recentExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => pick(ex)}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: muscleColor(ex.muscle_group) }} />
                    <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--t2)' }}>{nameOf(ex)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Result count */}
          <p className="text-[11px] mb-2" style={{ color: 'var(--t4)' }}>
            {filtered.length} {t('workout.picker_count')}
          </p>

          {filtered.length === 0 && (
            <p className="text-center py-10 text-sm" style={{ color: 'var(--t4)' }}>{t('workout.picker_none')}</p>
          )}

          {/* Sectioned, 2-col on desktop */}
          {sections.map((section) => (
            <div key={section.mg?.key ?? 'flat'} className="mb-4">
              {section.mg && (
                <div className="flex items-center gap-2 mb-2 sticky top-0 py-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: section.mg.color }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                    {t(muscleLabelKey(section.mg.key))}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--t5)' }}>{section.items.length}</span>
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
            className="w-full mt-2 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            style={{ border: '1px dashed color-mix(in srgb, var(--accent, #D4A853) 30%, transparent)', background: 'color-mix(in srgb, var(--accent, #D4A853) 5%, transparent)', color: 'var(--accent, #D4A853)' }}
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
    </motion.div>
  );
}
