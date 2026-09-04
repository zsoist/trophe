import type { MuscleGroup } from '@/lib/types';

/** Stable ids used by the front/back muscle atlas. */
export type AnatomyMuscleId =
  | 'pectoralis-major'
  | 'serratus-anterior'
  | 'anterior-deltoid'
  | 'middle-deltoid'
  | 'posterior-deltoid'
  | 'rotator-cuff'
  | 'upper-trapezius'
  | 'lower-trapezius'
  | 'latissimus-dorsi'
  | 'rhomboids'
  | 'erector-spinae'
  | 'biceps-brachii'
  | 'triceps-brachii'
  | 'brachialis'
  | 'forearm-flexors'
  | 'forearm-extensors'
  | 'rectus-abdominis'
  | 'obliques'
  | 'gluteus-maximus'
  | 'gluteus-medius'
  | 'quadriceps'
  | 'hamstrings'
  | 'adductors'
  | 'gastrocnemius'
  | 'soleus'
  | 'tibialis-anterior';

export type MuscleRole = 'primary' | 'secondary' | 'stabilizer';
export type AnatomyView = 'front' | 'back';

/**
 * How much an activation may claim.
 * - `curated`: a reviewed, per-exercise named-muscle role from CURATED_MUSCLE_ACTIVATIONS.
 * - `group`: a stand-in region for the seeded muscle group only. It highlights the trained
 *   area and must be labelled with the group name, never as a specific primary muscle.
 */
export type AnatomyConfidence = 'curated' | 'group';

interface MuscleActivationBase {
  id: AnatomyMuscleId;
  label: string;
  role: MuscleRole;
  view: AnatomyView;
}

/**
 * Anatomy claims are discriminated so a group estimate cannot exist without
 * its group label, and curated muscle roles cannot accidentally carry one.
 */
export type MuscleActivation =
  | (MuscleActivationBase & { confidence: 'curated'; group?: never })
  | (MuscleActivationBase & { confidence: 'group'; group: MuscleGroup | string; role: 'primary' });

export interface AnatomyExerciseInput {
  name?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  muscleGroup?: MuscleGroup | string | null;
  muscle_group?: MuscleGroup | string | null;
}

/** Canonical display side, kept lightweight for non-visual anatomy consumers. */
const ATLAS_MUSCLE_VIEWS: Record<AnatomyMuscleId, AnatomyView> = {
  'pectoralis-major': 'front', 'serratus-anterior': 'front', 'anterior-deltoid': 'front', 'middle-deltoid': 'front',
  'posterior-deltoid': 'back', 'rotator-cuff': 'back', 'upper-trapezius': 'back', 'lower-trapezius': 'back',
  'latissimus-dorsi': 'back', rhomboids: 'back', 'erector-spinae': 'back', 'biceps-brachii': 'front',
  'triceps-brachii': 'back', brachialis: 'front', 'forearm-flexors': 'back', 'forearm-extensors': 'back',
  'rectus-abdominis': 'front', obliques: 'front', 'gluteus-maximus': 'back', 'gluteus-medius': 'back',
  quadriceps: 'front', hamstrings: 'back', adductors: 'front', gastrocnemius: 'back', soleus: 'back',
  'tibialis-anterior': 'front',
};

const activation = (id: AnatomyMuscleId, role: MuscleRole, view: AnatomyView): MuscleActivation => {
  void view;
  return { id, label: MUSCLE_LABELS[id], role, view: ATLAS_MUSCLE_VIEWS[id], confidence: 'curated' };
};

/** English group names for estimate labels; UI localizes through `workout.muscle_*`. */
const GROUP_LABELS: Partial<Record<MuscleGroup | string, string>> = {
  chest: 'Chest', shoulders: 'Shoulders', back: 'Back', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
};

/**
 * A muscle-group estimate: the atlas region that best stands for the seeded group.
 * The role stays `primary` so load weighting treats the group as the main target,
 * but the claim is explicitly group-level and is never persisted as anatomy.
 */
const groupEstimate = (group: MuscleGroup | string, id: AnatomyMuscleId): MuscleActivation => ({
  id, label: GROUP_LABELS[group] ?? MUSCLE_LABELS[id], role: 'primary', view: ATLAS_MUSCLE_VIEWS[id], confidence: 'group', group,
});

