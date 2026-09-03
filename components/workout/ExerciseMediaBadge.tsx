import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

type MediaTier = ExerciseMediaRecord['tier'];

export interface ExerciseMediaBadgeProps {
  tier?: MediaTier;
  media?: Pick<ExerciseMediaRecord, 'tier' | 'motionSrc'>;
}

const TIER_COPY: Record<MediaTier, { label: string; detail: string }> = {
  'verified-technique': { label: 'Verified technique', detail: 'Exact movement and equipment demonstration' },
  'verified-anatomy': { label: 'Anatomy reference', detail: 'Curated muscle roles; not a technique demonstration' },
  'honest-fallback': { label: 'No exact demo yet', detail: 'Use the exercise cues and equipment details' },
};

export function ExerciseMediaBadge({ tier, media }: ExerciseMediaBadgeProps) {
  const resolvedTier = media?.tier ?? tier ?? 'honest-fallback';
  const displayTier = resolvedTier === 'verified-technique' && !media?.motionSrc ? 'honest-fallback' : resolvedTier;
  const copy = TIER_COPY[displayTier];
  return <span className={`exercise-media-badge exercise-media-badge--${displayTier}`} title={copy.detail}>{copy.label}</span>;
}

export default ExerciseMediaBadge;
