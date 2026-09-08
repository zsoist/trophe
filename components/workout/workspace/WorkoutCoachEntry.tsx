'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';
import { useWorkoutWorkspace } from './WorkoutWorkspaceProvider';

const WorkoutDraftCoachSlot = lazy(() => import('./WorkoutDraftCoachSlot'));

/** Workout owns this entry so draft reviews share the exact persisted workspace provider. */
export function WorkoutCoachEntry() {
  const workspace = useWorkoutWorkspace();
  const source = JSON.stringify(workspace.state);
  const [hashed, setHashed] = useState<{ source: string; version: string } | null>(null);
  const [activated, setActivated] = useState(false);
  const needsHint = Boolean(workspace.state.draft && (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && !workspace.state.startRequest && !workspace.state.retrospectiveRequest);
  useEffect(() => {
    if (!needsHint) return;
    let active = true;
    void import('@/lib/workout/workspace-hash').then(({ hashWorkoutWorkspace }) => {
      if (active) { setHashed({ source, version: hashWorkoutWorkspace(workspace.state) }); setActivated(true); }
    });
    return () => { active = false; };
  }, [needsHint, source, workspace.state]);
  if (needsHint && !activated) return null;
  const hint = needsHint && hashed
    ? { kind: 'draft' as const, version: hashed.version }
    : undefined;
  return <GlobalCoachEntry workspaceHint={hint} contextSlot={props => <Suspense fallback={null}><WorkoutDraftCoachSlot {...props} /></Suspense>} />;
}
