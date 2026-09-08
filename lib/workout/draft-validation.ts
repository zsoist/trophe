import type { WorkoutDraft } from './workspace-state';
import { isDraft } from './workspace-storage';

/** Shared lightweight boundary for browser and schema-backed draft actions. */
export function readWorkoutDraft(value: unknown): WorkoutDraft | null {
  try { return JSON.stringify(value).length <= 6000 && isDraft(value) ? value : null; }
  catch { return null; }
}
