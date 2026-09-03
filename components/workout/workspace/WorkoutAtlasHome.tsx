'use client';

import { useState } from 'react';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import { useI18n } from '@/lib/i18n';
import type { AnatomyMuscleId, MuscleActivation } from '@/lib/workout/anatomy';

interface WorkoutAtlasHomeProps {
  activations: MuscleActivation[];
  targetLabel: string;
  emptyState?: 'strength' | 'cardio';
}

const ROLE_TARGET_KEYS = {
  primary: 'workout.atlas_primary_target',
  secondary: 'workout.atlas_supporting_target',
  stabilizer: 'workout.atlas_stabilizing_target',
} as const;

const atlasMuscleLabelKey = (id: AnatomyMuscleId) => `workout.atlas_muscle_${id.replaceAll('-', '_')}`;

export function WorkoutAtlasHome({ activations, targetLabel, emptyState = 'strength' }: WorkoutAtlasHomeProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(() => activations[0]?.id ?? null);
  const appliedSelected = activations.some((activation) => activation.id === selected) ? selected : activations[0]?.id ?? null;
  const selectedActivation = activations.find((activation) => activation.id === appliedSelected) ?? null;

  return (
    <section aria-labelledby="workout-target-title" className="rounded-[16px] bg-[var(--workout-surface-raised)] p-3.5 shadow-[var(--shadow-low)]">
      <div className="mb-2.5">
        <h2 id="workout-target-title" className="text-base font-bold tracking-[-0.02em] text-[var(--content-primary)]">{t('workout.atlas_today_target')}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--content-secondary)]">{targetLabel}</p>
      </div>
      <MuscleAtlas activations={activations} selected={appliedSelected} onSelect={setSelected} compact homeCompact />
      {selectedActivation ? <p role="status" className="mt-2 border-t border-[var(--workout-rail)] pt-2.5 text-xs font-medium text-[var(--content-primary)]">{t(atlasMuscleLabelKey(selectedActivation.id))}{' · '}{t(ROLE_TARGET_KEYS[selectedActivation.role])}</p> : <p className="mt-2 border-t border-[var(--workout-rail)] pt-2.5 text-xs leading-5 text-[var(--content-secondary)]">{t(emptyState === 'cardio' ? 'workout.atlas_empty_cardio' : 'workout.atlas_empty_strength')}</p>}
    </section>
  );
}
