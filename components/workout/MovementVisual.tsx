import Image from 'next/image';
import { resolveWorkoutAsset, type BodyAreaId } from '@/lib/workout-assets';

interface MovementVisualProps {
  exerciseName?: string | null;
  bodyArea?: BodyAreaId | null;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function MovementVisual({
  exerciseName,
  bodyArea,
  alt,
  className = '',
  priority = false,
  sizes = '(max-width: 640px) 32vw, 160px',
}: MovementVisualProps) {
  const asset = resolveWorkoutAsset({ exerciseName, bodyArea });

  return (
    <Image
      src={asset.src}
      alt={alt}
      width={asset.kind === 'exercise' ? 480 : 320}
      height={asset.kind === 'exercise' ? 426 : 320}
      sizes={sizes}
      priority={priority}
      className={`movement-visual ${className}`}
    />
  );
}
