import { findExerciseMediaDefinition } from '@/lib/workout/exercise-media';

export type BodyAreaId = 'chest' | 'shoulders' | 'arms' | 'back' | 'legs' | 'core' | 'full-body' | 'full_body' | 'cardio';

export interface ResolvedWorkoutAsset {
  src: string;
  kind: 'technique' | 'anatomy' | 'cardio';
  fit: 'contain';
  background: 'neutral';
  alpha: true;
}

type AnatomyGroup = BodyAreaId | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

function anatomyArea(group?: AnatomyGroup | null): Exclude<BodyAreaId, 'full_body'> {
  if (group === 'biceps' || group === 'triceps' || group === 'forearms') return 'arms';
  if (group === 'quads' || group === 'hamstrings' || group === 'glutes' || group === 'calves') return 'legs';
  if (group === 'full_body') return 'full-body';
  return group ?? 'full-body';
}

export function resolveWorkoutAsset({
  exerciseName,
  equipment,
  bodyArea,
  muscleGroup,
}: {
  exerciseName?: string | null;
  equipment?: string | null;
  bodyArea?: BodyAreaId | null;
  muscleGroup?: AnatomyGroup | null;
}): ResolvedWorkoutAsset {
  const named = findExerciseMediaDefinition(exerciseName ?? '', equipment);
  if (named) {
    return {
      src: `/workout-v2/exercises/${named.slug}.webp`,
      kind: 'technique',
      fit: 'contain',
      background: 'neutral',
      alpha: true,
    };
  }

  const fallback = anatomyArea(muscleGroup ?? bodyArea);
  return {
    src: `/workout-v2/body-areas/${fallback}.webp`,
    kind: fallback === 'cardio' ? 'cardio' : 'anatomy',
    fit: 'contain',
    background: 'neutral',
    alpha: true,
  };
}
