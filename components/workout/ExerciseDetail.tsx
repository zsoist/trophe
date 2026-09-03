'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Dumbbell, Plus, RefreshCw, Trophy } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Exercise, Language } from '@/lib/types';
import type { AnatomyMuscleId } from '@/lib/workout/anatomy';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import { resolveExerciseInstructionBlock } from '@/lib/workout/exercise-copy';
import { kgToDisplay, useWeightUnit } from '@/lib/workout/units';
import { exerciseDisplayName } from './muscle-groups';
import { ExerciseMediaBadge } from './ExerciseMediaBadge';
import { ExerciseMotion } from './ExerciseMotion';
import { MuscleAtlas } from './MuscleAtlas';

interface HistoryEntry { date: string; topWeightKg: number | null; topReps: number | null; sets: number }
interface GuidanceSections { setup: string[]; execution: string[]; breathing: string[]; mistakes: string[] }

type DetailPresentation = 'route' | 'sheet';
type PhaseId = 'setup' | 'work' | 'finish';

export interface ExerciseDetailProps {
  exercise: Exercise;
  userId: string | null;
  onAdd?: (exercise: Exercise) => void;
  isAdded?: boolean;
  alternateAction?: { label: string; message?: string; onClick: () => void };
  className?: string;
  presentation?: DetailPresentation;
  headingId?: string;
  playbackDisabled?: boolean;
  actionLabel?: string;
  actionAriaLabel?: string;
}

const breathingPattern = /\b(?:breath\w*|inhale\w*|exhale\w*|respir\w*|inhala\w*|exhala\w*)\b|αναπν|εισπν|εκπν/i;
const mistakePattern = /\b(?:avoid|do not|don't|never|evita\w*|no)\b|μην|αποφ/i;
const setupPattern = /\b(?:set|setup|position|stand|sit|lie|plant|grip|feet|stance|coloca\w*|posición|pies|agarre)\b|θέση|πόδια|λαβή/i;

const localeByLanguage: Record<Language, string> = {
  en: 'en-US', es: 'es-ES', el: 'el-GR', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL',
};

const PHASE_LABEL_KEYS: Record<PhaseId, string> = {
  setup: 'workout.detail_phase_setup',
  work: 'workout.detail_phase_work',
  finish: 'workout.detail_phase_finish',
};

const PHASE_ACTION_KEYS: Record<PhaseId, string> = {
  setup: 'workout.detail_phase_setup_action',
  work: 'workout.detail_phase_work_action',
  finish: 'workout.detail_phase_finish_action',
};

const PHASE_CUE_KEYS: Record<PhaseId, string> = {
  setup: 'workout.detail_phase_setup_cue',
  work: 'workout.detail_phase_work_cue',
  finish: 'workout.detail_phase_finish_cue',
};

function sentenceBoundaries(value: string): string[] {
  return value.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

export function organizeExerciseGuidance(value: string | null): GuidanceSections {
  const sections: GuidanceSections = { setup: [], execution: [], breathing: [], mistakes: [] };
  for (const sentence of sentenceBoundaries(value ?? '')) {
    if (breathingPattern.test(sentence)) sections.breathing.push(sentence);
    else if (mistakePattern.test(sentence)) sections.mistakes.push(sentence);
    else if (setupPattern.test(sentence)) sections.setup.push(sentence);
    else sections.execution.push(sentence);
  }
  return sections;
}

function GuidanceRow({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="exercise-detail__guidance-row">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <div>{items.map((item) => <p key={item}>{item}</p>)}</div>
      ) : <p className="exercise-detail__empty">{empty}</p>}
    </div>
  );
}

