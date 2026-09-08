'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';
import type { CoachContextSlot } from '@/components/assistant/GlobalCoach';
import type { PreferenceTransport } from '@/components/assistant/preference-state';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { hashWorkoutWorkspace } from '@/lib/workout/workspace-hash';
import { acceptedWorkoutDraftIntent, buildWorkoutDraftAlternative, type DraftAlternativeExercise } from '@/lib/workout/draft-alternative';
import { supabase } from '@/lib/supabase';
import { WorkoutDraftCoachControls } from '@/components/assistant/WorkoutDraftCoachControls';
import { useWorkoutWorkspace } from './WorkoutWorkspaceProvider';

function WorkoutDraftSlot(props: Parameters<CoachContextSlot>[0]) {
  const workspace = useWorkoutWorkspace();
  const attempted = useRef(new Set<string>());
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
  const intent = acceptedWorkoutDraftIntent(props.response, props.identity, props.conversationId, props.turnId, props.surface, workspace.state);
  useEffect(() => {
    if (!intent || props.state.pending || props.state.uncertain || props.state.proposal || props.state.receipt || attempted.current.has(intent.id)) return;
    attempted.current.add(intent.id);
    let active = true;
    void supabase.from('exercises').select('id, name, muscle_group, equipment').order('name').then(({ data, error }) => {
      if (!active || error || !Array.isArray(data)) return;
      const catalogue = data.filter(item => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string'
        && (item.muscle_group === null || typeof item.muscle_group === 'string') && (item.equipment === null || typeof item.equipment === 'string'))) as DraftAlternativeExercise[];
      const current = workspace.state;
      if (hashWorkoutWorkspace(current) !== intent.resource.version || !current.draft) return;
      const after = buildWorkoutDraftAlternative(current.draft, catalogue, intent.target, Date.now());
      if (after) void props.controller.proposeDraft(props.conversationId, intent.resource.version, after, transport);
    });
    return () => { active = false; };
  }, [intent, props.controller, props.conversationId, props.state.pending, props.state.proposal, props.state.receipt, props.state.uncertain, transport, workspace.state]);
  return <WorkoutDraftCoachControls {...props} transport={transport} allowDirectProposal />;
}

/** Workout owns this entry so draft reviews share the exact persisted workspace provider. */
export function WorkoutCoachEntry() {
  const workspace = useWorkoutWorkspace();
  const hint = workspace.state.draft && (workspace.state.stage === 'draft' || workspace.state.stage === 'review')
    && !workspace.state.startRequest && !workspace.state.retrospectiveRequest
    ? { kind: 'draft' as const, version: hashWorkoutWorkspace(workspace.state) }
    : undefined;
  return <GlobalCoachEntry workspaceHint={hint} contextSlot={props => <WorkoutDraftSlot {...props} />} />;
}