const MUSCLE_LABELS: Record<AnatomyMuscleId, string> = {
  'pectoralis-major': 'Pectoralis major',
  'serratus-anterior': 'Serratus anterior',
  'anterior-deltoid': 'Anterior deltoid',
  'middle-deltoid': 'Middle deltoid',
  'posterior-deltoid': 'Posterior deltoid',
  'rotator-cuff': 'Rotator cuff',
  'upper-trapezius': 'Upper trapezius',
  'lower-trapezius': 'Lower trapezius',
  'latissimus-dorsi': 'Latissimus dorsi',
  rhomboids: 'Rhomboids',
  'erector-spinae': 'Erector spinae',
  'biceps-brachii': 'Biceps brachii',
  'triceps-brachii': 'Triceps brachii',
  brachialis: 'Brachialis',
  'forearm-flexors': 'Forearm flexors',
  'forearm-extensors': 'Forearm extensors',
  'rectus-abdominis': 'Rectus abdominis',
  obliques: 'Obliques',
  'gluteus-maximus': 'Gluteus maximus',
  'gluteus-medius': 'Gluteus medius',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  gastrocnemius: 'Gastrocnemius',
  soleus: 'Soleus',
  'tibialis-anterior': 'Tibialis anterior',
};

/** Curated anatomy roles for the named technique cohort. */
export const CURATED_MUSCLE_ACTIVATIONS: Readonly<Record<string, MuscleActivation[]>> = {
  'bench-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('rotator-cuff', 'stabilizer', 'back'),
  ],
  'incline-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('rotator-cuff', 'stabilizer', 'back'),
  ],
  'smith-bench-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'floor-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'machine-chest-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'push-up': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('serratus-anterior', 'stabilizer', 'front'),
    activation('rectus-abdominis', 'stabilizer', 'front'),
  ],
  'overhead-press': [
    activation('anterior-deltoid', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('middle-deltoid', 'secondary', 'front'),
    activation('upper-trapezius', 'stabilizer', 'back'),
    activation('rotator-cuff', 'stabilizer', 'back'),
  ],
  'pec-deck': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'cable-fly': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'pull-up': [
    activation('latissimus-dorsi', 'primary', 'back'),
    activation('biceps-brachii', 'secondary', 'front'),
    activation('lower-trapezius', 'secondary', 'back'),
    activation('forearm-flexors', 'stabilizer', 'back'),
  ],
  deadlift: [
    activation('gluteus-maximus', 'primary', 'back'),
    activation('hamstrings', 'primary', 'back'),
    activation('erector-spinae', 'secondary', 'back'),
    activation('latissimus-dorsi', 'stabilizer', 'back'),
  ],
  squat: [
    activation('quadriceps', 'primary', 'front'),
    activation('gluteus-maximus', 'secondary', 'back'),
    activation('hamstrings', 'secondary', 'back'),
    activation('adductors', 'stabilizer', 'front'),
  ],
  dip: [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'back'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  row: [
    activation('latissimus-dorsi', 'primary', 'back'),
    activation('rhomboids', 'secondary', 'back'),
    activation('posterior-deltoid', 'secondary', 'back'),
    activation('biceps-brachii', 'secondary', 'front'),
    activation('erector-spinae', 'stabilizer', 'back'),
  ],
  curl: [
    activation('biceps-brachii', 'primary', 'front'),
    activation('brachialis', 'secondary', 'front'),
    activation('forearm-flexors', 'stabilizer', 'back'),
  ],
  'triceps-extension': [
    activation('triceps-brachii', 'primary', 'back'),
    activation('forearm-extensors', 'stabilizer', 'back'),
  ],
};

const normalize = (value: string): string => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Group-level estimates only. Each entry is the atlas region that stands for a
 * seeded muscle group; it is not a claim about which specific muscle is primary.
 */
const GROUP_ACTIVATIONS: Partial<Record<MuscleGroup | string, MuscleActivation[]>> = {
  chest: [groupEstimate('chest', 'pectoralis-major')],
  shoulders: [groupEstimate('shoulders', 'anterior-deltoid')],
  back: [groupEstimate('back', 'latissimus-dorsi')],
  biceps: [groupEstimate('biceps', 'biceps-brachii')],
  triceps: [groupEstimate('triceps', 'triceps-brachii')],
  forearms: [groupEstimate('forearms', 'forearm-flexors')],
  quads: [groupEstimate('quads', 'quadriceps')],
  hamstrings: [groupEstimate('hamstrings', 'hamstrings')],
  glutes: [groupEstimate('glutes', 'gluteus-maximus')],
  calves: [groupEstimate('calves', 'gastrocnemius')],
  core: [groupEstimate('core', 'rectus-abdominis')],
};

/**
 * Canonical names plus the exact seeded catalogue names (scripts/seed-exercises.js,
 * drizzle/0055). Seeded aliases are only listed where the seeded row's movement is
 * the curated one; equipment gating lives in exercise-media.ts. 'Cable Crossover'
 * is deliberately absent: a crossover is not the standing cable fly.
 */
const NAME_TO_SLUG: Array<{ names: string[]; slug: string }> = [
  { names: ['barbell bench press', 'bench press'], slug: 'bench-press' },
  { names: ['incline dumbbell press', 'dumbbell incline press'], slug: 'incline-press' },
  { names: ['smith machine bench press'], slug: 'smith-bench-press' },
  { names: ['floor press'], slug: 'floor-press' },
  { names: ['machine chest press', 'chest press machine'], slug: 'machine-chest-press' },
  { names: ['push ups', 'pushups'], slug: 'push-up' },
  { names: ['standing overhead barbell press', 'standing barbell overhead press', 'overhead press'], slug: 'overhead-press' },
  { names: ['pec deck machine', 'pec deck'], slug: 'pec-deck' },
  { names: ['standing cable chest fly'], slug: 'cable-fly' },
  { names: ['pull ups', 'pull up'], slug: 'pull-up' },
  { names: ['conventional barbell deadlift', 'barbell conventional deadlift', 'deadlift'], slug: 'deadlift' },
  { names: ['barbell back squat', 'back squat', 'squat'], slug: 'squat' },
  { names: ['parallel bar chest dips', 'chest dips'], slug: 'dip' },
  { names: ['seated cable row'], slug: 'row' },
  { names: ['standing dumbbell biceps curl', 'dumbbell curl'], slug: 'curl' },
  { names: ['cable triceps rope extension', 'cable rope triceps extension', 'rope triceps pushdown', 'tricep pushdown', 'triceps pushdown', 'rope pushdown'], slug: 'triceps-extension' },
];

export function slugForExerciseName(name: string): string | undefined {
  const normalized = normalize(name);
  return NAME_TO_SLUG.find(({ names }) => names.includes(normalized))?.slug;
}

/** Curated, reviewed roles only. Empty when the exercise has no curated entry. */
export function resolveCuratedMuscleActivations(input: AnatomyExerciseInput): MuscleActivation[] {
  const slug = slugForExerciseName(input.name ?? input.exerciseName ?? '');
  const curated = slug ? CURATED_MUSCLE_ACTIVATIONS[slug] : undefined;
  return (curated ?? []).map((item) => ({ ...item }));
}

/**
 * Resolve curated roles, falling back to a group-level estimate. Callers that
 * persist or reason about named muscles must use `resolveCuratedMuscleActivations`
 * or check `confidence`, because the fallback is only a trained-area estimate.
 */
export function resolveMuscleActivations(input: AnatomyExerciseInput): MuscleActivation[] {
  const curated = resolveCuratedMuscleActivations(input);
  if (curated.length) return curated;
  const group = input.muscleGroup ?? input.muscle_group;
  return ((group ? GROUP_ACTIVATIONS[group] : undefined) ?? []).map((item) => ({ ...item }));
}

/** i18n key for a group-estimate label; falls back to the named-muscle key for curated roles. */
export function anatomyLabelKey(activation: Pick<MuscleActivation, 'id' | 'confidence' | 'group'>): string {
  return activation.confidence === 'group' && activation.group
    ? `workout.muscle_${activation.group}`
    : `workout.atlas_muscle_${activation.id.replaceAll('-', '_')}`;
}

export function muscleLabel(id: AnatomyMuscleId): string {
  return MUSCLE_LABELS[id];
}
