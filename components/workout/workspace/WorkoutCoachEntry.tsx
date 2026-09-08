'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';
import { useWorkoutWorkspace } from './WorkoutWorkspaceProvider';

const WorkoutDraftCoachSlot = lazy(() => import('./WorkoutDraftCoachSlot'));

/** Workout owns this entry so draft reviews share the exact persisted workspace provider. */
export function WorkoutCoachEntry() {
  const workspace = useWorkoutWorkspace();
  const [hashWorkspace, setHashWorkspace] = useState<((value: unknown) => string) | null>(null);
  const needsHint = Boolean(workspace.state.draft && (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && !workspace.state.startRequest && !workspace.state.retrospectiveRequest);
  useEffect(() => {
    if (!needsHint || hashWorkspace) return;
    let active = true;
    void import('@/lib/workout/workspace-hash').then(({ hashWorkoutWorkspace }) => {
      if (active) setHashWorkspace(() => hashWorkoutWorkspace);
    });
    return () => { active = false; };
  }, [hashWorkspace, needsHint]);
  if (needsHint && !hashWorkspace) return null;
  const hint = needsHint && hashWorkspace
    ? { kind: 'draft' as const, version: hashWorkspace(workspace.state) }
    : undefined;
  return <GlobalCoachEntry workspaceHint={hint} contextSlot={props => <Suspense fallback={null}><WorkoutDraftCoachSlot {...props} /></Suspense>} />;
}
