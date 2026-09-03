import type {
  Exercise,
  Goal,
  MuscleGroup,
  TemplateExercise,
  WorkoutRecommendation,
  WorkoutRecommendationExercise,
  WorkoutPreferences,
  WorkoutTemplate,
} from '@/lib/types';

export interface RecommendationRecentSet {
  exerciseId: string;
  reps: number | null;
  isWarmup: boolean;
}

export type { WorkoutRecommendation, WorkoutRecommendationExercise } from '@/lib/types';

export interface BuildWorkoutRecommendationInput {
  preferences: WorkoutPreferences;
  profileGoal: Goal | null;
  exercises: Exercise[];
  recentSets: RecommendationRecentSet[];
  painRegions: string[];
  activeCoachTemplate: WorkoutTemplate | null;
}

const GOAL_MUSCLES: Record<Goal, MuscleGroup[]> = {
  muscle_gain: ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders'],
  fat_loss: ['full_body', 'quads', 'back', 'chest', 'cardio'],
  maintenance: ['full_body', 'back', 'chest', 'quads', 'core'],
  recomp: ['full_body', 'quads', 'back', 'chest', 'glutes'],
  endurance: ['cardio', 'quads', 'hamstrings', 'glutes', 'core'],
  health: ['full_body', 'back', 'quads', 'core', 'cardio'],
};

function normalized(value: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function isEquipmentCompatible(exercise: Exercise, preferences: WorkoutPreferences) {
  const equipment = normalized(exercise.equipment);
  return equipment === '' || equipment === 'bodyweight' || preferences.equipment.includes(equipment as WorkoutPreferences['equipment'][number]);
}

function hasPainConflict(exercise: Exercise, painRegions: Set<string>) {
  return painRegions.has(normalized(exercise.muscle_group));
}

function maxExerciseCount(durationMinutes: WorkoutPreferences['durationMinutes']) {
  return Math.min(6, Math.max(1, Math.floor(durationMinutes / 8)));
}

function defaultTargets(experience: WorkoutPreferences['experience']) {
  if (experience === 'beginner') return { targetSets: 2, targetReps: '8-12' };
  if (experience === 'advanced') return { targetSets: 4, targetReps: '6-12' };
  return { targetSets: 3, targetReps: '8-12' };
}

function toDraftExercise(exercise: Exercise, target: Pick<TemplateExercise, 'target_sets' | 'target_reps' | 'target_rpe'>): WorkoutRecommendationExercise {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscle_group,
    equipment: exercise.equipment,
    targetSets: target.target_sets,
    targetReps: target.target_reps,
    ...(target.target_rpe !== undefined && { targetRpe: target.target_rpe }),
  };
}

function summarize(source: WorkoutRecommendation['source'], reasons: string[], exercises: WorkoutRecommendationExercise[]) {
  const muscleDistribution: WorkoutRecommendation['muscleDistribution'] = {};
  for (const exercise of exercises) {
    muscleDistribution[exercise.muscleGroup] = (muscleDistribution[exercise.muscleGroup] ?? 0) + exercise.targetSets;
  }
  return {
    source,
    reasons,
    estimatedDurationMinutes: exercises.length * 8,
    equipment: [...new Set(exercises.map((exercise) => exercise.equipment).filter((equipment): equipment is string => Boolean(equipment)))],
    muscleDistribution,
    exercises,
  } satisfies WorkoutRecommendation;
}

/**
 * Pure, deterministic ranking: its result is a reviewable draft and has no
 * database or session side effects. A current coach template always wins.
 */
export function buildWorkoutRecommendation(input: BuildWorkoutRecommendationInput): WorkoutRecommendation {
  const painRegions = new Set(input.painRegions.map(normalized).filter(Boolean));
  const maxExercises = maxExerciseCount(input.preferences.durationMinutes);
  const byId = new Map(input.exercises.map((exercise) => [exercise.id, exercise]));
  const compatible = (exercise: Exercise) => isEquipmentCompatible(exercise, input.preferences) && !hasPainConflict(exercise, painRegions);
  const painReason = painRegions.size ? `Excluded exercises affecting painful regions: ${[...painRegions].sort().join(', ')}.` : null;

  if (input.activeCoachTemplate) {
    const selected = input.activeCoachTemplate.exercises
      .map((target) => {
        const exercise = byId.get(target.exercise_id);
        return exercise && compatible(exercise) ? toDraftExercise(exercise, target) : null;
      })
      .filter((exercise): exercise is WorkoutRecommendationExercise => exercise !== null)
      .slice(0, maxExercises);
    const reasons = ['Built from the active coach template; no coach work was replaced.'];
    if (painReason) reasons.push(painReason);
    if (selected.length < input.activeCoachTemplate.exercises.length) reasons.push('Some coach-template exercises need review because of equipment or pain constraints.');
    return summarize('coach', reasons, selected);
  }

  const recentSuccessfulIds = new Set(
    input.recentSets.filter((set) => !set.isWarmup && (set.reps ?? 0) > 0).map((set) => set.exerciseId),
  );
  const preferredMuscles = GOAL_MUSCLES[input.profileGoal ?? 'health'];
  const selectedMuscles = new Set<MuscleGroup>();
  const target = defaultTargets(input.preferences.experience);
  const selected = input.exercises
    .filter(compatible)
    .sort((left, right) => {
      const score = (exercise: Exercise) =>
        (recentSuccessfulIds.has(exercise.id) ? 100 : 0) +
        (preferredMuscles.indexOf(exercise.muscle_group) === -1 ? 0 : 10) +
        (exercise.is_compound ? 1 : 0);
      if (score(right) !== score(left)) return score(right) - score(left);
      if (left.name !== right.name) return left.name < right.name ? -1 : 1;
      return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
    })
    .filter((exercise) => {
      if (selectedMuscles.has(exercise.muscle_group)) return false;
      selectedMuscles.add(exercise.muscle_group);
      return true;
    })
    .slice(0, maxExercises)
    .map((exercise) => toDraftExercise(exercise, {
      target_sets: target.targetSets,
      target_reps: target.targetReps,
    }));
  const reasons = [
    'Draft ranked from goal, experience, available equipment, and completed-set history.',
    'Kept one exercise per primary muscle group for a focused session.',
  ];
  if (recentSuccessfulIds.size) reasons.push('Preferred recently completed exercises to preserve progressive-overload evidence.');
  if (painReason) reasons.push(painReason);
  return summarize('recommendation', reasons, selected);
}
