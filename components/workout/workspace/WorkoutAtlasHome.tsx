'use client';

import { useState } from 'react';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { AnatomyMuscleId, MuscleActivation } from '@/lib/workout/anatomy';

interface WorkoutAtlasHomeProps {
  activations: MuscleActivation[];
  targetLabel: string;
  emptyDescription?: string;
}

export function WorkoutAtlasHome({ activations, targetLabel, emptyDescription = 'Add strength exercises to see their muscle roles.' }: WorkoutAtlasHomeProps) {
  const [selected, setSelected] = useState<AnatomyMuscleId | null>(() => activations[0]?.id ?? null);
  const appliedSelected = activations.some((activation) => activation.id === selected) ? selected : activations[0]?.id ?? null;
  const selectedActivation = activations.find((activation) => activation.id === appliedSelected) ?? null;

  return (
    <section aria-labelledby="workout-target-title" className="rounded-[16px] bg-[var(--workout-surface-raised)] p-3.5 shadow-[var(--shadow-low)]">
      <div className="mb-2.5">
        <h2 id="workout-target-title" className="text-base font-bold tracking-[-0.02em] text-[var(--content-primary)]">Today&apos;s target</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--content-secondary)]">{targetLabel}</p>
      </div>
      <MuscleAtlas activations={activations} selected={appliedSelected} onSelect={setSelected} compact homeCompact />
      {selectedActivation ? <p role="status" className="mt-2 border-t border-[var(--workout-rail)] pt-2.5 text-xs font-medium text-[var(--content-primary)]">{selectedActivation.label}{' · '}{selectedActivation.role === 'primary' ? 'Primary target' : selectedActivation.role === 'secondary' ? 'Supporting target' : 'Stabilizing target'}</p> : <p className="mt-2 border-t border-[var(--workout-rail)] pt-2.5 text-xs leading-5 text-[var(--content-secondary)]">{emptyDescription}</p>}
    </section>
  );
}
