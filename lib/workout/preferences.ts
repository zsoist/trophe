import { z } from 'zod';
import type { WorkoutPreferences } from '@/lib/types';

export const workoutPreferencesSchema = z.object({
  version: z.literal(1),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  equipment: z.array(z.enum(['bodyweight', 'dumbbell', 'barbell', 'bench', 'cable', 'machine', 'cardio'])).min(1).max(7),
  durationMinutes: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  daysPerWeek: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  location: z.enum(['home', 'gym', 'both']),
}).strict();

export const defaultWorkoutPreferences: WorkoutPreferences = {
  version: 1,
  experience: 'beginner',
  equipment: ['bodyweight'],
  durationMinutes: 30,
  daysPerWeek: 3,
  location: 'both',
};

/** Returns safe defaults for the empty document supplied to pre-existing clients. */
export function parseWorkoutPreferences(value: unknown): WorkoutPreferences {
  const parsed = workoutPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultWorkoutPreferences;
}
