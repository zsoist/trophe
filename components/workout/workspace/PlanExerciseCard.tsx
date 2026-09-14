'use client';

import { useRef } from 'react';
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, GripVertical, RefreshCw, Trash2 } from 'lucide-react';
import { ExerciseMediaBadge } from '@/components/workout/ExerciseMediaBadge';
import { equipmentLabel, exerciseDisplayName } from '@/components/workout/muscle-groups';
import { useI18n } from '@/lib/i18n';
import type { DraftExercise } from '@/lib/workout/workspace-state';
import { exercisePosterAltKey, resolveExerciseMedia } from '@/lib/workout/exercise-media';
import type { WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';

export const DEFAULT_PLAN_REST_SECONDS = 90;

interface PlanExerciseCardProps {
  draftExercise: DraftExercise;
  exercise?: WorkoutExerciseOption;
  index: number;
  total: number;
  mode?: 'edit' | 'review';
  locked?: boolean;
  /** Edit mode only: whether this row's inline prescription surface is open. */
  expanded?: boolean;
  onToggle?: () => void;
  onUpdate?: (patch: Partial<Pick<DraftExercise, 'targetSets' | 'targetReps' | 'restSeconds' | 'targetRpe' | 'notes'>>) => void;
  onMove?: (direction: 'up' | 'down') => void;
  onReplace?: () => void;
  onRemove?: () => void;
  onTechnique: () => void;
}

/** Canonical name from the draft (or the row), then the shared locale resolver. */
function localizedName(exercise: WorkoutExerciseOption | undefined, draftExercise: DraftExercise, lang: string, unavailableName: string): string {
  const canonical = draftExercise.exerciseName?.trim() || exercise?.name?.trim();
  if (!canonical) return unavailableName;
  return exerciseDisplayName({ name: canonical, name_es: exercise?.name_es }, lang);
}

export function PlanExerciseCard({ draftExercise, exercise, index, total, mode = 'edit', locked = false, expanded = false, onToggle, onUpdate, onMove, onReplace, onRemove, onTechnique }: PlanExerciseCardProps) {
  const { lang, t } = useI18n();
  const detailsId = `plan-exercise-${draftExercise.exerciseId}-details`;
  const detailsOpen = mode === 'edit' && expanded;
  const name = localizedName(exercise, draftExercise, lang, t('workout.exercise_name_unavailable'));
  const equipment = exercise?.equipment ?? null;
  const muscleGroup = draftExercise.muscleGroup ?? exercise?.muscle_group ?? null;
  const media = resolveExerciseMedia({ name: exercise?.name ?? name, equipment, muscleGroup });
  const posterAlt = t(exercisePosterAltKey(media.tier), { name });
  const restSeconds = draftExercise.restSeconds ?? DEFAULT_PLAN_REST_SECONDS;
  const rpe = draftExercise.targetRpe ?? null;
  const pointerStart = useRef<{ id: number; y: number } | null>(null);
  const startPointerReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    pointerStart.current = { id: event.pointerId, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const finishPointerReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const delta = event.clientY - start.y;
    if (delta <= -32 && index > 0) onMove?.('up');
    if (delta >= 32 && index < total - 1) onMove?.('down');
  };

  return (
    <article data-testid="plan-exercise" data-exercise-id={draftExercise.exerciseId} data-media-tier={media.tier} data-expanded={detailsOpen ? 'true' : undefined} className={`plan-exercise-card plan-exercise-card--${mode}${detailsOpen ? ' plan-exercise-card--featured' : ''}`}>
      <div className="plan-exercise-card__identity">
        {mode === 'edit' ? <button type="button" className="plan-exercise-card__sequence plan-exercise-card__drag" disabled={locked || total < 2} aria-label={t('workout.drag_named', { name })} onPointerDown={startPointerReorder} onPointerUp={finishPointerReorder} onPointerCancel={() => { pointerStart.current = null; }}><GripVertical size={17} aria-hidden="true" /><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></button> : <div className="plan-exercise-card__sequence" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>}
        {/* Resolver output guarantees exact movement/equipment media or an honestly labeled fallback. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.posterSrc} alt={posterAlt} width={88} height={88} loading="lazy" decoding="async" />
        <div className="plan-exercise-card__title">
          <div className="plan-exercise-card__heading">
            <h2>{name}</h2>
            {mode === 'edit' ? <button type="button" className="plan-exercise-card__toggle" aria-expanded={detailsOpen} aria-controls={detailsId} aria-label={t('workout.more_exercise_options')} disabled={locked} onClick={onToggle}><ChevronDown size={18} aria-hidden="true" /></button> : null}
          </div>
          <p>{t('workout.equipment_label', { equipment: equipmentLabel(t, equipment) })}</p>
          <ExerciseMediaBadge media={media} />
        </div>
      </div>

      {mode === 'edit' ? (
        <>
          <div className="plan-exercise-card__details" id={detailsId} hidden={!detailsOpen}>
            <div className="plan-exercise-card__prescription">
              <label className="plan-exercise-card__field"><span>{t('workout.target_sets')}</span><input className="text-base" type="number" inputMode="numeric" min={1} max={20} disabled={locked} aria-label={t('workout.target_sets_named', { name })} value={draftExercise.targetSets} onChange={(event) => onUpdate?.({ targetSets: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label>
              <label className="plan-exercise-card__field"><span>{t('workout.target_reps')}</span><input className="text-base" disabled={locked} aria-label={t('workout.target_reps_named', { name })} value={draftExercise.targetReps} onChange={(event) => onUpdate?.({ targetReps: event.target.value })} /></label>
              <label className="plan-exercise-card__field"><span>{t('workout.rest_seconds')}</span><input className="text-base" type="number" inputMode="numeric" min={0} max={600} step={15} disabled={locked} aria-label={t('workout.rest_seconds_named', { name })} value={restSeconds} onChange={(event) => onUpdate?.({ restSeconds: Math.max(0, Math.min(600, Math.round(Number(event.target.value) || 0))) })} /><span className="wsp-unit" aria-hidden="true">s</span></label>
              <label className="plan-exercise-card__field"><span>{t('workout.target_rpe')}</span><input className="text-base" type="number" inputMode="decimal" min={1} max={10} step={0.5} disabled={locked} placeholder="—" aria-label={t('workout.target_rpe_named', { name })} value={rpe ?? ''} onChange={(event) => onUpdate?.({ targetRpe: event.target.value === '' ? null : Math.max(1, Math.min(10, Number(event.target.value))) })} /></label>
            </div>
            <label className="plan-exercise-card__notes"><span>{t('workout.notes_optional')}</span><textarea className="text-base" rows={2} maxLength={1000} disabled={locked} aria-label={t('workout.notes_named', { name })} value={draftExercise.notes ?? ''} onChange={(event) => onUpdate?.({ notes: event.target.value })} /></label>
          </div>
          <div className="plan-exercise-card__actions">
            <button type="button" disabled={locked || index === 0} aria-label={t('workout.move_named_earlier', { name })} onClick={() => onMove?.('up')}><ArrowUp size={17} aria-hidden="true" /><span>{t('workout.move_earlier')}</span></button>
            <button type="button" disabled={locked || index === total - 1} aria-label={t('workout.move_named_later', { name })} onClick={() => onMove?.('down')}><ArrowDown size={17} aria-hidden="true" /><span>{t('workout.move_later')}</span></button>
            <button type="button" disabled={locked} aria-label={t('workout.replace_named', { name })} onClick={onReplace}><RefreshCw size={17} aria-hidden="true" /><span>{t('workout.replace_exercise')}</span></button>
            <button type="button" aria-label={t('workout.technique_named', { name })} onClick={onTechnique}><BookOpen size={17} aria-hidden="true" /><span>{t('workout.technique')}</span></button>
            <button type="button" disabled={locked} aria-label={t('workout.remove_named', { name })} onClick={onRemove}><Trash2 size={17} aria-hidden="true" /><span>{t('workout.remove_exercise')}</span></button>
          </div>
        </>
      ) : (
        <div className="plan-exercise-card__review">
          <p>{t('workout.review_prescription', { sets: draftExercise.targetSets, reps: draftExercise.targetReps, rest: restSeconds, rpe: rpe ?? '—' })}</p>
          {draftExercise.notes?.trim() ? <p>{t('workout.review_notes', { notes: draftExercise.notes.trim() })}</p> : null}
          <button type="button" aria-label={t('workout.technique_named', { name })} onClick={onTechnique}><BookOpen size={17} aria-hidden="true" />{t('workout.technique')}</button>
        </div>
      )}
    </article>
  );
}
