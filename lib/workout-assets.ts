export type BodyAreaId = 'chest' | 'shoulders' | 'arms' | 'back' | 'legs' | 'core' | 'full-body' | 'full_body' | 'cardio';

interface WorkoutAsset {
  src: string;
  altKey: string;
  kind: 'exercise' | 'body-area';
}

const exerciseAssets: Array<{ matches: RegExp; slug: string; altKey: string }> = [
  { matches: /\b(?:barbell\s+)?bench\s+press\b/, slug: 'bench-press', altKey: 'bench_press' },
  { matches: /\bincline\b.*\bpress\b/, slug: 'incline-press', altKey: 'incline_press' },
  { matches: /\b(?:overhead|shoulder|military)\b.*\bpress\b/, slug: 'overhead-press', altKey: 'overhead_press' },
  { matches: /\b(?:pec\s+deck|chest\s+fly\s+machine)\b/, slug: 'pec-deck', altKey: 'pec_deck' },
  { matches: /\b(?:cable\s+(?:cross(?:over)?|fly)|chest\s+cable\s+fly)\b/, slug: 'cable-fly', altKey: 'cable_fly' },
  { matches: /\b(?:pull\s*up|chin\s*up)\b/, slug: 'pull-up', altKey: 'pull_up' },
  { matches: /\b(?:deadlift|romanian\s+deadlift|rdl)\b/, slug: 'deadlift', altKey: 'deadlift' },
  { matches: /\b(?:squat|front\s+squat|goblet\s+squat)\b/, slug: 'squat', altKey: 'squat' },
  { matches: /\b(?:dip|chest\s+dips|triceps\s+dips)\b/, slug: 'dip', altKey: 'dip' },
  { matches: /\b(?:row|rowing)\b/, slug: 'row', altKey: 'row' },
  { matches: /\b(?:biceps?\s+)?curl\b/, slug: 'curl', altKey: 'curl' },
  { matches: /\b(?:triceps?\s+(?:extension|pushdown)|skull\s*crusher)\b/, slug: 'triceps-extension', altKey: 'triceps_extension' },
];

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolveWorkoutAsset({
  exerciseName,
  bodyArea,
}: {
  exerciseName?: string | null;
  bodyArea?: BodyAreaId | null;
}): WorkoutAsset {
  const normalizedName = normalize(exerciseName ?? '');
  const named = exerciseAssets.find(({ matches }) => matches.test(normalizedName));
  if (named) {
    return {
      src: `/workout/exercises/${named.slug}.webp`,
      altKey: `workout.visual.${named.altKey}`,
      kind: 'exercise',
    };
  }

  const fallback = bodyArea === 'full_body' ? 'full-body' : bodyArea ?? 'full-body';
  return {
    src: `/workout/body-areas/${fallback}.webp`,
    altKey: `workout.body_area.${fallback.replace('-', '_')}`,
    kind: 'body-area',
  };
}
