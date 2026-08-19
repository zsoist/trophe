/**
 * Muscle-group labels + accent colors — shared by the workout landing page,
 * the exercise picker and guided mode. (Was a module-level const inside
 * app/dashboard/workout/page.tsx before the guided-training rebuild.)
 */

import type { MuscleGroup } from '@/lib/types';

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string; color: string }[] = [
  { key: 'chest', label: 'Chest', color: '#ef4444' },
  { key: 'back', label: 'Back', color: '#3b82f6' },
  { key: 'shoulders', label: 'Shoulders', color: '#f59e0b' },
  { key: 'biceps', label: 'Biceps', color: '#10b981' },
  { key: 'triceps', label: 'Triceps', color: '#8b5cf6' },
  { key: 'forearms', label: 'Forearms', color: '#ec4899' },
  { key: 'quads', label: 'Quads', color: '#06b6d4' },
  { key: 'hamstrings', label: 'Hamstrings', color: '#f97316' },
  { key: 'glutes', label: 'Glutes', color: '#14b8a6' },
  { key: 'calves', label: 'Calves', color: '#a855f7' },
  { key: 'core', label: 'Core', color: '#eab308' },
  { key: 'full_body', label: 'Full Body', color: '#D4A853' },
  { key: 'cardio', label: 'Cardio', color: '#ef4444' },
];

export function muscleColor(group: string | null | undefined): string {
  return MUSCLE_GROUPS.find((m) => m.key === group)?.color ?? '#666';
}

export function muscleLabel(group: string | null | undefined): string {
  return MUSCLE_GROUPS.find((m) => m.key === group)?.label ?? (group ?? '');
}

/** i18n key for a muscle group's translated label (see lib/i18n workout.muscle_*). */
export function muscleLabelKey(group: string | null | undefined): string {
  return group ? `workout.muscle_${group}` : 'workout.muscle_full_body';
}

/**
 * Display name for an exercise. Gym exercise names deliberately stay in
 * ENGLISH for Greek users (Nik, 2026-08-19: "skull crushers" etc. read weird
 * transliterated — Greek gyms use the English terms). Spanish keeps its
 * localized names; form cues/instructions remain fully translated everywhere.
 */
export function exerciseDisplayName(
  ex: { name: string; name_es?: string | null },
  lang: string,
): string {
  if (lang === 'es' && ex.name_es) return ex.name_es;
  return ex.name;
}

/** Split presets for the quick-start flow ("chest & triceps day" → suggested list). */
export const WORKOUT_SPLITS: { key: string; muscles: MuscleGroup[] }[] = [
  { key: 'push', muscles: ['chest', 'shoulders', 'triceps'] },
  { key: 'pull', muscles: ['back', 'biceps', 'forearms'] },
  { key: 'legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { key: 'upper', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  { key: 'chest_tri', muscles: ['chest', 'triceps'] },
  { key: 'back_bi', muscles: ['back', 'biceps'] },
  { key: 'full', muscles: [] }, // empty = no filter
];
