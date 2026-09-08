'use client';

import { useCallback, useState } from 'react';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';
import type { CoachContextSlot } from '@/components/assistant/GlobalCoach';
import type { PreferenceTransport } from '@/components/assistant/preference-state';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { hashWorkoutWorkspace } from '@/lib/workout/workspace-hash';
import { WorkoutDraftCoachControls } from './WorkoutDraftCoachControls';
import { useWorkoutWorkspace } from './WorkoutWorkspaceProvider';

function WorkoutDraftSlot(props: Parameters<CoachContextSlot>[0]) {
  const workspace = useWorkoutWorkspace();
  const [store] = useState(() => createPreferenceStore([{
    actorId: props.identity,
    subjectId: props.identity,
    organizationId: 'self-workout-workspace',
    preferences: { ...defaultWorkoutPreferences },
  }], { hash: hashWorkoutWorkspace, id: () => crypto.randomUUID() }));
  const transport = useCallback<PreferenceTransport>(async (operation, signal) => {
    const binding = store.bindWorkspace(props.identity, props.identity, workspace.state);
    return binding.ok ? store.execute(props.identity, operation, signal) : binding;
  }, [props.identity, store, workspace.state]);
  return <WorkoutDraftCoachControls {...props} transport={transport} allowDirectProposal />;
}

/** Workout owns this entry so draft reviews share the exact persisted workspace provider. */
export function WorkoutCoachEntry() {
  return <GlobalCoachEntry contextSlot={props => <WorkoutDraftSlot {...props} />} />;
}
