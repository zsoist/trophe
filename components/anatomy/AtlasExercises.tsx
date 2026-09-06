'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, Dumbbell, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { atlasExercises, type AtlasExercise } from '@/lib/anatomy/exercises';
import { anatomyLabelKey, resolveCuratedMuscleActivations } from '@/lib/workout/anatomy';
import { resolveExerciseInstructionBlock } from '@/lib/workout/exercise-copy';
import { equipmentLabel, exerciseDisplayName } from '@/components/workout/muscle-groups';
import { MusclePreview } from './MusclePreview';

export interface AtlasExerciseTarget { group: string; selection?: string | null; label: string; legRegion?: string; exercise?: AtlasExercise }
export function AtlasExerciseSuggestions({ target, onOpen }: { target: AtlasExerciseTarget; onOpen: (target: AtlasExerciseTarget) => void }) {
  const { t, lang } = useI18n();
  const matches = atlasExercises(target.group, target.selection, target.legRegion);
  return <div className="atlas-exercise-suggestions">
    <div className="atlas-exercise-heading"><strong>{t('anatomy.exercises_for_selection')}</strong><Dumbbell size={16} aria-hidden="true" /></div>
    {matches.parent && <p>{t('anatomy.exercises_parent', { muscle: t(`workout.atlas_muscle_${matches.muscle!.replaceAll('-', '_')}`) })}</p>}
    {!matches.items.length && <p>{t('anatomy.exercises_unmapped')}</p>}
    {matches.items.slice(0, 3).map(({ exercise, role }) => <button className="atlas-exercise-row" key={exercise.id} onClick={() => onOpen({ ...target, exercise })}>
      <span><strong>{exerciseDisplayName(exercise, lang)}</strong><small>{equipmentLabel(t, exercise.equipment)}{role && <> · {t(`workout.atlas_role_${role}`)}</>}</small></span><ChevronRight size={16} aria-hidden="true" />
    </button>)}
    <button className="atlas-exercise-more" onClick={() => onOpen(target)}>{t('anatomy.exercises_view_all')}<ChevronRight size={15} aria-hidden="true" /></button>
  </div>;
}

/** Native modal keeps focus and pointer input outside the still-mounted 3D viewer. */
export default function AtlasExercises({ target, onClose, libraryHref }: { target: AtlasExerciseTarget; onClose: () => void; libraryHref: string }) {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [exercise, setExercise] = useState(target.exercise ?? null);
  const [showGroup, setShowGroup] = useState(false);
  const matches = atlasExercises(target.group, showGroup ? null : target.selection, target.legRegion);
  const instructions = exercise ? resolveExerciseInstructionBlock(exercise, lang) : null;
  const activations = exercise ? resolveCuratedMuscleActivations({ name: exercise.name, muscle_group: exercise.muscle_group }) : [];
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="atlas-exercise-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="atlas-exercise-sheet">
      <header className="atlas-exercise-toolbar">
        {exercise ? <button aria-label={t('anatomy.exercises_back')} onClick={() => setExercise(null)}><ArrowLeft size={20} /></button> : <Dumbbell size={22} aria-hidden="true" />}
        <span>{target.label}</span><button autoFocus aria-label={t('workout.detail_close')} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="atlas-exercise-content">
        <h2 id={titleId}>{exercise ? exerciseDisplayName(exercise, lang) : t('anatomy.exercises')}</h2>
        {exercise ? <>
          <p className="atlas-exercise-equipment"><Dumbbell size={17} aria-hidden="true" />{equipmentLabel(t, exercise.equipment)} · {t(`workout.muscle_${exercise.muscle_group}`)}</p>
          <section className="atlas-exercise-guide"><h3>{t('workout.detail_technique_title')}</h3>{instructions?.englishFallback && <small>{t('workout.detail_english_guidance')}</small>}<p>{instructions?.value ?? t('workout.info_not_provided')}</p></section>
          <section><h3>{t('anatomy.exercise_muscles')}</h3><div className="atlas-exercise-muscles">{activations.map(a => <div key={a.id}><MusclePreview id={a.id} color="var(--accent)" /><span><strong>{t(anatomyLabelKey(a))}</strong><small>{t(`workout.atlas_role_${a.role}`)}</small></span></div>)}</div>{!activations.length && <p>{t(`workout.muscle_${exercise.muscle_group}`)}</p>}</section>
        </> : <>
          <p>{matches.parent ? t('anatomy.exercises_parent', { muscle: t(`workout.atlas_muscle_${matches.muscle!.replaceAll('-', '_')}`) }) : t('anatomy.exercises_intro')}</p>
          {!matches.items.length && <p>{t('anatomy.exercises_unmapped')}</p>}
          <div className="atlas-exercise-list">{matches.items.map(({ exercise: item, role }) => <button className="atlas-exercise-row" key={item.id} onClick={() => setExercise(item)}><span><strong>{exerciseDisplayName(item, lang)}</strong><small>{equipmentLabel(t, item.equipment)}{role && <> · {t(`workout.atlas_role_${role}`)}</>}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}</div>
          {target.selection && !showGroup && <button className="atlas-exercise-more" onClick={() => setShowGroup(true)}>{t('anatomy.exercises_group')}<ChevronRight size={16} /></button>}
          <a className="atlas-exercise-library" href={libraryHref}>{t('anatomy.exercises_library')}<ChevronRight size={16} /></a>
        </>}
      </div>
    </div>
  </dialog>, document.body);
}
