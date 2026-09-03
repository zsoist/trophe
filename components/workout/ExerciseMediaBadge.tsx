import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';
import { useI18n } from '@/lib/i18n';

type MediaTier = ExerciseMediaRecord['tier'];

export interface ExerciseMediaBadgeProps {
  tier?: MediaTier;
  media?: Pick<ExerciseMediaRecord, 'tier' | 'motionSrc'>;
}

const TIER_COPY_KEYS: Record<MediaTier, { label: string; detail: string }> = {
  'verified-technique': { label: 'workout.media_verified_technique', detail: 'workout.media_verified_technique_detail' },
  'verified-anatomy': { label: 'workout.media_anatomy_reference', detail: 'workout.media_anatomy_reference_detail' },
  'honest-fallback': { label: 'workout.media_no_exact_demo', detail: 'workout.media_no_exact_demo_detail' },
};

export function ExerciseMediaBadge({ tier, media }: ExerciseMediaBadgeProps) {
  const { t } = useI18n();
  const resolvedTier = media?.tier ?? tier ?? 'honest-fallback';
  const displayTier = resolvedTier === 'verified-technique' && !media?.motionSrc ? 'honest-fallback' : resolvedTier;
  const copy = TIER_COPY_KEYS[displayTier];
  return <span className={`exercise-media-badge exercise-media-badge--${displayTier}`} title={t(copy.detail)}>{t(copy.label)}</span>;
}

export default ExerciseMediaBadge;
