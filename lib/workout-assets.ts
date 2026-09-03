export type BodyAreaId = 'chest' | 'shoulders' | 'arms' | 'back' | 'legs' | 'core' | 'full-body' | 'full_body' | 'cardio';

export interface ResolvedWorkoutAsset {
  src: string;
  kind: 'technique' | 'anatomy' | 'cardio';
  fit: 'contain';
  background: 'neutral';
  alpha: true;
}

const exerciseAssets: Array<{ matches: RegExp; equipment: RegExp; slug: string }> = [
  // Keep aliases exact and most-specific first: similar names often use materially
  // different equipment or technique and must fall back to honest anatomy art.
  { matches: /^(?:incline dumbbell press|dumbbell incline press)$/, equipment: /dumbbell/, slug: 'incline-press' },
  { matches: /^smith machine bench press$/, equipment: /(?:smith|machine)/, slug: 'smith-bench-press' },
  { matches: /^floor press$/, equipment: /barbell/, slug: 'floor-press' },
  { matches: /^(?:machine chest press|chest press machine)$/, equipment: /machine/, slug: 'machine-chest-press' },
  { matches: /^(?:push ups?|pushups?)$/, equipment: /bodyweight/, slug: 'push-up' },
  { matches: /^barbell bench press$/, equipment: /barbell/, slug: 'bench-press' },
  { matches: /^(?:standing overhead barbell press|standing barbell overhead press)$/, equipment: /barbell/, slug: 'overhead-press' },
  { matches: /^(?:pec deck machine|pec deck)$/, equipment: /machine/, slug: 'pec-deck' },
  { matches: /^standing cable chest fly$/, equipment: /cable/, slug: 'cable-fly' },
  { matches: /^pull ups?$/, equipment: /bodyweight/, slug: 'pull-up' },
  { matches: /^(?:conventional barbell deadlift|barbell conventional deadlift)$/, equipment: /barbell/, slug: 'deadlift' },
  { matches: /^(?:barbell back squat|back squat)$/, equipment: /barbell/, slug: 'squat' },
  { matches: /^(?:parallel bar chest dips?|chest dips?)$/, equipment: /bodyweight/, slug: 'dip' },
  { matches: /^seated cable row$/, equipment: /cable/, slug: 'row' },
  { matches: /^standing dumbbell biceps curl$/, equipment: /dumbbell/, slug: 'curl' },
  { matches: /^(?:cable triceps rope extension|cable rope triceps extension|rope triceps pushdown)$/, equipment: /cable/, slug: 'triceps-extension' },
];

function equipmentMatches(expected: RegExp, actual: string): boolean {
  if (!expected.test(actual)) return false;

  // A broad substring match (for example, a future alias containing both
  // "barbell" and "dumbbell") must not silently claim the wrong technique.
  // Keep this guard deliberately narrow: machine/cable combinations are valid
  // equipment descriptions, while barbell and dumbbell are alternatives.
  if (expected.test('barbell') && /dumbbell/.test(actual)) return false;
  if (expected.test('dumbbell') && /barbell/.test(actual)) return false;
  return true;
}

type AnatomyGroup = BodyAreaId | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

function anatomyArea(group?: AnatomyGroup | null): Exclude<BodyAreaId, 'full_body'> {
  if (group === 'biceps' || group === 'triceps' || group === 'forearms') return 'arms';
  if (group === 'quads' || group === 'hamstrings' || group === 'glutes' || group === 'calves') return 'legs';
  if (group === 'full_body') return 'full-body';
  return group ?? 'full-body';
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
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
  const normalizedName = normalize(exerciseName ?? '');
  const normalizedEquipment = normalize(equipment ?? '');
  const named = exerciseAssets.find(({ matches, equipment: expectedEquipment }) => (
    matches.test(normalizedName) && (!normalizedEquipment || equipmentMatches(expectedEquipment, normalizedEquipment))
  ));
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
