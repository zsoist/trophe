import Image from 'next/image';
import type { MuscleGroup } from '@/lib/types';
import { resolveWorkoutAsset, type BodyAreaId, type ResolvedWorkoutAsset } from '@/lib/workout-assets';

interface MovementVisualProps {
  exerciseName?: string | null;
  bodyArea?: BodyAreaId | null;
  muscleGroup?: MuscleGroup | null;
  asset?: ResolvedWorkoutAsset;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function MovementVisual({
  exerciseName,
  bodyArea,
  muscleGroup,
  asset: suppliedAsset,
  alt,
  className = '',
  priority = false,
  sizes = '(max-width: 640px) 32vw, 160px',
}: MovementVisualProps) {
  const asset = suppliedAsset ?? resolveWorkoutAsset({ exerciseName, bodyArea, muscleGroup });

  return (
    <Image
      src={asset.src}
      alt={alt}
      width={asset.kind === 'technique' ? 1280 : 640}
      height={asset.kind === 'technique' ? 853 : 960}
      sizes={sizes}
      priority={priority}
      data-visual-kind={asset.kind}
      style={{ objectFit: asset.fit, objectPosition: 'center', backgroundColor: 'var(--workout-visual-surface)' }}
      className={`movement-visual ${className}`}
    />
  );
}
