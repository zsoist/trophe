import type { ActivityLevel, Exercise, Goal, MuscleGroup, TemplateExercise, WorkoutRecommendation, WorkoutRecommendationExercise, WorkoutPreferences, WorkoutTemplate } from '@/lib/types';

export interface RecommendationRecentSet {
  exerciseId: string;
  reps: number | null;
  weightKg?: number | null;
  completedOn?: string | null;
  isWarmup: boolean;
}

export type { WorkoutRecommendation, WorkoutRecommendationExercise } from '@/lib/types';

export interface BuildWorkoutRecommendationInput {
  preferences: WorkoutPreferences;
  profileGoal: Goal | null;
  profileActivity?: ActivityLevel | null;
  asOf?: string;
  exercises: Exercise[];
  recentSets: RecommendationRecentSet[];
  painRegions: string[];
  activeCoachTemplate: WorkoutTemplate | null;
}

const GOAL_MUSCLES: Record<Goal, MuscleGroup[]> = {
  muscle_gain: ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders'], fat_loss: ['full_body', 'quads', 'back', 'chest', 'cardio'],
  maintenance: ['full_body', 'back', 'chest', 'quads', 'core'], recomp: ['full_body', 'quads', 'back', 'chest', 'glutes'],
  endurance: ['cardio', 'quads', 'hamstrings', 'glutes', 'core'], health: ['full_body', 'back', 'quads', 'core', 'cardio'],
};
const REGION_ALIASES: Record<string, string> = {
  shoulder: 'shoulders', shoulders: 'shoulders', delt: 'shoulders', delts: 'shoulders', 'lower back': 'back', 'upper back': 'back', lumbar: 'back', lat: 'back', lats: 'back',
  pec: 'chest', pecs: 'chest', quadricep: 'quads', quadriceps: 'quads', hamstring: 'hamstrings', calf: 'calves', bicep: 'biceps', tricep: 'triceps', abs: 'core', abdominals: 'core',
};

function normalized(value: string | null | undefined) {
  const region = (value ?? '').trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\b(left|right|bilateral|both)\b/g, '').replace(/\s+/g, ' ').trim();
  return REGION_ALIASES[region] ?? region;
}
function isEquipmentCompatible(exercise: Exercise, preferences: WorkoutPreferences) {
  const equipment = normalized(exercise.equipment);
  return equipment === '' || equipment === 'bodyweight' || preferences.equipment.includes(equipment as WorkoutPreferences['equipment'][number]);
}
function hasPainConflict(exercise: Exercise, painRegions: Set<string>) {
  return [exercise.muscle_group, ...(exercise.secondary_muscles ?? []), ...(exercise.anatomy_activations ?? [])].map(normalized).some((region) => painRegions.has(region));
}
function maxExerciseCount(duration: WorkoutPreferences['durationMinutes'], activity: ActivityLevel | null | undefined) {
  const cap = Math.min(6, Math.max(1, Math.floor(duration / 8)));
  return activity === 'sedentary' ? Math.max(1, cap - 1) : cap;
}
function targets(experience: WorkoutPreferences['experience']) {
  return experience === 'beginner' ? { targetSets: 2, targetReps: '8-12' } : experience === 'advanced' ? { targetSets: 4, targetReps: '6-12' } : { targetSets: 3, targetReps: '8-12' };
}
function draft(exercise: Exercise, target: Pick<TemplateExercise, 'target_sets' | 'target_reps' | 'target_rpe'>): WorkoutRecommendationExercise {
  return { exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscle_group, equipment: exercise.equipment, targetSets: target.target_sets, targetReps: target.target_reps, ...(target.target_rpe !== undefined && { targetRpe: target.target_rpe }) };
}
function summarize(source: WorkoutRecommendation['source'], reasons: string[], exercises: WorkoutRecommendationExercise[]): WorkoutRecommendation {
  const muscleDistribution: WorkoutRecommendation['muscleDistribution'] = {};
  for (const exercise of exercises) muscleDistribution[exercise.muscleGroup] = (muscleDistribution[exercise.muscleGroup] ?? 0) + exercise.targetSets;
  return { source, reasons, estimatedDurationMinutes: exercises.length * 8, equipment: [...new Set(exercises.map((item) => item.equipment).filter((item): item is string => Boolean(item)))], muscleDistribution, exercises };
}

