// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { FoodQuantityController, type FoodTransport } from '@/components/assistant/food-state';
import { FoodQuantityPanel } from '@/components/assistant/FoodQuantityPanel';
import type { FoodEntrySnapshot, FoodQuantityOperation, FoodQuantityProposal, FoodQuantityResult } from '@/agents/coach-assistant/food-contracts';
const id = () => crypto.randomUUID();
const entryId = id(), conversationId = id();
const values = { loggedDate: '2026-09-07', foodName: 'Fixture rice', foodId: null, source: 'natural_language', sourceId: 'turn:fixture', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
const base = { version: 'coach-assistant.v2' as const, storage: 'database' as const, ok: true as const };
function fixture() {
  const controller = new FoodQuantityController();
  let current: FoodEntrySnapshot = { ...values, entryId, version: '1' };
  let proposal: FoodQuantityProposal;
  let saved: FoodQuantityResult;
  const transport = vi.fn<FoodTransport>(async operation => {
    if (operation.operation === 'food.read' || operation.operation === 'food.resolve') return { ...base, snapshot: current };
    if (operation.operation === 'food.propose') {
      proposal = { id: id(), hash: 'a'.repeat(64), action: 'food.quantity.update', resource: { id: entryId, kind: 'food_entry', version: '1' }, before: values,
        after: { ...values, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6 }, expectedVersion: '1', precondition: '1', expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true };
      return { ...base, proposal };
    }
    if (operation.operation === 'food.apply') {
      current = { ...proposal.after, entryId, version: '2' };
      saved = { ...base, receipt: { id: id(), actionId: operation.actionId, proposalId: proposal.id, status: 'applied', resourceVersion: '2', recordedAt: new Date().toISOString() }, refresh: { entryId, loggedDate: values.loggedDate, previousVersion: '1', version: '2', strategy: 'refetch' } };
      return saved;
    }
    return saved;
  });
  return { controller, transport };
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function selected(controller: FoodQuantityController, transport: FoodTransport) {
  controller.select(entryId, conversationId, transport); await Promise.resolve();
}
it('shows the canonical before/after, applies only on confirmation and refreshes the authoritative entry', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport);
  function Harness() { const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot); return <I18nProvider defaultLang="en"><FoodQuantityPanel controller={controller} state={state} transport={transport} /></I18nProvider>; }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '150' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review quantity change' }));
  await screen.findByRole('button', { name: 'Confirm quantity change' });
  expect(screen.getByRole('table').textContent).toContain('250150');
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm quantity change' }));
  await screen.findByText('Quantity saved. Current entry refreshed.');
  expect(controller.snapshot().entry?.grams).toBe(150);
  expect(transport.mock.calls.map(([op]) => op.operation)).toEqual(['food.read', 'food.propose', 'food.apply', 'food.read']);
});
it('retains the same action through a lost response and blocks another entry until receipt recovery', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport); await controller.propose(150, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => { const result = await actual(op, signal); if (op.operation === 'food.apply') throw new Error('lost after commit'); return result; });
  await controller.apply(transport);
  expect(controller.snapshot().uncertain).toBe(true);
  expect(controller.select(id(), conversationId, transport)).toBe(false);
  await controller.check(transport);
  const apply = transport.mock.calls.find(([op]) => op.operation === 'food.apply')![0] as Extract<FoodQuantityOperation, { operation: 'food.apply' }>;
  const lookup = transport.mock.calls.find(([op]) => op.operation === 'food.receipt')![0] as Extract<FoodQuantityOperation, { operation: 'food.receipt' }>;
  expect(lookup.actionId).toBe(apply.actionId); expect(controller.snapshot().entry?.version).toBe('2');
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(1);
});
it('does not reactivate a dismissed model intent after the same entry is selected again', async () => {
  const { controller, transport } = fixture();
  const intentId = 'e'.repeat(64);
  expect(await controller.activate(intentId, conversationId, 250, 150, transport, entryId)).toBe(true);
  expect(controller.snapshot().proposal).not.toBeNull();

  controller.discard();
  expect(controller.snapshot().proposal).toBeNull();
  expect(controller.select(entryId, conversationId, transport)).toBe(true);
  await Promise.resolve();
  expect(await controller.activate(intentId, conversationId, 250, 150, transport, entryId)).toBe(false);
  expect(controller.snapshot().proposal).toBeNull();
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.propose')).toHaveLength(1);
});
it('keeps an unresolved action in its original conversation when receipt status is still unknown', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport); await controller.propose(150, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => {
    const result = await actual(op, signal);
    if (op.operation === 'food.apply') throw new Error('lost after commit');
    if (op.operation === 'food.receipt') return { version: base.version, storage: base.storage, ok: false, error: 'not_found' };
    return result;
  });
  await controller.apply(transport);
  controller.moveConversation();
  expect(controller.snapshot()).toMatchObject({ entryId, uncertain: true, receipt: null });
  await controller.check(transport);
  expect(controller.snapshot()).toMatchObject({ entryId, uncertain: true, receipt: null, error: 'not_found' });
  expect(controller.select(id(), id(), transport)).toBe(false);
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(1);
});
it('asks for a specific Food selection when deterministic resolution is ambiguous', async () => {
  const controller = new FoodQuantityController();
  const transport = vi.fn<FoodTransport>(async operation => ({ ...base, ok: false, error: operation.operation === 'food.resolve' ? 'ambiguous_selection' : 'invalid_input' }));
  await controller.activate('b'.repeat(64), conversationId, 250, 150, transport, null, '2026-09-07');
  function Harness() { const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot); return <I18nProvider defaultLang="en"><FoodQuantityPanel controller={controller} state={state} transport={transport} /></I18nProvider>; }
  render(<Harness />);
  expect(screen.getByText('More than one 250 g entry matches. Select the food item, then ask again.')).toBeTruthy();
  expect(transport.mock.calls).toHaveLength(1);
  expect(transport.mock.calls[0][0]).toMatchObject({ operation: 'food.resolve', expectedPreviousGrams: 250, loggedDateHint: '2026-09-07' });
  expect(controller.snapshot()).toMatchObject({ entry: null, proposal: null, receipt: null, uncertain: false });
  fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
  expect(controller.snapshot().intentId).toBeNull();
});
it('does not propose from a stale entry when retry resolution becomes ambiguous', async () => {
  const controller = new FoodQuantityController();
  let resolves = 0;
  const transport = vi.fn<FoodTransport>(async operation => {
    if (operation.operation === 'food.resolve') {
      resolves++;
      return resolves === 1 ? { ...base, snapshot: { ...values, entryId, version: '1' } }
        : { ...base, ok: false, error: 'ambiguous_selection' };
    }
    if (operation.operation === 'food.propose') return { ...base, ok: false, error: 'version_conflict' };
    return { ...base, ok: false, error: 'invalid_input' };
  });
  await controller.activate('c'.repeat(64), conversationId, 250, 150, transport, null, '2026-09-07');
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['food.resolve', 'food.propose']);
  await controller.retry(transport);
  expect(controller.snapshot()).toMatchObject({ entry: { entryId }, proposal: null, error: 'ambiguous_selection' });
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['food.resolve', 'food.propose', 'food.resolve']);
});
it('does not continue a late resolve after another entry is selected', async () => {
  const controller = new FoodQuantityController();
  const nextEntryId = id();
  let finishResolve!: (result: FoodQuantityResult) => void;
  const transport = vi.fn<FoodTransport>(operation => {
    if (operation.operation === 'food.resolve') return new Promise(resolve => { finishResolve = resolve; });
    if (operation.operation === 'food.read') return Promise.resolve({ ...base, snapshot: { ...values, entryId: nextEntryId, version: '4' } });
    return Promise.resolve({ ...base, ok: false, error: 'invalid_input' });
  });
  const activating = controller.activate('d'.repeat(64), conversationId, 250, 150, transport, null, '2026-09-07');
  await Promise.resolve();
  expect(controller.select(nextEntryId, conversationId, transport)).toBe(true);
  await Promise.resolve();
  finishResolve({ ...base, snapshot: { ...values, entryId, version: '1' } });
  await activating;
  expect(controller.snapshot()).toMatchObject({ intentId: null, entryId: nextEntryId, entry: { entryId: nextEntryId, version: '4' } });
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['food.resolve', 'food.read']);
});
it('keeps a confirmed receipt and blocks another entry until canonical refetch succeeds', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport); await controller.propose(150, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => op.operation === 'food.read' ? { version: base.version, storage: base.storage, ok: false, error: 'not_found' } : actual(op, signal));
  await controller.apply(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { status: 'applied' } });
  const receiptId = controller.snapshot().receipt!.id;
  const nextId = id();
  expect(controller.select(nextId, conversationId, transport)).toBe(false);
  transport.mockImplementation(actual);
  await controller.check(transport);
  controller.dismiss();
  expect(controller.snapshot().receipts[0]).toMatchObject({ entryId, receipt: { id: receiptId } });
  expect(controller.select(nextId, conversationId, transport)).toBe(true); await Promise.resolve();
  expect(controller.snapshot().receipts[0].receipt.id).toBe(receiptId);
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(1);
});
it('discards late reads and releases timeout resources on identity reset', async () => {
  vi.useFakeTimers();
  const controller = new FoodQuantityController();
  let resolve!: (result: FoodQuantityResult) => void;
  const transport: FoodTransport = () => new Promise(done => { resolve = done; });
  controller.select(entryId, conversationId, transport); controller.reset();
  expect(vi.getTimerCount()).toBe(0);
  resolve({ ...base, snapshot: { ...values, entryId, version: '1' } }); await Promise.resolve();
  expect(controller.snapshot().entry).toBeNull();
});
it('rejects a proposal whose before values differ from the loaded entry', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => { const result = await actual(op, signal); return result.ok && 'proposal' in result ? { ...result, proposal: { ...result.proposal, before: { ...result.proposal.before, grams: 500 } } } : result; });
  await controller.propose(150, transport);
  expect(controller.snapshot()).toMatchObject({ proposal: null, error: 'failed' });
});
it('rejects a proposal that is not bound to the loaded version', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => { const result = await actual(op, signal); return result.ok && 'proposal' in result ? { ...result, proposal: { ...result.proposal, expectedVersion: '2' } } : result; });
  await controller.propose(150, transport);
  expect(controller.snapshot()).toMatchObject({ proposal: null, receipt: null, error: 'failed' });
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(0);
});
it('does not announce success until the receipt is followed by exact canonical readback', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport); await controller.propose(150, transport);
  const actual = transport.getMockImplementation()!;
  let staleRead = true;
  transport.mockImplementation(async (op, signal) => {
    const result = await actual(op, signal);
    if (op.operation === 'food.read' && staleRead && result.ok && 'snapshot' in result && result.snapshot.version === '2') {
      staleRead = false;
      return { ...result, snapshot: { ...result.snapshot, calories: 500 } };
    }
    return result;
  });
  function Harness() { const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot); return <I18nProvider defaultLang="en"><FoodQuantityPanel controller={controller} state={state} transport={transport} /></I18nProvider>; }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm quantity change' }));
  await screen.findByText('Quantity saved. Refreshing the current entry is still pending.');
  expect(controller.snapshot()).toMatchObject({ receipt: { status: 'applied' }, error: 'uncertain', uncertain: false });
  expect(screen.queryByText('Quantity saved. Current entry refreshed.')).toBeNull();
  expect(screen.getByText('Quantity saved. Refreshing the current entry is still pending.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Close saved change' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Check saved change' }));
  expect(await screen.findByText('Quantity saved. Current entry refreshed.')).toBeTruthy();
  expect(transport.mock.calls.filter(([op]) => op.operation === 'food.apply')).toHaveLength(1);
});
