// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';

const actor = '00000000-0000-4000-8000-000000000001';
const requestConversation = vi.hoisted(() => vi.fn(async (request: { conversationId: string; turnId: string; context?: { surface?: string; workspace?: { version: string } } }) => ({
  version: 'coach-assistant.v2' as const, conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'model' as const, dataSource: 'authorized_records' as const,
  snapshot: { id: 'snapshot', capturedAt: '2026-09-08T08:00:00Z', subjectId: actor, organizationId: 'self', actorRole: 'client' as const, access: 'self' as const, scopeKey: 'a'.repeat(64), surface: 'plan' as const, screenIncluded: true, window: { start: '2026-09-08', end: '2026-09-08', days: 1, timezone: 'UTC' }, language: 'en', units: { weight: 'kg' as const, energy: 'kcal' as const, protein: 'g' as const }, capabilities: [{ key: 'actions' as const, status: 'available' as const, reason: 'reviewable_draft_intent' }] },
  profile: { language: 'en', timezone: 'UTC', units: { weight: 'kg' as const, energy: 'kcal' as const, protein: 'g' as const }, preferences: { durationMinutes: 30 as const }, version: 'profile-v1', source: 'authorized_profile' as const },
  output: { answer: 'I prepared a 35-minute dumbbell alternative for review.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
  evidence: [], proposals: [], actionIntents: [{ id: 'b'.repeat(64), action: 'draft.update' as const, source: 'provider_tool' as const, subjectId: actor, scopeKey: 'a'.repeat(64), surface: 'plan' as const, resource: { kind: 'draft' as const, id: actor, version: request.context?.workspace?.version ?? '' }, target: { durationMinutes: 35, equipment: ['dumbbells'] as ['dumbbells'] }, reviewRequired: true as const }], receipts: [], attachments: [], telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
})));

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout/build' }));
vi.mock('@/components/assistant/client', () => ({ requestConversation }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: actor } }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(async () => ({ data: [
    { id: 'bench-press', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' },
    { id: 'dumbbell-flyes', name: 'Dumbbell Flyes', muscle_group: 'chest', equipment: 'dumbbell' },
  ], error: null })) })) })),
} }));

import { WorkoutCoachEntry } from '@/components/workout/workspace/WorkoutCoachEntry';

beforeEach(() => { process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED = '1'; HTMLElement.prototype.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); delete process.env.NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED; requestConversation.mockClear(); });

function DraftHarness() {
  const workspace = useWorkoutWorkspace();
  return <>
    <button onClick={() => { workspace.createDraft({ name: 'Push', kind: 'strength' }); workspace.addDraftExercise('bench-press'); }}>Create draft</button>
    <output data-testid="draft">{workspace.state.draft?.name}:{workspace.state.draft?.kind === 'strength' ? `${workspace.state.draft.exercises[0]?.exerciseId}:${workspace.state.draft.exercises[0]?.targetSets}` : ''}</output>
    <WorkoutCoachEntry />
  </>;
}

it('turns the accepted composer message into review, then applies one receipt to the source draft', async () => {
  render(<I18nProvider defaultLang="en"><WorkoutWorkspaceProvider userId={actor} storage={{ getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }}><DraftHarness /></WorkoutWorkspaceProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'I only have 35 minutes and dumbbells.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('I prepared a 35-minute dumbbell alternative for review.');
  expect(requestConversation.mock.calls[0][0].context?.workspace?.version).toMatch(/^[a-f0-9]{64}$/);
  expect(requestConversation.mock.calls[0][0].context?.surface).toBe('plan');
  fireEvent.click(screen.getByText('Your profile & memory'));
  expect(await screen.findByRole('button', { name: 'Confirm change' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'After' }).textContent).toContain('Push · 35 min · Dumbbells');
  expect(screen.getByRole('region', { name: 'After' }).textContent).toContain('Dumbbell Flyes');
  expect(screen.getByTestId('draft').textContent).toBe('Push:bench-press:3');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await screen.findByText('Updated in your private Workout draft.');
  expect(screen.getByTestId('draft').textContent).toBe('Push · 35 min · Dumbbells:dumbbell-flyes:3');
});
