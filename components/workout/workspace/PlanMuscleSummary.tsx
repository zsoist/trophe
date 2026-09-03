'use client';

import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { muscleLabel, resolveMuscleActivations, type AnatomyMuscleId } from '@/lib/workout/anatomy';
import { calculateCombinedMuscleLoad } from '@/lib/workout/muscle-load';
import type { DraftExercise } from '@/lib/workout/workspace-state';
import type { WorkoutExerciseOption } from '@/components/workout/workspace/WorkoutBuilder';
import { DEFAULT_PLAN_REST_SECONDS } from '@/components/workout/workspace/PlanExerciseCard';

interface PlanMuscleSummaryProps { draftExercises: DraftExercise[]; exercises: WorkoutExerciseOption[] }

export interface PlanEvidenceSummary {
  exerciseCount: number;
  workingSets: number;
  estimatedMinutes: number;
  muscleLoads: Array<{ id: AnatomyMuscleId; label: string; load: number }>;
  missingEvidenceCount: number;
  concentrated: boolean;
}

export function buildPlanEvidenceSummary(draftExercises: DraftExercise[], exercises: WorkoutExerciseOption[]): PlanEvidenceSummary {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  let missingEvidenceCount = 0;
  let estimatedSeconds = Math.max(0, draftExercises.length - 1) * 60;
  const loadInputs = draftExercises.map((draftExercise) => {
    const exercise = byId.get(draftExercise.exerciseId);
    const activations = resolveMuscleActivations({ name: exercise?.name ?? draftExercise.exerciseName, equipment: exercise?.equipment, muscleGroup: draftExercise.muscleGroup ?? exercise?.muscle_group });
    if (activations.length === 0) missingEvidenceCount += 1;
    const sets = Math.max(0, draftExercise.targetSets);
    const rest = draftExercise.restSeconds ?? DEFAULT_PLAN_REST_SECONDS;
    estimatedSeconds += (sets * 45) + (Math.max(0, sets - 1) * rest);
    return { activations, sets: Array.from({ length: sets }, () => ({ completed: true })) };
  });
  const load = calculateCombinedMuscleLoad(loadInputs);
  const muscleLoads = Object.entries(load).filter((entry): entry is [AnatomyMuscleId, number] => entry[1] > 0).map(([id, value]) => ({ id, label: muscleLabel(id), load: Math.round(value * 10) / 10 })).sort((a, b) => b.load - a.load || a.label.localeCompare(b.label));
  const top = muscleLoads[0]?.load ?? 0;
  const next = muscleLoads[1]?.load ?? 0;
  return { exerciseCount: draftExercises.length, workingSets: draftExercises.reduce((sum, exercise) => sum + exercise.targetSets, 0), estimatedMinutes: Math.max(1, Math.round(estimatedSeconds / 60)), muscleLoads, missingEvidenceCount, concentrated: top > 0 && (next === 0 || top >= next * 1.75) };
}

export function PlanMuscleSummary({ draftExercises, exercises }: PlanMuscleSummaryProps) {
  const { t } = useI18n();
  const summary = buildPlanEvidenceSummary(draftExercises, exercises);
  const topLoads = summary.muscleLoads.slice(0, 4);
  const maxLoad = topLoads[0]?.load ?? 1;
  return (
    <section className="plan-muscle-summary" role="region" aria-label={t('workout.plan_muscle_balance')}>
      <div className="plan-muscle-summary__facts"><strong>{t('workout.plan_summary_line', { exercises: summary.exerciseCount, sets: summary.workingSets })}</strong><span>{t('workout.plan_estimated_duration', { minutes: summary.estimatedMinutes })}</span></div>
      <div className="plan-muscle-summary__heading"><h2>{t('workout.plan_muscle_balance')}</h2><span>{t('workout.plan_load_basis')}</span></div>
      {topLoads.length > 0 ? <ol className="plan-muscle-summary__loads">{topLoads.map((item) => <li key={item.id}><span>{t(`workout.atlas_muscle_${item.id.replaceAll('-', '_')}`) || item.label}</span><span aria-label={t('workout.plan_load_value', { value: item.load })}><i style={{ width: `${Math.max(8, Math.round((item.load / maxLoad) * 100))}%` }} /></span><strong>{item.load}</strong></li>)}</ol> : <p className="plan-muscle-summary__empty">{t('workout.plan_no_muscle_evidence')}</p>}
      {summary.missingEvidenceCount > 0 ? <p className="plan-muscle-summary__warning"><AlertTriangle size={16} aria-hidden="true" />{t('workout.plan_missing_evidence')}</p> : null}
      {summary.concentrated ? <p className="plan-muscle-summary__warning"><AlertTriangle size={16} aria-hidden="true" />{t('workout.plan_balance_concentrated')}</p> : null}
    </section>
  );
}
