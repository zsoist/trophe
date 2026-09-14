// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { FoodTransport } from '@/components/assistant/food-state';
import { COACH_FOOD_REFRESH } from '@/components/assistant/food-events';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/log' }));
const requestConversationMock = vi.hoisted(() => vi.fn());
const requestFoodQuantityMock = vi.hoisted(() => vi.fn());
vi.mock('@/components/assistant/client', () => ({ requestConversation: requestConversationMock }));
vi.mock('@/components/assistant/food-client', () => ({ requestFoodQuantity: requestFoodQuantityMock }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('withdraws an unconfirmed Food proposal when Ask Trophē closes without creating an action', async () => {
  const actorId = '10101010-1010-4010-8010-101010101010';
  const entryId = '20202020-2020-4020-8020-202020202020';
  const before = { loggedDate: '2026-09-09', foodName: 'Arroz', foodId: null, source: 'natural_language', sourceId: 'turn:close', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
  const foodMock = vi.fn(async (operation: Record<string, unknown>) => {
    if (operation.operation === 'food.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, entryId, version: '1' } };
    if (operation.operation === 'food.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
      id: '30303030-3030-4030-8030-303030303030', hash: '3'.repeat(64), action: 'food.quantity.update', resource: { kind: 'food_entry', id: entryId, version: '1' }, before,
      after: { ...before, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6 },
      expectedVersion: '1', precondition: '1', expiresAt: '2099-09-09T12:00:00Z', reviewRequired: true,
    } };
    return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'invalid_input' };
  });
  requestFoodQuantityMock.mockImplementation(foodMock);
  const priorFlag = process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = '1';
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} /></I18nProvider>);
  window.dispatchEvent(new CustomEvent('trophe:coach-food-select', { detail: { actorId, entryId } }));
  await screen.findByText('Current entry · 250 g · 500 kcal');
  fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '150' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review quantity change' }));
  expect(await screen.findByRole('button', { name: 'Confirm quantity change' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close Ask Trophē' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByRole('button', { name: 'Confirm quantity change' })).toBeNull();
  expect(foodMock.mock.calls.filter(([operation]) => operation.operation === 'food.apply')).toHaveLength(0);
  if (priorFlag === undefined) delete process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  else process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = priorFlag;
});

it.each([
  ['natural withdrawal', '11111111-aaaa-4111-8111-111111111111', '22222222-bbbb-4222-8222-222222222222', 'Olvídalo, no cambies nada'],
  ['corrected referent', '44444444-dddd-4444-8444-444444444444', '55555555-eeee-4555-8555-555555555555', 'No, me refería a otra comida'],
])('invalidates an unconfirmed Food proposal before a new chat turn: %s', async (_case, actorId, entryId, message) => {
  const scopeKey = '7'.repeat(64);
  const before = { loggedDate: '2026-09-09', foodName: 'Arroz', foodId: null, source: 'natural_language', sourceId: 'turn:withdraw', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-09T12:00:00Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey, surface: 'food', screenIncluded: true, language: 'es',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-09', end: '2026-09-09', days: 1, timezone: 'UTC' },
      capabilities: [{ key: 'actions', status: 'available', reason: 'reviewable_food_quantity_intent' }],
    },
    output: { answer: 'No guardé el cambio.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [], actionIntents: [],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  }));
  const foodMock = vi.fn(async (operation: Record<string, unknown>) => {
    if (operation.operation === 'food.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, entryId, version: '1' } };
    if (operation.operation === 'food.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
      id: '33333333-cccc-4333-8333-333333333333', hash: '8'.repeat(64), action: 'food.quantity.update', resource: { kind: 'food_entry', id: entryId, version: '1' }, before,
      after: { ...before, grams: 120, calories: 240, proteinG: 4.8, carbsG: 48, fatG: 2.4, fiberG: 0.96, sugarG: 0.48 },
      expectedVersion: '1', precondition: '1', expiresAt: '2099-09-09T12:00:00Z', reviewRequired: true,
    } };
    return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'invalid_input' };
  });
  const priorFlag = process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = '1';
  requestConversationMock.mockImplementationOnce(conversation);
  requestFoodQuantityMock.mockImplementation(foodMock);
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} /></I18nProvider>);
  window.dispatchEvent(new CustomEvent('trophe:coach-food-select', { detail: { actorId, entryId } }));
  await screen.findByText('Current entry · 250 g · 500 kcal');
  fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '120' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review quantity change' }));
  expect(await screen.findByRole('button', { name: 'Confirm quantity change' })).toBeTruthy();
  const question = screen.getByRole('textbox', { name: 'Your question' });
  expect(question.hasAttribute('disabled')).toBe(false);
  fireEvent.change(question, { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('No guardé el cambio.');
  expect(screen.queryByRole('button', { name: 'Confirm quantity change' })).toBeNull();
  expect(foodMock.mock.calls.filter(([operation]) => operation.operation === 'food.apply')).toHaveLength(0);
  window.dispatchEvent(new CustomEvent('trophe:coach-food-select', { detail: { actorId, entryId } }));
  await waitFor(() => expect(foodMock.mock.calls.filter(([operation]) => operation.operation === 'food.read')).toHaveLength(2));
  expect(screen.queryByRole('button', { name: 'Confirm quantity change' })).toBeNull();
  if (priorFlag === undefined) delete process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  else process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = priorFlag;
});

it('keeps the authorized contextual Food selection when the model omits its entry hint', async () => {
  const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const entryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const scopeKey = '1'.repeat(64);
  const before = { loggedDate: '2026-09-08', foodName: 'Arroz', foodId: null, source: 'natural_language', sourceId: 'turn:contextual', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
  requestConversationMock.mockImplementationOnce(async (request: CoachConversationRequest) => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-09T12:00:00Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey, surface: 'food', screenIncluded: true, language: 'es',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-09', end: '2026-09-09', days: 1, timezone: 'UTC' },
      capabilities: [{ key: 'actions', status: 'available', reason: 'reviewable_food_quantity_intent' }],
    },
    output: { answer: 'Revisa el cambio.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    actionIntents: [{ id: '2'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: actorId, scopeKey, surface: 'food', target: { selection: 'authorized_food_entry', entryHintId: null, previousGrams: 250, grams: 150 }, reviewRequired: true }],
    telemetry: { model: 'gpt-5.6-luna', provider: 'openai', promptVersion: 'test', modelCalls: 1, dataReads: 0, tokensIn: 1, tokensOut: 1, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  }));
  const foodMock = vi.fn(async (operation: Record<string, unknown>) => {
    if (operation.operation === 'food.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, entryId, version: '1' } };
    if (operation.operation === 'food.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: operation.entryHintId === entryId ? 'test_expected_proposal' : 'not_found' };
    return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'invalid_input' };
  });
  requestFoodQuantityMock.mockImplementation(foodMock);
  const priorFlag = process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = '1';
  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} foodTransport={foodMock as unknown as FoodTransport} /></I18nProvider>);
  window.dispatchEvent(new CustomEvent('trophe:coach-food-select', { detail: { actorId, entryId } }));
  await waitFor(() => expect(foodMock).toHaveBeenCalledWith(expect.objectContaining({ operation: 'food.read', entryId }), expect.any(AbortSignal)));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Fueron 150 gramos, no 250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await waitFor(() => expect(requestConversationMock).toHaveBeenCalledTimes(1));
  expect(requestConversationMock.mock.calls[0][0].context).toMatchObject({
    surface: 'food', includeScreen: true, entity: { kind: 'meal', id: entryId },
  });
  await waitFor(() => expect(foodMock).toHaveBeenCalledWith(expect.objectContaining({ operation: 'food.resolve' }), expect.any(AbortSignal)));
  const resolve = foodMock.mock.calls.find(([operation]) => operation.operation === 'food.resolve')?.[0];
  expect(resolve).toMatchObject({ entryHintId: entryId, expectedPreviousGrams: 250 });
  expect(resolve).not.toHaveProperty('loggedDateHint');
  if (priorFlag === undefined) delete process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED;
  else process.env.NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED = priorFlag;
});

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
    actionIntents: request.message === '¿Qué cambió?' ? [] : [{ id: 'b'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: actorId, scopeKey, surface: 'food', target: { selection: 'authorized_food_entry', entryHintId: entryId, previousGrams: 250, grams: 150 }, reviewRequired: true }] as never[],
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
  expect(foodMock.mock.calls[0][0]).toMatchObject({ operation: 'food.resolve', entryHintId: entryId, expectedPreviousGrams: 250 });
  expect(foodMock.mock.calls[0][0]).not.toHaveProperty('loggedDateHint');
  expect(screen.getByRole('table').textContent).toContain('250150');
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(false);
  expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm quantity change' }));
  expect(await screen.findByText('Quantity saved. Current entry refreshed.')).toBeTruthy();
  expect(foodMock.mock.calls.map(([operation]) => operation.operation)).toEqual(['food.resolve', 'food.propose', 'food.apply', 'food.read']);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect((refresh.mock.calls[0][0] as CustomEvent).detail).toEqual({ actorId, entryId });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: '¿Qué cambió?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(2));
  expect(conversation.mock.calls[1][0].context).toMatchObject({
    surface: 'food', includeScreen: true, entity: { kind: 'meal', id: entryId },
    foodReceipt: { entryId, actionId: expect.any(String) },
  });
  window.removeEventListener(COACH_FOOD_REFRESH, refresh);
});

