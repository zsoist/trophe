import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

type MediaTier = ExerciseMediaRecord['tier'];

export interface ExerciseMediaBadgeProps {
  tier?: MediaTier;
  media?: Pick<ExerciseMediaRecord, 'tier'>;
}

const TIER_COPY: Record<MediaTier, { label: string; detail: string }> = {
  'verified-technique': { label: 'Verified technique', detail: 'Exact movement and equipment demonstration' },
  'verified-anatomy': { label: 'Anatomy reference', detail: 'Curated muscle roles; not a technique demonstration' },
  'honest-fallback': { label: 'No exact demo yet', detail: 'Use the exercise cues and equipment details' },
};

export function ExerciseMediaBadge({ tier, media }: ExerciseMediaBadgeProps) {
  const resolvedTier = tier ?? media?.tier ?? 'honest-fallback';
  const copy = TIER_COPY[resolvedTier];
  return <span className={`exercise-media-badge exercise-media-badge--${resolvedTier}`} title={copy.detail}>{copy.label}</span>;
}

export default ExerciseMediaBadge;
