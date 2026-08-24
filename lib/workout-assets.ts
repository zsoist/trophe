export type BodyAreaId = 'chest' | 'shoulders' | 'arms' | 'back' | 'legs' | 'core' | 'full-body' | 'full_body' | 'cardio';

export interface ResolvedWorkoutAsset {
  src: string;
  kind: 'technique' | 'anatomy';
  fit: 'contain';
  background: 'neutral';
}

const exerciseAssets: Array<{ matches: RegExp; slug: string }> = [
  // Keep aliases exact and most-specific first: similar names often use materially
  // different equipment or technique and must fall back to honest anatomy art.
  { matches: /^(?:incline dumbbell press|dumbbell incline press)$/, slug: 'incline-press' },
  { matches: /^(?:barbell bench press|bench press)$/, slug: 'bench-press' },
  { matches: /^(?:standing overhead barbell press|barbell overhead press|overhead press)$/, slug: 'overhead-press' },
  { matches: /^(?:pec deck machine|pec deck|chest fly machine)$/, slug: 'pec-deck' },
  { matches: /^(?:standing cable chest fly|cable chest fly|cable fly)$/, slug: 'cable-fly' },
  { matches: /^pull ups?$/, slug: 'pull-up' },
  { matches: /^(?:conventional deadlift|barbell deadlift|deadlift)$/, slug: 'deadlift' },
  { matches: /^(?:barbell back squat|back squat|barbell squat|squat)$/, slug: 'squat' },
  { matches: /^(?:parallel bar chest dips?|chest dips?|dips?)$/, slug: 'dip' },
  { matches: /^seated cable row$/, slug: 'row' },
  { matches: /^(?:standing dumbbell biceps curl|dumbbell biceps curl|dumbbell curl)$/, slug: 'curl' },
  { matches: /^(?:cable triceps rope extension|triceps rope extension|rope triceps pushdown|triceps pushdown|tricep pushdown)$/, slug: 'triceps-extension' },
];

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
  bodyArea,
  muscleGroup,
}: {
  exerciseName?: string | null;
  bodyArea?: BodyAreaId | null;
  muscleGroup?: AnatomyGroup | null;
}): ResolvedWorkoutAsset {
  const normalizedName = normalize(exerciseName ?? '');
  const named = exerciseAssets.find(({ matches }) => matches.test(normalizedName));
  if (named) {
    return {
      src: `/workout/exercises/${named.slug}.webp`,
      kind: 'technique',
      fit: 'contain',
      background: 'neutral',
    };
  }

  const fallback = anatomyArea(muscleGroup ?? bodyArea);
  return {
    src: `/workout/body-areas/${fallback}.webp`,
    kind: 'anatomy',
    fit: 'contain',
    background: 'neutral',
  };
}
