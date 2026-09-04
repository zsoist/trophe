/**
 * Muscle-group labels + accent colors — shared by the workout landing page,
 * the exercise picker and guided mode. (Was a module-level const inside
 * app/dashboard/workout/page.tsx before the guided-training rebuild.)
 */

import type { MuscleGroup, WorkoutEquipment } from '@/lib/types';

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
 * The single display-name resolver for exercises. Every surface that shows an
 * exercise name (picker, detail, build/review cards, live session, history,
 * analytics) must go through it so a user never sees two names for one movement.
 *
 * House rule: exercise names stay ENGLISH for Greek users (`name_el` is seeded
 * on some rows but is intentionally never displayed); Spanish users get
 * `name_es` when the row has one. Every other locale sees the canonical name.
 * Storage (drafts, routines, sessions) always keeps the canonical English name.
 */
export function exerciseDisplayName(
  ex: { name: string; name_es?: string | null; name_el?: string | null },
  lang: string,
): string {
  if (lang === 'es' && ex.name_es) return ex.name_es;
  return ex.name;
}

/** Every value of the `WorkoutEquipment` union, in display order. */
export const WORKOUT_EQUIPMENT_VALUES: readonly WorkoutEquipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'bench',
  'cardio',
];

function isWorkoutEquipment(value: string): value is WorkoutEquipment {
  return (WORKOUT_EQUIPMENT_VALUES as readonly string[]).includes(value);
}

/** i18n key for an equipment enum value (see lib/i18n workout.equipment_*). */
export function equipmentLabelKey(equipment: WorkoutEquipment): string {
  return `workout.equipment_${equipment}`;
}

/**
 * Localized label for an exercise's equipment. Null/undefined → the shared
 * "no equipment" copy. Unknown legacy values (custom exercises created before
 * the enum was enforced) fall back to a title-cased raw value rather than a
 * leaked translation key.
 */
export function equipmentLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  equipment: string | null | undefined,
): string {
  if (!equipment || !equipment.trim()) return t('workout.equipment_not_required');
  const normalized = equipment.trim().toLowerCase();
  if (isWorkoutEquipment(normalized)) return t(equipmentLabelKey(normalized));
  const raw = equipment.trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
