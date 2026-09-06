'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, Dumbbell, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { atlasExercises, type AtlasExercise } from '@/lib/anatomy/exercises';
import { anatomyLabelKey } from '@/lib/workout/anatomy';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import type { Exercise } from '@/lib/types';
import Image from 'next/image';
import { equipmentLabel, exerciseDisplayName } from '@/components/workout/muscle-groups';

export function AtlasExerciseRow({ exercise, onClick }: { exercise: AtlasExercise; onClick: () => void }) {
  const { t, lang } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const media = resolveExerciseMedia({ name: exercise.name, equipment: exercise.equipment, muscleGroup: exercise.muscle_group });
  const primary = media.activations.filter(a => a.role === 'primary');
  const secondary = media.activations.filter(a => a.role === 'secondary');
  const names = (items: typeof primary) => items.map(a => t(anatomyLabelKey(a))).join(' · ');
  const supporting = secondary.length ? names(secondary) : exercise.secondary_muscles.map(group => t(`workout.muscle_${group}`)).join(' · ');
  return <button className="atlas-exercise-row" onClick={onClick}>
    <span className="atlas-exercise-thumbnail">{media.tier === 'verified-technique' && !imageFailed ? <Image unoptimized src={media.posterSrc} width={80} height={80} alt="" onError={() => setImageFailed(true)} /> : <Dumbbell size={28} aria-hidden="true" />}</span>
    <span className="atlas-exercise-row-copy"><strong>{exerciseDisplayName(exercise, lang)}</strong><small>{equipmentLabel(t, exercise.equipment)}</small><span className="atlas-exercise-targets">{t('anatomy.exercise_main', { muscles: primary.length ? names(primary) : t(`workout.muscle_${exercise.muscle_group}`) })}</span>{supporting && <small>{t('anatomy.exercise_supports', { muscles: supporting })}</small>}</span>
    <ChevronRight size={16} aria-hidden="true" />
  </button>;
}
/** Read-only catalogue identities must never enter a workout or history query. */
const detailExercise = (exercise: AtlasExercise): Exercise => ({ ...exercise, id: `catalogue:${exercise.id}`, muscle_group: exercise.muscle_group as Exercise['muscle_group'], is_template: true, created_by: null, created_at: '' });

export interface AtlasExerciseTarget { group: string; selection?: string | null; label: string; legRegion?: string; exercise?: AtlasExercise }
export function AtlasExerciseSuggestions({ target, onOpen }: { target: AtlasExerciseTarget; onOpen: (target: AtlasExerciseTarget) => void }) {
  const { t } = useI18n();
  const matches = atlasExercises(target.group, target.selection, target.legRegion);
  return <div className="atlas-exercise-suggestions">
    <div className="atlas-exercise-heading"><strong>{t('anatomy.exercises_for_selection')}</strong><Dumbbell size={16} aria-hidden="true" /></div>
    {matches.parent && <p>{t('anatomy.exercises_parent', { muscle: t(`workout.atlas_muscle_${matches.muscle!.replaceAll('-', '_')}`) })}</p>}
    {!matches.items.length && <p>{t('anatomy.exercises_unmapped')}</p>}
    {matches.items.slice(0, 2).map(({ exercise }) => <AtlasExerciseRow key={exercise.id} exercise={exercise} onClick={() => onOpen({ ...target, exercise })} />)}
    <button className="atlas-exercise-more" onClick={() => onOpen(target)}>{t('anatomy.exercises_view_all')}<ChevronRight size={15} aria-hidden="true" /></button>
  </div>;
}

/** Native modal keeps focus and pointer input outside the still-mounted 3D viewer. */
export default function AtlasExercises({ target, onClose, libraryHref }: { target: AtlasExerciseTarget; onClose: () => void; libraryHref: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [exercise, setExercise] = useState(target.exercise ?? null);
  const [showGroup, setShowGroup] = useState(false);
  const matches = atlasExercises(target.group, showGroup ? null : target.selection, target.legRegion);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={ref} className="atlas-exercise-dialog" data-detail={Boolean(exercise)} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="atlas-exercise-sheet">
      <header className="atlas-exercise-toolbar">
        {exercise ? <button aria-label={t('anatomy.exercises_back')} onClick={() => setExercise(null)}><ArrowLeft size={20} /></button> : <Dumbbell size={22} aria-hidden="true" />}
        <span>{target.label}</span><button autoFocus aria-label={t('workout.detail_close')} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="atlas-exercise-content">
        {exercise ? <ExerciseDetail key={exercise.id} exercise={detailExercise(exercise)} userId={null} presentation="sheet" headingId={titleId} /> : <>
          <h2 id={titleId}>{t('anatomy.exercises')}</h2>

          <p>{matches.parent ? t('anatomy.exercises_parent', { muscle: t(`workout.atlas_muscle_${matches.muscle!.replaceAll('-', '_')}`) }) : t('anatomy.exercises_intro')}</p>
          {!matches.items.length && <p>{t('anatomy.exercises_unmapped')}</p>}
          <div className="atlas-exercise-list">{matches.items.map(({ exercise: item }) => <AtlasExerciseRow key={item.id} exercise={item} onClick={() => { setExercise(item); ref.current?.scrollTo({ top: 0 }); }} />)}</div>
          {target.selection && !showGroup && <button className="atlas-exercise-more" onClick={() => setShowGroup(true)}>{t('anatomy.exercises_group')}<ChevronRight size={16} /></button>}
          <a className="atlas-exercise-library" href={libraryHref}>{t('anatomy.exercises_library')}<ChevronRight size={16} /></a>
        </>}
      </div>
    </div>
  </dialog>, document.body);
}
