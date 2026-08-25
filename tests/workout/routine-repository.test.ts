import { describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import { saveWorkoutRoutine } from '@/lib/workout/routine-repository';

const draft: WorkoutDraft = {
  version: 2,
  kind: 'strength',
  name: '  Push focus  ',
  updatedAt: 1,
  exercises: [
    { exerciseId: 'bench', targetSets: 4, targetReps: '6-8' },
    { exerciseId: 'press', targetSets: 3, targetReps: '8-10' },
  ],
};

function writer(result: { data: { id: string; name: string } | null; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ maybeSingle }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert, select, maybeSingle };
}

describe('saveWorkoutRoutine', () => {
  it('writes an owner-scoped workout template with the complete draft structure', async () => {
    const boundary = writer({ data: { id: 'routine-1', name: 'Push focus' }, error: null });

    const saved = await saveWorkoutRoutine(boundary.client, 'owner-1', draft, [
      { id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' },
      { id: 'press', name: 'Shoulder Press', muscle_group: 'shoulders', equipment: 'dumbbell' },
    ]);

    expect(saved).toEqual({ id: 'routine-1', name: 'Push focus' });
    expect(boundary.from).toHaveBeenCalledWith('workout_templates');
    expect(boundary.insert).toHaveBeenCalledWith({
      created_by: 'owner-1',
      name: 'Push focus',
      description: null,
      target_muscles: ['chest', 'shoulders'],
      exercises: [
        { exercise_id: 'bench', target_sets: 4, target_reps: '6-8' },
        { exercise_id: 'press', target_sets: 3, target_reps: '8-10' },
      ],
      difficulty: 'intermediate',
      shared: false,
    });
  });

  it('rejects the save when the database rejects the owner write', async () => {
    const boundary = writer({ data: null, error: { message: 'RLS denied insert' } });

    await expect(saveWorkoutRoutine(boundary.client, 'owner-1', draft, [])).rejects.toThrow('RLS denied insert');
  });

  it('does not misrepresent cardio as a reusable strength routine', async () => {
    const boundary = writer({ data: { id: 'never', name: 'Never' }, error: null });
    const cardio: WorkoutDraft = {
      version: 2,
      kind: 'cardio',
      name: 'Run',
      updatedAt: 1,
      activity: 'run',
      durationMinutes: 30,
      distanceKm: 5,
      effort: 7,
    };

    await expect(saveWorkoutRoutine(boundary.client, 'owner-1', cardio, [])).rejects.toThrow(/strength/i);
    expect(boundary.from).not.toHaveBeenCalled();
  });
});
