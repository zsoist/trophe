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
