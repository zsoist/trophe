import {
  CURATED_MUSCLE_ACTIVATIONS,
  resolveMuscleActivations,
  slugForExerciseName,
  type AnatomyExerciseInput,
  type MuscleActivation,
} from '@/lib/workout/anatomy';

export interface ExerciseMediaRecord {
  slug: string;
  canonicalNames: string[];
  equipment: string[];
  posterSrc: string;
  motionSrc?: string;
  motionType?: 'video/webm' | 'video/mp4';
  tier: 'verified-technique' | 'verified-anatomy' | 'honest-fallback';
  activations: MuscleActivation[];
  phases: Array<{ id: 'setup' | 'work' | 'finish'; label: string; cue: string }>;
  provenance: { kind: 'repo-vector' | 'generated' | 'sourced'; source: string; reviewedOn: string };
}

export type ExerciseMediaInput = AnatomyExerciseInput;

type MediaDefinition = {
  slug: string;
  canonicalNames: string[];
  equipment: string[];
};

/** The only movements for which the repository currently has exact technique art. */
export const EXERCISE_MEDIA_REGISTRY: ReadonlyArray<MediaDefinition> = [
  { slug: 'bench-press', canonicalNames: ['Barbell Bench Press'], equipment: ['Barbell'] },
  { slug: 'incline-press', canonicalNames: ['Incline Dumbbell Press', 'Dumbbell Incline Press'], equipment: ['Dumbbell'] },
  { slug: 'smith-bench-press', canonicalNames: ['Smith Machine Bench Press'], equipment: ['Smith Machine', 'Machine'] },
  { slug: 'floor-press', canonicalNames: ['Floor Press'], equipment: ['Barbell'] },
  { slug: 'machine-chest-press', canonicalNames: ['Machine Chest Press', 'Chest Press Machine'], equipment: ['Machine'] },
  { slug: 'push-up', canonicalNames: ['Push Ups', 'Pushups'], equipment: ['Bodyweight'] },
  { slug: 'overhead-press', canonicalNames: ['Standing Overhead Barbell Press', 'Standing Barbell Overhead Press'], equipment: ['Barbell'] },
  { slug: 'pec-deck', canonicalNames: ['Pec Deck Machine', 'Pec Deck'], equipment: ['Machine'] },
  { slug: 'cable-fly', canonicalNames: ['Standing Cable Chest Fly'], equipment: ['Cable'] },
  { slug: 'pull-up', canonicalNames: ['Pull Ups', 'Pull Up'], equipment: ['Bodyweight'] },
  { slug: 'deadlift', canonicalNames: ['Conventional Barbell Deadlift', 'Barbell Conventional Deadlift'], equipment: ['Barbell'] },
  { slug: 'squat', canonicalNames: ['Barbell Back Squat', 'Back Squat'], equipment: ['Barbell'] },
  { slug: 'dip', canonicalNames: ['Parallel Bar Chest Dips', 'Chest Dips'], equipment: ['Bodyweight'] },
  { slug: 'row', canonicalNames: ['Seated Cable Row'], equipment: ['Cable'] },
  { slug: 'curl', canonicalNames: ['Standing Dumbbell Biceps Curl'], equipment: ['Dumbbell'] },
  { slug: 'triceps-extension', canonicalNames: ['Cable Triceps Rope Extension', 'Cable Rope Triceps Extension', 'Rope Triceps Pushdown'], equipment: ['Cable'] },
];

/**
 * The generated V3 cohort is deliberately enumerated here rather than inferred
 * from a display filename. A movement may use this media only after the exact
 * canonical-name and equipment checks below succeed.
 */
const VERIFIED_V3_MEDIA = new Set(EXERCISE_MEDIA_REGISTRY.map(({ slug }) => slug));

