import type { MuscleGroup } from '@/lib/types';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

export interface RoutineExerciseMetadata {
  id: string;
  name: string;
  muscle_group?: MuscleGroup | null;
  equipment?: string | null;
}

interface WorkoutTemplateWriter {
  from(table: 'workout_templates'): {
    insert(payload: Record<string, unknown>): {
      select(columns: string): {
        maybeSingle(): PromiseLike<{
          data: { id: string; name: string } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
}

export interface SavedWorkoutRoutine {
  id: string;
  name: string;
}

export async function saveWorkoutRoutine(
  client: WorkoutTemplateWriter,
  ownerId: string,
  draft: WorkoutDraft,
  exerciseMetadata: RoutineExerciseMetadata[],
): Promise<SavedWorkoutRoutine> {
  if (!ownerId.trim()) throw new Error('An authenticated workout owner is required');
  if (draft.kind !== 'strength') throw new Error('Only strength drafts can be saved as routines');
  const name = draft.name.trim();
  if (!name) throw new Error('A workout name is required');
  if (draft.exercises.length === 0) throw new Error('At least one exercise is required');

  const metadata = new Map(exerciseMetadata.map((exercise) => [exercise.id, exercise]));
  const targetMuscles = [...new Set(draft.exercises
    .map((exercise) => exercise.muscleGroup ?? metadata.get(exercise.exerciseId)?.muscle_group)
    .filter((muscle): muscle is MuscleGroup => Boolean(muscle)))];

  const { data, error } = await client
    .from('workout_templates')
    .insert({
      created_by: ownerId,
      name,
      description: null,
      target_muscles: targetMuscles.length > 0 ? targetMuscles : null,
      exercises: draft.exercises.map((exercise) => ({
        exercise_id: exercise.exerciseId,
        target_sets: exercise.targetSets,
        target_reps: exercise.targetReps,
      })),
      difficulty: 'intermediate',
      shared: false,
    })
    .select('id, name')
    .maybeSingle();

  if (error) throw new Error(error.message || 'Workout routine could not be saved');
  if (!data) throw new Error('Workout routine save returned no record');
  return data;
}
