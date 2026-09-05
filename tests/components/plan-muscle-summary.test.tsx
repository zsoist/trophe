import { describe, expect, it } from 'vitest';
import { buildPlanEvidenceSummary } from '@/components/workout/workspace/PlanMuscleSummary';

describe('buildPlanEvidenceSummary', () => {
  it('reports missing named-muscle evidence for a group-only exercise', () => {
    const summary = buildPlanEvidenceSummary(
      [{ exerciseId: 'lateral', exerciseName: 'Lateral Raises', muscleGroup: 'shoulders', targetSets: 3, targetReps: '10' }],
      [{ id: 'lateral', name: 'Lateral Raises', muscle_group: 'shoulders', equipment: 'Dumbbell' }],
    );

    expect(summary.missingEvidenceCount).toBe(1);
    expect(summary.muscleLoads).toEqual([]);
  });
});
