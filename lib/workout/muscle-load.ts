import type { AnatomyMuscleId, MuscleActivation, MuscleRole } from '@/lib/workout/anatomy';

export interface MuscleLoadSet {
  completed?: boolean;
  isWarmup?: boolean;
  is_warmup?: boolean;
}

export interface MuscleLoadInput {
  activations: MuscleActivation[];
  sets: MuscleLoadSet[];
}

export interface MuscleLoadExercise {
  activations: MuscleActivation[];
  sets: MuscleLoadSet[];
}

export type MuscleLoad = Record<string, number>;

const ROLE_WEIGHT: Record<MuscleRole, number> = {
  primary: 1,
  secondary: 0.5,
  stabilizer: 0.2,
};

/**
 * Calculate role-weighted set load. Incomplete sets do not contribute; a
 * warm-up contributes one quarter of the role's normal set weight.
 */
export function calculateMuscleLoad(input: MuscleLoadInput): MuscleLoad;
export function calculateMuscleLoad(activations: MuscleActivation[], sets: MuscleLoadSet[]): MuscleLoad;
export function calculateMuscleLoad(inputOrActivations: MuscleLoadInput | MuscleActivation[], setsArg?: MuscleLoadSet[]): MuscleLoad {
  const input: MuscleLoadInput = Array.isArray(inputOrActivations)
    ? { activations: inputOrActivations, sets: setsArg ?? [] }
    : inputOrActivations;
  const load: MuscleLoad = {};

  for (const item of input.activations) {
    // Keep every resolved muscle in the result so consumers can render an
    // explicit zero instead of treating absence as missing anatomy data.
    load[item.id] = 0;
  }

  for (const set of input.sets) {
    if (set.completed !== true) continue;
    const warmup = set.isWarmup ?? set.is_warmup ?? false;
    const setScale = warmup ? 0.25 : 1;
    for (const item of input.activations) {
      load[item.id] = (load[item.id] ?? 0) + ROLE_WEIGHT[item.role] * setScale;
    }
  }

  return load;
}

/** Combine load from multiple exercises without losing zero-valued muscles. */
export function calculateCombinedMuscleLoad(exercises: MuscleLoadExercise[]): MuscleLoad {
  return exercises.reduce<MuscleLoad>((combined, exercise) => {
    const next = calculateMuscleLoad(exercise);
    for (const [id, value] of Object.entries(next) as Array<[AnatomyMuscleId, number]>) {
      combined[id] = (combined[id] ?? 0) + value;
    }
    return combined;
  }, {});
}
