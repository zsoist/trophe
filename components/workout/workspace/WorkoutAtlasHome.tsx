'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import { useI18n } from '@/lib/i18n';
import { anatomyLabelKey, type AnatomyMuscleId, type MuscleActivation } from '@/lib/workout/anatomy';

interface WorkoutAtlasHomeProps {
  activations: MuscleActivation[];
  targetLabel: string;
  emptyState?: 'strength' | 'cardio';
  action?: ReactNode;
}

const ROLE_TARGET_KEYS = {
  primary: 'workout.atlas_primary_target',
  secondary: 'workout.atlas_supporting_target',
  stabilizer: 'workout.atlas_stabilizing_target',
} as const;

const activationRoleKey = (activation: MuscleActivation) => activation.confidence === 'group'
  ? 'workout.atlas_role_group_label'
  : ROLE_TARGET_KEYS[activation.role];

export function WorkoutAtlasHome({ activations, targetLabel, emptyState = 'strength', action }: WorkoutAtlasHomeProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(() => activations[0]?.id ?? null);
  const appliedSelected = activations.some((activation) => activation.id === selected) ? selected : activations[0]?.id ?? null;
  const selectedActivation = activations.find((activation) => activation.id === appliedSelected) ?? null;

  return (
    <section aria-labelledby="workout-target-title" className="workout-atlas-home rounded-[16px] bg-[var(--workout-surface-raised)] p-3.5 shadow-[var(--shadow-low)]">
      <div className="workout-atlas-home__heading mb-2.5">
        <h2 id="workout-target-title" className="text-base font-bold tracking-[-0.02em] text-[var(--content-primary)]">{t('workout.atlas_today_target')}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--content-secondary)]">{targetLabel}</p>
      </div>
      <MuscleAtlas activations={activations} selected={appliedSelected} onSelect={setSelected} compact homeCompact />
      {selectedActivation ? <p role="status" className="workout-atlas-home__selection">{t(anatomyLabelKey(selectedActivation))}{' · '}{t(activationRoleKey(selectedActivation))}</p> : <p className="workout-atlas-home__selection">{t(emptyState === 'cardio' ? 'workout.atlas_empty_cardio' : 'workout.atlas_empty_strength')}</p>}
      {action ? <div className="workout-atlas-home__action">{action}</div> : null}
    </section>
  );
}