/** Pure and side-effect-free: returns a reviewable draft, never a session. */
export function buildWorkoutRecommendation(input: BuildWorkoutRecommendationInput): WorkoutRecommendation {
  const painRegions = new Set(input.painRegions.map(normalized).filter(Boolean));
  const durationCap = maxExerciseCount(input.preferences.durationMinutes, null);
  const maxExercises = maxExerciseCount(input.preferences.durationMinutes, input.profileActivity);
  const byId = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));
  const equipmentExcluded = input.exercises.filter((exercise) => !isEquipmentCompatible(exercise, input.preferences));
  const painExcluded = input.exercises.filter((exercise) => isEquipmentCompatible(exercise, input.preferences) && hasPainConflict(exercise, painRegions));
  const compatible = (exercise: Exercise) => isEquipmentCompatible(exercise, input.preferences) && !hasPainConflict(exercise, painRegions);
  const filterReasons = [
    ...(equipmentExcluded.length ? ['Excluded exercises that need unavailable equipment.'] : []),
    ...(painExcluded.length ? [`Excluded exercises affecting painful regions: ${[...painRegions].sort().join(', ')}.`] : []),
  ];

  if (input.activeCoachTemplate) {
    const selected = input.activeCoachTemplate.exercises.map((target) => {
      const exercise = byId.get(target.exercise_id);
      return exercise && compatible(exercise) ? draft(exercise, target) : null;
    }).filter((item): item is WorkoutRecommendationExercise => item !== null).slice(0, maxExercises);
    const reasons = ['Built from the active coach template; no coach work was replaced.', ...filterReasons];
    if (selected.length < input.activeCoachTemplate.exercises.length && selected.length === maxExercises) reasons.push(`Limited draft to ${maxExercises} exercises for the ${input.preferences.durationMinutes}-minute duration target.`);
    return summarize('coach', reasons, selected);
  }

  const completedSets = input.recentSets.filter((set) => !set.isWarmup && (set.reps ?? 0) > 0);
  const asOf = Date.parse(input.asOf ?? '1970-01-01');
  const progression = new Map<string, number>();
  for (const set of completedSets) {
    const volume = (set.reps ?? 0) * Math.max(set.weightKg ?? 1, 1);
    const completedAt = set.completedOn ? Date.parse(set.completedOn) : Number.NaN;
    const daysAgo = Number.isFinite(asOf) && Number.isFinite(completedAt) ? Math.max(0, Math.floor((asOf - completedAt) / 86_400_000)) : 28;
    progression.set(set.exerciseId, (progression.get(set.exerciseId) ?? 0) + Math.min(50, volume) + Math.max(0, 28 - daysAgo));
  }
  const preferred = GOAL_MUSCLES[input.profileGoal ?? 'health'];
  const muscles = new Set<MuscleGroup>();
  const ranked = input.exercises.filter(compatible).sort((left, right) => {
    const score = (exercise: Exercise) => (progression.get(exercise.id) ?? 0) + (preferred.includes(exercise.muscle_group) ? 10 : 0) + (exercise.is_compound ? 1 : 0);
    if (score(right) !== score(left)) return score(right) - score(left);
    return left.name === right.name ? (left.id === right.id ? 0 : left.id < right.id ? -1 : 1) : left.name < right.name ? -1 : 1;
  }).filter((exercise) => {
    if (muscles.has(exercise.muscle_group)) return false;
    muscles.add(exercise.muscle_group);
    return true;
  });
  const selected = ranked.slice(0, maxExercises).map((exercise) => draft(exercise, { target_sets: targets(input.preferences.experience).targetSets, target_reps: targets(input.preferences.experience).targetReps }));
  const reasons = ['Draft ranked from goal, experience, available equipment, and completed-set history.', 'Kept one exercise per primary muscle group for a focused session.', ...filterReasons];
  if (completedSets.length) reasons.push('Used completed volume and recency as progression evidence.');
  if (ranked.length > maxExercises && maxExercises === durationCap) reasons.push(`Limited draft to ${maxExercises} exercises for the ${input.preferences.durationMinutes}-minute duration target.`);
  if (input.profileActivity === 'sedentary' && ranked.length > maxExercises) reasons.push('Reduced draft volume for a sedentary activity baseline.');
  return summarize('recommendation', reasons, selected);
}
