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

export interface MuscleActivation {
  id: AnatomyMuscleId;
  label: string;
  role: MuscleRole;
  view: AnatomyView;
}

export interface AnatomyExerciseInput {
  name?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  muscleGroup?: MuscleGroup | string | null;
  muscle_group?: MuscleGroup | string | null;
}

const activation = (id: AnatomyMuscleId, role: MuscleRole, view: AnatomyView): MuscleActivation => ({
  id,
  label: MUSCLE_LABELS[id],
  role,
  view,
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
    activation('triceps-brachii', 'secondary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('rotator-cuff', 'stabilizer', 'back'),
  ],
  'incline-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
    activation('rotator-cuff', 'stabilizer', 'back'),
  ],
  'smith-bench-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'floor-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'machine-chest-press': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
  ],
  'push-up': [
    activation('pectoralis-major', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
    activation('anterior-deltoid', 'secondary', 'front'),
    activation('serratus-anterior', 'stabilizer', 'front'),
    activation('rectus-abdominis', 'stabilizer', 'front'),
  ],
  'overhead-press': [
    activation('anterior-deltoid', 'primary', 'front'),
    activation('triceps-brachii', 'secondary', 'front'),
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
    activation('forearm-flexors', 'stabilizer', 'front'),
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
    activation('triceps-brachii', 'secondary', 'front'),
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
    activation('forearm-flexors', 'stabilizer', 'front'),
  ],
  'triceps-extension': [
    activation('triceps-brachii', 'primary', 'front'),
    activation('forearm-extensors', 'stabilizer', 'front'),
  ],
};

const normalize = (value: string): string => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const GROUP_ACTIVATIONS: Partial<Record<MuscleGroup | string, MuscleActivation[]>> = {
  chest: [activation('pectoralis-major', 'primary', 'front')],
  shoulders: [activation('anterior-deltoid', 'primary', 'front')],
  back: [activation('latissimus-dorsi', 'primary', 'back')],
  biceps: [activation('biceps-brachii', 'primary', 'front')],
  triceps: [activation('triceps-brachii', 'primary', 'front')],
  forearms: [activation('forearm-flexors', 'primary', 'front')],
  quads: [activation('quadriceps', 'primary', 'front')],
  hamstrings: [activation('hamstrings', 'primary', 'back')],
  glutes: [activation('gluteus-maximus', 'primary', 'back')],
  calves: [activation('gastrocnemius', 'primary', 'back')],
  core: [activation('rectus-abdominis', 'primary', 'front')],
};

const NAME_TO_SLUG: Array<{ names: string[]; slug: string }> = [
  { names: ['barbell bench press'], slug: 'bench-press' },
  { names: ['incline dumbbell press', 'dumbbell incline press'], slug: 'incline-press' },
  { names: ['smith machine bench press'], slug: 'smith-bench-press' },
  { names: ['floor press'], slug: 'floor-press' },
  { names: ['machine chest press', 'chest press machine'], slug: 'machine-chest-press' },
  { names: ['push ups', 'pushups'], slug: 'push-up' },
  { names: ['standing overhead barbell press', 'standing barbell overhead press'], slug: 'overhead-press' },
  { names: ['pec deck machine', 'pec deck'], slug: 'pec-deck' },
  { names: ['standing cable chest fly'], slug: 'cable-fly' },
  { names: ['pull ups', 'pull up'], slug: 'pull-up' },
  { names: ['conventional barbell deadlift', 'barbell conventional deadlift'], slug: 'deadlift' },
  { names: ['barbell back squat', 'back squat'], slug: 'squat' },
  { names: ['parallel bar chest dips', 'chest dips'], slug: 'dip' },
  { names: ['seated cable row'], slug: 'row' },
  { names: ['standing dumbbell biceps curl'], slug: 'curl' },
  { names: ['cable triceps rope extension', 'cable rope triceps extension', 'rope triceps pushdown'], slug: 'triceps-extension' },
];

export function slugForExerciseName(name: string): string | undefined {
  const normalized = normalize(name);
  return NAME_TO_SLUG.find(({ names }) => names.includes(normalized))?.slug;
}

/** Resolve curated roles, falling back to a conservative primary muscle group. */
export function resolveMuscleActivations(input: AnatomyExerciseInput): MuscleActivation[] {
  const slug = slugForExerciseName(input.name ?? input.exerciseName ?? '');
  const curated = slug ? CURATED_MUSCLE_ACTIVATIONS[slug] : undefined;
  const group = input.muscleGroup ?? input.muscle_group;
  const selected = curated ?? (group ? GROUP_ACTIVATIONS[group] : undefined) ?? [];
  return selected.map((item) => ({ ...item }));
}

export function muscleLabel(id: AnatomyMuscleId): string {
  return MUSCLE_LABELS[id];
}
