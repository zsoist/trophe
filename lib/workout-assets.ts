export type BodyAreaId = 'chest' | 'shoulders' | 'arms' | 'back' | 'legs' | 'core' | 'full-body' | 'full_body' | 'cardio';

export interface ResolvedWorkoutAsset {
  src: string;
  kind: 'technique' | 'anatomy';
  fit: 'contain';
  background: 'neutral';
}

const exerciseAssets: Array<{ matches: RegExp; slug: string }> = [
  { matches: /\b(?:barbell\s+)?bench\s+press\b/, slug: 'bench-press' },
  { matches: /\bincline\b.*\bpress\b/, slug: 'incline-press' },
  { matches: /\b(?:overhead|shoulder|military)\b.*\bpress\b/, slug: 'overhead-press' },
  { matches: /\b(?:pec\s+deck|chest\s+fly\s+machine)\b/, slug: 'pec-deck' },
  { matches: /\b(?:cable\s+(?:cross(?:over)?|fly)|chest\s+cable\s+fly)\b/, slug: 'cable-fly' },
  { matches: /\b(?:pull\s*up|chin\s*up)\b/, slug: 'pull-up' },
  { matches: /\b(?:deadlift|romanian\s+deadlift|rdl)\b/, slug: 'deadlift' },
  { matches: /\b(?:squat|front\s+squat|goblet\s+squat)\b/, slug: 'squat' },
  { matches: /\b(?:dip|chest\s+dips|triceps\s+dips)\b/, slug: 'dip' },
  { matches: /\b(?:row|rowing)\b/, slug: 'row' },
  { matches: /\b(?:biceps?\s+)?curl\b/, slug: 'curl' },
  { matches: /\b(?:triceps?\s+(?:extension|pushdown)|skull\s*crusher)\b/, slug: 'triceps-extension' },
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