export function ExerciseDetail({
  exercise,
  userId,
  onAdd,
  isAdded = false,
  alternateAction,
  className = '',
  presentation = 'route',
  headingId,
  playbackDisabled = false,
  actionLabel,
  actionAriaLabel,
}: ExerciseDetailProps) {
  const { t, lang } = useI18n();
  const [unit] = useWeightUnit();
  const [history, setHistory] = useState<HistoryEntry[] | null>(userId ? null : []);
  const [historyError, setHistoryError] = useState(false);
  const [historyRequest, setHistoryRequest] = useState(0);
  const requestKey = `${userId ?? 'guest'}:${exercise.id}:${historyRequest}`;
  const [prState, setPrState] = useState<{ requestKey: string; value: number | null }>({ requestKey, value: null });
  const pr = prState.requestKey === requestKey ? prState.value : null;
  const name = exerciseDisplayName(exercise, lang);
  const instruction = resolveExerciseInstructionBlock(exercise, lang);
  const guidance = useMemo(() => organizeExerciseGuidance(instruction.value), [instruction.value]);
  const media = useMemo(() => resolveExerciseMedia({
    name: exercise.name,
    equipment: exercise.equipment,
    muscleGroup: exercise.muscle_group,
  }), [exercise.equipment, exercise.muscle_group, exercise.name]);
  const hasExactMotion = media.tier === 'verified-technique' && Boolean(media.motionSrc);
  const mediaAlt = t(
    hasExactMotion
      ? 'workout.movement_technique_alt'
      : media.tier === 'verified-technique'
        ? 'workout.picker_exact_poster_alt'
        : media.tier === 'verified-anatomy'
          ? 'workout.picker_anatomy_poster_alt'
          : 'workout.detail_fallback_poster_alt',
    { name },
  );
  const [phaseSelection, setPhaseSelection] = useState<{ exerciseId: string; phase: PhaseId }>({ exerciseId: exercise.id, phase: 'setup' });
  const activePhase = phaseSelection.exerciseId === exercise.id ? phaseSelection.phase : 'setup';
  const [muscleSelection, setMuscleSelection] = useState<{ exerciseId: string; muscle: AnatomyMuscleId | null }>({
    exerciseId: exercise.id,
    muscle: media.activations[0]?.id ?? null,
  });
  const selectedMuscle = muscleSelection.exerciseId === exercise.id
    ? muscleSelection.muscle
    : media.activations[0]?.id ?? null;
  const activePhaseRecord = media.phases.find((phase) => phase.id === activePhase);
  const activePhaseCue = lang === 'en' && activePhaseRecord?.cue
    ? activePhaseRecord.cue
    : t(PHASE_CUE_KEYS[activePhase]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHistory(null);
      setHistoryError(false);
      setPrState({ requestKey, value: null });
    });
    void (async () => {
      // The authenticated browser client and joined user filter preserve workout_sets RLS.
      const { data, error } = await supabase
        .from('workout_sets')
        .select('weight_kg, reps, is_warmup, workout_sessions!inner(user_id, session_date)')
        .eq('exercise_id', exercise.id)
        .eq('workout_sessions.user_id', userId)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false })
        .limit(120);
      if (!active) return;
      if (error) {
        setHistoryError(true);
        setHistory([]);
        setPrState({ requestKey, value: null });
        return;
      }

      type Row = { weight_kg: number | null; reps: number | null; workout_sessions: { session_date: string } };
      const rows = ((data as unknown as Row[]) ?? []);
      const byDate = new Map<string, Row[]>();
      let best = 0;
      for (const row of rows) {
        if (row.weight_kg !== null) best = Math.max(best, row.weight_kg);
        const date = row.workout_sessions.session_date;
        byDate.set(date, [...(byDate.get(date) ?? []), row]);
      }
      setPrState({ requestKey, value: best > 0 ? best : null });
      setHistoryError(false);
      setHistory([...byDate.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 3)
        .map(([date, dateRows]) => {
          const top = dateRows.reduce<Row | null>((current, row) => (
            row.weight_kg !== null && (current === null || row.weight_kg > (current.weight_kg ?? 0)) ? row : current
          ), null);
          return { date, topWeightKg: top?.weight_kg ?? null, topReps: top?.reps ?? null, sets: dateRows.length };
        }));
    })();
    return () => { active = false; };
  }, [exercise.id, historyRequest, requestKey, userId]);

  return (
    <article className={`exercise-detail exercise-detail--${presentation} ${className}`}>
      <section className="exercise-detail__hero" aria-label={t('workout.detail_instruction_title')}>
        <div className="exercise-detail__media-meta"><ExerciseMediaBadge media={media} /></div>
        <ExerciseMotion media={media} alt={mediaAlt} autoplay={hasExactMotion} playbackDisabled={playbackDisabled} />
      </section>

      <header className="exercise-detail__identity">
        <h1 id={headingId}>{name}</h1>
        <div className="exercise-detail__identity-meta">
          <span><Dumbbell size={15} aria-hidden="true" />{exercise.equipment ?? t('workout.equipment_not_required')}</span>
          {exercise.is_compound ? <span>{t('workout.compound')}</span> : null}
        </div>
      </header>

      <section className="exercise-detail__phase" aria-labelledby={`${exercise.id}-phase-title`}>
        <h2 id={`${exercise.id}-phase-title`}>{t('workout.detail_phase_label')}</h2>
        <div className="exercise-detail__phase-controls" role="group" aria-label={t('workout.detail_phase_label')}>
          {(['setup', 'work', 'finish'] as const).map((phase) => (
            <button key={phase} type="button" aria-pressed={activePhase === phase} aria-label={t(PHASE_ACTION_KEYS[phase])} onClick={() => setPhaseSelection({ exerciseId: exercise.id, phase })}>
              {t(PHASE_LABEL_KEYS[phase])}
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite">{activePhaseCue}</p>
      </section>

      <div className="exercise-detail__body">
        <div className="exercise-detail__anatomy">
          {media.activations.length > 0 ? (
            <MuscleAtlas
              activations={media.activations}
              selected={selectedMuscle}
              onSelect={(muscle) => setMuscleSelection({ exerciseId: exercise.id, muscle })}
            />
          ) : (
            <div className="exercise-detail__anatomy-empty">
              <Dumbbell size={24} aria-hidden="true" />
              <p>{t('workout.detail_no_anatomy')}</p>
            </div>
          )}
        </div>

        <div className="exercise-detail__instructions">
          <section className="exercise-detail__section" aria-labelledby={`${exercise.id}-setup-title`}>
            <h2 id={`${exercise.id}-setup-title`}>{t('workout.detail_equipment_setup')}</h2>
            <dl className="exercise-detail__equipment">
              <div><dt>{t('workout.detail_equipment_label')}</dt><dd>{exercise.equipment ?? t('workout.equipment_not_required')}</dd></div>
            </dl>
            {instruction.englishFallback ? <p className="exercise-detail__language-note">{t('workout.detail_english_guidance')}</p> : null}
            <GuidanceRow title={t('workout.info_setup')} items={guidance.setup} empty={t('workout.info_not_provided')} />
          </section>

          <section className="exercise-detail__section" aria-labelledby={`${exercise.id}-technique-title`}>
            <h2 id={`${exercise.id}-technique-title`}>{t('workout.detail_technique_title')}</h2>
            <GuidanceRow title={t('workout.info_execution')} items={guidance.execution} empty={t('workout.info_not_provided')} />
            <GuidanceRow title={t('workout.info_breathing')} items={guidance.breathing} empty={t('workout.info_not_provided')} />
            <GuidanceRow title={t('workout.info_common_mistakes')} items={guidance.mistakes} empty={t('workout.info_not_provided')} />
          </section>

          <section className="exercise-detail__section exercise-detail__safety" aria-labelledby={`${exercise.id}-safety-title`}>
            <h2 id={`${exercise.id}-safety-title`}><AlertTriangle size={17} aria-hidden="true" />{t('workout.info_safety')}</h2>
            <p>{t('workout.info_safety_unavailable')}</p>
          </section>
        </div>
      </div>

      <section className="exercise-detail__section exercise-detail__evidence" aria-labelledby={`${exercise.id}-evidence-title`}>
        <h2 id={`${exercise.id}-evidence-title`}>{t('workout.detail_evidence_title')}</h2>
        <div className="exercise-detail__evidence-grid">
          <div className="exercise-detail__record">
            <h3><Trophy size={16} aria-hidden="true" />{t('workout.info_pr')}</h3>
            <p>{pr !== null ? `${kgToDisplay(pr, unit)} ${unit}` : '—'}</p>
          </div>
          <div className="exercise-detail__history">
            <h3>{t('workout.info_last')}</h3>
            {history === null ? <p role="status">{t('workout.detail_history_loading')}</p> : null}
            {historyError ? (
              <div role="alert">
                <p>{t('workout.info_history_failed')}</p>
                <button type="button" onClick={() => setHistoryRequest((request) => request + 1)}><RefreshCw size={15} aria-hidden="true" />{t('workout.detail_history_retry')}</button>
              </div>
            ) : null}
            {!historyError && history !== null && history.length === 0 ? <p><Dumbbell size={14} aria-hidden="true" />{t('workout.info_no_history')}</p> : null}
            {history?.map((entry) => (
              <div key={entry.date} className="exercise-detail__history-row">
                <time dateTime={entry.date}>{new Date(`${entry.date}T00:00:00`).toLocaleDateString(localeByLanguage[lang], { month: 'short', day: 'numeric' })}</time>
                <span>{t('workout.history_sets', { n: entry.sets })}</span>
                <strong>{entry.topWeightKg !== null ? `${kgToDisplay(entry.topWeightKg, unit)}${unit} × ${entry.topReps ?? 0}` : '—'}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {onAdd || alternateAction ? (
        <div className="exercise-detail__action">
          {onAdd ? (
            <button type="button" disabled={isAdded} aria-label={isAdded ? t('workout.exercise_added_named', { name }) : actionAriaLabel ?? t('workout.picker_add_named', { name })} onClick={() => onAdd(exercise)} className="btn-gold">
              {isAdded ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
              {isAdded ? t('workout.exercise_added') : actionLabel ?? t('workout.picker_add')}
            </button>
          ) : (
            <div>
              <p>{alternateAction?.message ?? t('workout.exercise_requires_strength_draft')}</p>
              <button type="button" onClick={alternateAction?.onClick} className="btn-gold">{alternateAction?.label}</button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default ExerciseDetail;
