'use client';

import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';
import { WorkoutDraftCoachControls } from './WorkoutDraftCoachControls';

/** Workout owns this entry so draft reviews share the exact persisted workspace provider. */
export function WorkoutCoachEntry() {
  return <GlobalCoachEntry contextSlot={props => <WorkoutDraftCoachControls {...props} />} />;
}
