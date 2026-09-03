/**
 * Muscle-group labels + accent colors — shared by the workout landing page,
 * the exercise picker and guided mode. (Was a module-level const inside
 * app/dashboard/workout/page.tsx before the guided-training rebuild.)
 */

import type { MuscleGroup } from '@/lib/types';

export type WorkoutBodyArea =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'full_body'
  | 'cardio';

/**
 * The exercise library is intentionally introduced through eight familiar
 * body areas. Arms and legs progressively reveal their specific muscles only
 * after the user has expressed intent, keeping the first decision lightweight.
 */
export const WORKOUT_BODY_AREAS: {
  key: WorkoutBodyArea;
  muscles: MuscleGroup[];
}[] = [
  { key: 'chest', muscles: ['chest'] },
  { key: 'back', muscles: ['back'] },
  { key: 'shoulders', muscles: ['shoulders'] },
  { key: 'arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { key: 'core', muscles: ['core'] },
  { key: 'full_body', muscles: ['full_body'] },
  { key: 'cardio', muscles: ['cardio'] },
];

export function bodyAreaLabelKey(area: WorkoutBodyArea): string {
  return `workout.body_area_${area}`;
}

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string; color: string }[] = [
  { key: 'chest', label: 'Chest', color: 'var(--performance-coral)' },
  { key: 'back', label: 'Back', color: 'var(--performance-lime)' },
  { key: 'shoulders', label: 'Shoulders', color: 'var(--performance-orange)' },
  { key: 'biceps', label: 'Biceps', color: 'var(--performance-cyan)' },
  { key: 'triceps', label: 'Triceps', color: 'var(--performance-violet)' },
  { key: 'forearms', label: 'Forearms', color: 'var(--performance-cyan)' },
  { key: 'quads', label: 'Quads', color: 'var(--performance-lime)' },
  { key: 'hamstrings', label: 'Hamstrings', color: 'var(--performance-orange)' },
  { key: 'glutes', label: 'Glutes', color: 'var(--performance-violet)' },
  { key: 'calves', label: 'Calves', color: 'var(--performance-cyan)' },
  { key: 'core', label: 'Core', color: 'var(--performance-violet)' },
  { key: 'full_body', label: 'Full Body', color: 'var(--performance-gold)' },
  { key: 'cardio', label: 'Cardio', color: 'var(--performance-coral)' },
];

export function muscleColor(group: string | null | undefined): string {
  return MUSCLE_GROUPS.find((m) => m.key === group)?.color ?? 'var(--content-muted)';
}

export function muscleLabel(group: string | null | undefined): string {
  return MUSCLE_GROUPS.find((m) => m.key === group)?.label ?? (group ?? '');
}

/** i18n key for a muscle group's translated label (see lib/i18n workout.muscle_*). */
export function muscleLabelKey(group: string | null | undefined): string {
  return group ? `workout.muscle_${group}` : 'workout.muscle_full_body';
}

/**
 * Display name for an exercise. Use a complete locale-specific name when the
 * exercise row has one, otherwise keep the canonical name as the whole fallback.
 */
export function exerciseDisplayName(
  ex: { name: string; name_es?: string | null; name_el?: string | null },
  lang: string,
): string {
  if (lang === 'es' && ex.name_es) return ex.name_es;
  if (lang === 'el' && ex.name_el) return ex.name_el;
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
