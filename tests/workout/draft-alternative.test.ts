import { expect, it } from 'vitest';
import { acceptedWorkoutDraftIntent, buildWorkoutDraftAlternative } from '@/lib/workout/draft-alternative';
import { hashWorkoutWorkspace } from '@/lib/workout/workspace-hash';
import type { StrengthDraft, WorkoutWorkspaceState } from '@/lib/workout/workspace-state';
import type { CoachConversationResponse } from '@/agents/coach-assistant/contracts';

const draft: StrengthDraft = { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [
  { exerciseId: 'barbell-bench', exerciseName: 'Bench Press', muscleGroup: 'chest', targetSets: 5, targetReps: '8-12', restSeconds: 120 },
] };
const catalog = [
  { id: 'barbell-bench', name: 'Bench Press', muscle_group: 'chest' as const, equipment: 'barbell' },
  { id: 'dumbbell-fly', name: 'Dumbbell Flyes', muscle_group: 'chest' as const, equipment: 'dumbbell' },
];
const actor = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const turnId = '00000000-0000-4000-8000-000000000003';
const workspace: WorkoutWorkspaceState = { stage: 'draft', draft, sessionId: null, clock: null, clientRequestId: null };

function response(): CoachConversationResponse {
  return {
    version: 'coach-assistant.v2', conversationId, turnId, ok: true, mode: 'model', dataSource: 'authorized_records',
    snapshot: { id: 'snapshot', capturedAt: '2026-09-08T08:00:00Z', subjectId: actor, organizationId: 'self', actorRole: 'client', access: 'self', scopeKey: 'a'.repeat(64), surface: 'plan', screenIncluded: true, window: { start: '2026-09-08', end: '2026-09-08', days: 1, timezone: 'UTC' }, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, capabilities: [] },
    actionIntents: [{ id: 'b'.repeat(64), action: 'draft.update', source: 'provider_tool', subjectId: actor, scopeKey: 'a'.repeat(64), surface: 'plan', resource: { kind: 'draft', id: actor, version: hashWorkoutWorkspace(workspace) }, target: { durationMinutes: 35, equipment: ['dumbbells'] }, reviewRequired: true }],
    evidence: [], proposals: [], receipts: [], attachments: [],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
  };
}

it('builds a reviewable alternative without mutating the source draft', () => {
  const after = buildWorkoutDraftAlternative(draft, catalog, { durationMinutes: 35, equipment: ['dumbbells'] }, 2)!;
  expect(after).toMatchObject({ name: 'Push · 35 min · Dumbbells', updatedAt: 2, exercises: [{ exerciseId: 'dumbbell-fly', exerciseName: 'Dumbbell Flyes', targetSets: 3, restSeconds: 60 }] });
  expect(draft).toMatchObject({ name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'barbell-bench', targetSets: 5, restSeconds: 120 }] });
});

it('refuses a dumbbell claim when the authorized catalogue has no complete replacement', () => {
  expect(buildWorkoutDraftAlternative(draft, catalog.slice(0, 1), { durationMinutes: 35, equipment: ['dumbbells'] }, 2)).toBeNull();
});

it('accepts one intent bound to the current conversation turn, plan surface and workspace', () => {
  expect(acceptedWorkoutDraftIntent(response(), actor, conversationId, turnId, 'plan', workspace)?.target).toEqual({ durationMinutes: 35, equipment: ['dumbbells'] });
});

it.each([
  ['cancelled response', (value: CoachConversationResponse) => { value.ok = false; }],
  ['wrong turn', (value: CoachConversationResponse) => { value.turnId = crypto.randomUUID(); }],
  ['foreign subject', (value: CoachConversationResponse) => { value.snapshot!.subjectId = crypto.randomUUID(); }],
  ['scope mismatch', (value: CoachConversationResponse) => { value.actionIntents![0].scopeKey = 'c'.repeat(64); }],
  ['stale workspace', (value: CoachConversationResponse) => { value.actionIntents![0].resource.version = 'd'.repeat(64); }],
  ['surface mismatch', (value: CoachConversationResponse) => { value.actionIntents![0].surface = 'workout'; }],
] as const)('rejects %s before a proposal can be materialized', (_name, mutate) => {
  const value = response();
  mutate(value);
  expect(acceptedWorkoutDraftIntent(value, actor, conversationId, turnId, 'plan', workspace)).toBeNull();
});
