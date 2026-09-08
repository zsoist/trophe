import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import { actionOperationSchema, memoryCardSchema, coachDraftSchema } from './schema';
import { createPreferenceStoreCore, type FixtureScope, type PreferencePrimitives } from './preference-store-core';

export type { FixtureScope, PreferencePrimitives } from './preference-store-core';

/** Canonical isolated store with the full server-equivalent schema boundary. */
export function createPreferenceStore(fixtures: FixtureScope[], primitives: PreferencePrimitives, now: () => Date = () => new Date()) {
  return createPreferenceStoreCore(fixtures, primitives, {
    operation: value => actionOperationSchema.safeParse(value).data ?? null,
    preferences: value => workoutPreferencesSchema.safeParse(value).data ?? null,
    memory: value => memoryCardSchema.safeParse(value).data ?? null,
    draft: value => coachDraftSchema.safeParse(value).data ?? null,
  }, now);
}