const normalize = (value: string): string => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const EQUIPMENT_ALIASES: Record<string, string[]> = {
  barbell: ['barbell', 'olympic barbell', 'olympic bar'],
  dumbbell: ['dumbbell', 'dumbbells', 'pair of dumbbells'],
  cable: ['cable', 'cable machine'],
  machine: ['machine', 'weight machine'],
  'smith machine': ['smith machine', 'smith'],
  bodyweight: ['bodyweight', 'body weight', 'no equipment'],
};

const equipmentCompatible = (actual: string | null | undefined, expected: string[]): boolean => {
  if (!actual?.trim()) return false;
  const normalized = normalize(actual);
  return expected.some((candidate) => {
    const candidateKey = normalize(candidate);
    const aliases = EQUIPMENT_ALIASES[candidateKey] ?? [candidateKey];
    return aliases.some((alias) => normalize(alias) === normalized);
  });
};

function anatomyArea(group?: string | null): string {
  if (group === 'biceps' || group === 'triceps' || group === 'forearms') return 'arms';
  if (group === 'quads' || group === 'hamstrings' || group === 'glutes' || group === 'calves') return 'legs';
  if (group === 'full_body') return 'full-body';
  return group || 'full-body';
}

const phases = (): ExerciseMediaRecord['phases'] => [
  { id: 'setup', label: 'Setup', cue: 'Set your position and brace before moving.' },
  { id: 'work', label: 'Work', cue: 'Move with control through the full comfortable range.' },
  { id: 'finish', label: 'Finish', cue: 'Return to the start position and reset safely.' },
];

function recordFor(definition: MediaDefinition, tier: ExerciseMediaRecord['tier'], activations: MuscleActivation[], posterSrc: string): ExerciseMediaRecord {
  const usesVerifiedV3 = tier === 'verified-technique' && VERIFIED_V3_MEDIA.has(definition.slug);
  return {
    slug: definition.slug,
    canonicalNames: [...definition.canonicalNames],
    equipment: [...definition.equipment],
    posterSrc,
    ...(usesVerifiedV3 ? {
      motionSrc: `/workout-v3/motion/${definition.slug}.webm`,
      motionType: 'video/webm' as const,
    } : {}),
    tier,
    activations: activations.map((item) => ({ ...item })),
    phases: phases(),
    provenance: {
      kind: usesVerifiedV3 ? 'generated' : 'repo-vector',
      source: usesVerifiedV3
        ? `public/workout-v3/manifest.json#${definition.slug}`
        : 'public/workout-v2/manifest.json',
      reviewedOn: usesVerifiedV3 ? '2026-09-03' : '2026-09-02',
    },
  };
}

/**
 * Resolve a poster and anatomy contract. Technique is returned only when both
 * the canonical movement name and its equipment match the registry.
 */
export function resolveExerciseMedia(input: ExerciseMediaInput): ExerciseMediaRecord {
  const name = input.name ?? input.exerciseName ?? '';
  const definition = EXERCISE_MEDIA_REGISTRY.find((candidate) => (
    candidate.canonicalNames.some((candidateName) => normalize(candidateName) === normalize(name))
  ));
  const activations = resolveMuscleActivations(input);
  const group = input.muscleGroup ?? input.muscle_group;

  if (definition && equipmentCompatible(input.equipment, definition.equipment)) {
    return recordFor(
      definition,
      'verified-technique',
      activations.length ? activations : CURATED_MUSCLE_ACTIVATIONS[definition.slug] ?? [],
      VERIFIED_V3_MEDIA.has(definition.slug)
        ? `/workout-v3/posters/${definition.slug}.webp`
        : `/workout-v2/exercises/${definition.slug}.webp`,
    );
  }

  const area = anatomyArea(group);
  const fallbackDefinition: MediaDefinition = {
    slug: definition?.slug ?? 'honest-fallback',
    canonicalNames: definition?.canonicalNames ?? (name ? [name] : []),
    equipment: input.equipment ? [input.equipment] : [],
  };
  return recordFor(fallbackDefinition, activations.length ? 'verified-anatomy' : 'honest-fallback', activations, `/workout-v2/body-areas/${area}.webp`);
}

export { slugForExerciseName };