it('preserves an uncertain Food action across shell unmount and recovers without reapplying', async () => {
  const actorId = '55555555-5555-4555-8555-555555555555';
  const entryId = '66666666-6666-4666-8666-666666666666';
  const proposalId = '77777777-7777-4777-8777-777777777777';
  const scopeKey = 'd'.repeat(64);
  const before = { loggedDate: '2026-09-08', foodName: 'Arroz', foodId: null, source: 'natural_language', sourceId: 'turn:remount', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
  const after = { ...before, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6 };
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-08T12:00:00Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey, surface: 'food', screenIncluded: true, language: 'es',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-08', end: '2026-09-08', days: 1, timezone: 'UTC' },
      capabilities: [{ key: 'actions', status: 'available', reason: 'reviewable_food_quantity_intent' }],
    },
    output: { answer: 'Revisa el cambio.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    actionIntents: [{ id: 'e'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: actorId, scopeKey, surface: 'food', target: { selection: 'authorized_food_entry', entryHintId: entryId, previousGrams: 250, grams: 150 }, reviewRequired: true }] as never[],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  }));
  let actionId = '';
  const foodMock = vi.fn(async (operation: Record<string, unknown>) => {
    if (operation.operation === 'food.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...before, entryId, version: '1' } };
    if (operation.operation === 'food.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: {
      id: proposalId, hash: 'f'.repeat(64), action: 'food.quantity.update', resource: { kind: 'food_entry', id: entryId, version: '1' }, before, after,
      expectedVersion: '1', precondition: '1', expiresAt: '2099-09-08T12:00:00Z', reviewRequired: true,
    } };
    if (operation.operation === 'food.apply') { actionId = String(operation.actionId); throw new Error('lost after commit'); }
    if (operation.operation === 'food.receipt') return { version: 'coach-assistant.v2', storage: 'database', ok: true,
      receipt: { id: '88888888-8888-4888-8888-888888888888', actionId, proposalId, status: 'applied', resourceVersion: '2', recordedAt: '2026-09-08T12:01:00Z' },
      refresh: { entryId, loggedDate: '2026-09-08', previousVersion: '1', version: '2', strategy: 'refetch' } };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...after, entryId, version: '2' } };
  });
  const first = render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} foodTransport={foodMock as unknown as FoodTransport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Fueron 150 gramos, no 250' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm quantity change' }));
  expect(await screen.findByRole('button', { name: 'Check saved change' })).toBeTruthy();
  first.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity="99999999-9999-4999-8999-999999999999" example={conversation} foodTransport={foodMock as unknown as FoodTransport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByRole('button', { name: 'Check saved change' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(false);
  first.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} foodTransport={foodMock as unknown as FoodTransport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.getByRole('button', { name: 'Check saved change' })).toBeTruthy();
  first.unmount();

  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} foodTransport={foodMock as unknown as FoodTransport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.getByRole('button', { name: 'Check saved change' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Check saved change' }));
  expect(await screen.findByText('Quantity saved. Current entry refreshed.')).toBeTruthy();
  expect(foodMock.mock.calls.filter(([operation]) => operation.operation === 'food.apply')).toHaveLength(1);
  expect(foodMock.mock.calls.filter(([operation]) => operation.operation === 'food.receipt')).toHaveLength(1);
});
