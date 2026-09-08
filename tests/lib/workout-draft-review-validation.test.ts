import { describe, expect, it } from 'vitest';
import { actionOperationSchema, coachDraftSchema } from '@/agents/coach-assistant/schema';
import { workoutDraftReviewValidators } from '@/lib/workout/draft-review-validation';
import { readWorkoutDraft } from '@/lib/workout/draft-validation';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

const id = '00000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);
const draft = workoutWorkspaceReducer(createInitialWorkspaceState(), {
  type: 'draft.created', payload: { kind: 'strength', name: 'Push' },
}).draft!;

describe('Workout draft lightweight validation parity', () => {
  it.each([
    { version: 'coach-assistant.v2', operation: 'propose', conversationId: id, turnId: id, action: 'draft.update', resourceVersion: hash, after: draft },
    { version: 'coach-assistant.v2', operation: 'apply', conversationId: id, turnId: id, proposalId: id, hash, actionId: id, resourceVersion: hash },
    { version: 'coach-assistant.v2', operation: 'receipt', conversationId: id, turnId: id, actionId: id },
    { version: 'coach-assistant.v2', operation: 'propose', conversationId: id, turnId: id, action: 'draft.update', resourceVersion: hash, after: { ...draft, name: '' } },
    { version: 'coach-assistant.v2', operation: 'apply', conversationId: id, turnId: id, proposalId: id, hash: 'bad', actionId: id, resourceVersion: hash },
    { version: 'coach-assistant.v2', operation: 'receipt', conversationId: id, turnId: id, actionId: id, extra: true },
  ])('matches the canonical schema for the self-Workout operation subset', value => {
    expect(Boolean(workoutDraftReviewValidators.operation(value))).toBe(actionOperationSchema.safeParse(value).success);
  });

  it.each([
    draft,
    { ...draft, name: '' },
    { ...draft, exercises: [{ exerciseId: 'bench', targetSets: -1, targetReps: '8' }] },
    { ...draft, extra: true },
    null,
  ])('matches the canonical draft boundary', value => {
    expect(Boolean(readWorkoutDraft(value))).toBe(coachDraftSchema.safeParse(value).success);
  });

  it('fails closed for cyclic and oversized drafts', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(readWorkoutDraft(cyclic)).toBeNull();
    expect(readWorkoutDraft({ ...draft, name: 'x'.repeat(6001) })).toBeNull();
  });
});
