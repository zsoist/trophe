// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { WorkoutSetTransport } from '@/components/assistant/workout-set-state';
import { COACH_WORKOUT_SET_REFRESH } from '@/components/assistant/workout-events';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout/live' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(cleanup);

it('turns a server-bound composer intent into a reviewed correction and emits refresh only after canonical readback', async () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const exerciseId = '33333333-3333-4333-8333-333333333333';
  const setId = '44444444-4444-4444-8444-444444444444';
  const proposalId = '55555555-5555-4555-8555-555555555555';
  const scopeKey = 'a'.repeat(64);
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-08T12:00:00Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey, surface: 'live', screenIncluded: true, language: 'en',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' },
      capabilities: [{ key: 'actions', status: 'available', reason: 'reviewable_workout_set_intent' }],
    },
    output: { answer: 'I found the latest saved set. Review the correction.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    actionIntents: [{ id: 'b'.repeat(64), action: 'workout.set.reps.update', source: 'provider_tool', subjectId: actorId, scopeKey, surface: 'live', target: { selection: 'latest_open_session_set', reps: 10 }, reviewRequired: true }],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  }));
  const before = { sessionId, exerciseId, exerciseName: 'Bench Press', setNumber: 3, reps: 8, weightKg: 80, rpe: null, isWarmup: false, isPr: false };
  const workout = vi.fn<WorkoutSetTransport>(async operation => {
    if (operation.operation === 'set.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, setId, version: '1' } };
    if (operation.operation === 'set.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
      id: proposalId, hash: 'c'.repeat(64), action: 'workout.set.reps.update', resource: { kind: 'workout_set', id: setId, version: '1' }, before, after: { ...before, reps: 10 }, expectedVersion: '1', precondition: '1', expiresAt: '2099-09-08T12:00:00Z', reviewRequired: true,
    } };
    if (operation.operation === 'set.apply') return { version: 'coach-assistant.v2', storage: 'database', ok: true,
      receipt: { id: '66666666-6666-4666-8666-666666666666', actionId: operation.actionId, proposalId, status: 'applied', resourceVersion: '2', recordedAt: '2026-09-08T12:01:00Z' },
      refresh: { setId, sessionId, exerciseId, previousVersion: '1', version: '2', strategy: 'refetch' } };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, reps: 10, setId, version: '2' } };
  });
  const refresh = vi.fn();
  window.addEventListener(COACH_WORKOUT_SET_REFRESH, refresh);
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} workoutSetTransport={workout} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'The last set was wrong. It was 10 reps.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(await screen.findByRole('button', { name: 'Confirm set correction' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm set correction' }));
  expect(await screen.findByText('Set saved and refreshed · 10 reps')).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect((refresh.mock.calls[0][0] as CustomEvent).detail).toEqual({ actorId, setId, sessionId, exerciseId, previousVersion: '1', version: '2', strategy: 'refetch' });
  window.removeEventListener(COACH_WORKOUT_SET_REFRESH, refresh);
});
