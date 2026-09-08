import type { CoachOperation } from '@/agents/coach-assistant/contracts';
import type { PreferenceStoreValidators } from '@/agents/coach-assistant/preference-store-core';
import type { WorkoutPreferences } from '@/lib/types';
import { readWorkoutDraft } from './draft-validation';

const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

function operation(value: unknown): CoachOperation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 'coach-assistant.v2' || !uuid(row.conversationId) || !uuid(row.turnId)) return null;
  if (row.operation === 'propose') {
    return exact(row, ['version', 'operation', 'conversationId', 'turnId', 'action', 'resourceVersion', 'after'])
      && row.action === 'draft.update' && hex(row.resourceVersion) && readWorkoutDraft(row.after)
      ? row as unknown as CoachOperation : null;
  }
  if (row.operation === 'apply') {
    return exact(row, ['version', 'operation', 'conversationId', 'turnId', 'proposalId', 'hash', 'actionId', 'resourceVersion'])
      && uuid(row.proposalId) && hex(row.hash) && uuid(row.actionId) && hex(row.resourceVersion)
      ? row as unknown as CoachOperation : null;
  }
  if (row.operation === 'receipt') {
    return exact(row, ['version', 'operation', 'conversationId', 'turnId', 'actionId']) && uuid(row.actionId)
      ? row as unknown as CoachOperation : null;
  }
  return null;
}

export const workoutDraftReviewPreferences: WorkoutPreferences = {
  version: 1, experience: 'beginner', equipment: ['bodyweight'], durationMinutes: 30, daysPerWeek: 3, location: 'both',
};

function preferences(value: unknown): WorkoutPreferences | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return exact(row, ['version', 'experience', 'equipment', 'durationMinutes', 'daysPerWeek', 'location'])
    && row.version === 1 && row.experience === 'beginner' && Array.isArray(row.equipment)
    && row.equipment.length === 1 && row.equipment[0] === 'bodyweight' && row.durationMinutes === 30
    && row.daysPerWeek === 3 && row.location === 'both' ? row as unknown as WorkoutPreferences : null;
}

export const workoutDraftReviewValidators: PreferenceStoreValidators = {
  operation,
  preferences,
  memory: () => null,
  draft: readWorkoutDraft,
};
