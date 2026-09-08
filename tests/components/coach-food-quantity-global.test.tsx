// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { FoodTransport } from '@/components/assistant/food-state';
import { COACH_FOOD_REFRESH } from '@/components/assistant/food-events';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/log' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(cleanup);

it('turns an explicit Food correction into review, receipt, canonical readback and visible refresh', async () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const entryId = '22222222-2222-4222-8222-222222222222';
  const proposalId = '33333333-3333-4333-8333-333333333333';
  const scopeKey = 'a'.repeat(64);
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-08T12:00:00Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey, surface: 'food', screenIncluded: true, language: 'es',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-08', end: '2026-09-08', days: 1, timezone: 'UTC' },
      capabilities: [{ key: 'actions', status: 'available', reason: 'reviewable_food_quantity_intent' }],
    },
    output: { answer: 'Encontré el registro. Revisa el cambio.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    actionIntents: [{ id: 'b'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: actorId, scopeKey, surface: 'food', target: { selection: 'authorized_food_entry', entryHintId: entryId, previousGrams: 250, grams: 150 }, reviewRequired: true }] as never[],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  }));
  const before = { loggedDate: '2026-09-08', foodName: 'Arroz', foodId: null, source: 'natural_language', sourceId: 'turn:fixture', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
  const foodMock = vi.fn(async (operation: Record<string, unknown>) => {
    if (operation.operation === 'food.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, entryId, version: '1' } };
    if (operation.operation === 'food.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
      id: proposalId, hash: 'c'.repeat(64), action: 'food.quantity.update', resource: { kind: 'food_entry', id: entryId, version: '1' }, before,
      after: { ...before, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6 },
      expectedVersion: '1', precondition: '1', expiresAt: '2099-09-08T12:00:00Z', reviewRequired: true,
    } };
    if (operation.operation === 'food.apply') return { version: 'coach-assistant.v2', storage: 'database', ok: true,
      receipt: { id: '44444444-4444-4444-8444-444444444444', actionId: operation.actionId, proposalId, status: 'applied', resourceVersion: '2', recordedAt: '2026-09-08T12:01:00Z' },
      refresh: { entryId, loggedDate: '2026-09-08', previousVersion: '1', version: '2', strategy: 'refetch' } };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6, entryId, version: '2' } };
  });
  const food = foodMock as unknown as FoodTransport;
  const refresh = vi.fn();
  window.addEventListener(COACH_FOOD_REFRESH, refresh);
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} foodTransport={food} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Fueron 150 gramos, no 250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(await screen.findByRole('button', { name: 'Confirm quantity change' })).toBeTruthy();
  expect(foodMock.mock.calls[0][0]).toMatchObject({ operation: 'food.resolve', entryHintId: entryId, loggedDateHint: '2026-09-08', expectedPreviousGrams: 250 });
  expect(screen.getByRole('table').textContent).toContain('250150');
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm quantity change' }));
  expect(await screen.findByText('Quantity saved. Current entry refreshed.')).toBeTruthy();
  expect(foodMock.mock.calls.map(([operation]) => operation.operation)).toEqual(['food.resolve', 'food.propose', 'food.apply', 'food.read']);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect((refresh.mock.calls[0][0] as CustomEvent).detail).toEqual({ actorId, entryId });
  window.removeEventListener(COACH_FOOD_REFRESH, refresh);
});
