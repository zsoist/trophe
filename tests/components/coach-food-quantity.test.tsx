// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { FoodQuantityController, type FoodTransport } from '@/components/assistant/food-state';
import { FoodQuantityPanel } from '@/components/assistant/FoodQuantityPanel';
import type { FoodQuantityOperation, FoodQuantityProposal, FoodQuantityResult } from '@/agents/coach-assistant/food-contracts';
const id = () => crypto.randomUUID();
const entryId = id(), conversationId = id();
const values = { loggedDate: '2026-09-07', foodName: 'Fixture rice', grams: 250, quantity: 1, calories: 500, proteinG: 10, carbsG: 100, fatG: 5, fiberG: 2, sugarG: 1 };
const base = { version: 'coach-assistant.v2' as const, storage: 'database' as const, ok: true as const };
function fixture() {
  const controller = new FoodQuantityController();
  let current = { ...values, entryId, version: '1' };
  let proposal: FoodQuantityProposal;
  let saved: FoodQuantityResult;
  const transport = vi.fn<FoodTransport>(async operation => {
    if (operation.operation === 'food.read') return { ...base, snapshot: current };
    if (operation.operation === 'food.propose') {
      proposal = { id: id(), hash: 'a'.repeat(64), action: 'food.quantity.update', resource: { id: entryId, kind: 'food_entry', version: '1' }, before: values,
        after: { ...values, grams: 150, calories: 300, proteinG: 6, carbsG: 60, fatG: 3, fiberG: 1.2, sugarG: 0.6 }, precondition: '1', expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true };
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
it('keeps a confirmed historical receipt but permits another entry when refetch returns not found', async () => {
  const { controller, transport } = fixture(); await selected(controller, transport); await controller.propose(150, transport);
  const actual = transport.getMockImplementation()!;
  transport.mockImplementation(async (op, signal) => op.operation === 'food.read' ? { version: base.version, storage: base.storage, ok: false, error: 'not_found' } : actual(op, signal));
  await controller.apply(transport);
  expect(controller.snapshot()).toMatchObject({ uncertain: false, receipt: { status: 'applied' } });
  const receiptId = controller.snapshot().receipt!.id;
  controller.dismiss();
  expect(controller.snapshot().receipts[0]).toMatchObject({ entryId, receipt: { id: receiptId } });
  const nextId = id();
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
