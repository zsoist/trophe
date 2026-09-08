// @vitest-environment jsdom

import React, { act, useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import { WorkoutSetPanel } from '@/components/assistant/WorkoutSetPanel';
import { WorkoutSetController, type WorkoutSetTransport } from '@/components/assistant/workout-set-state';
import type { WorkoutSetProposal, WorkoutSetSnapshot } from '@/agents/coach-assistant/set-contracts';

const ids = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  exerciseId: '33333333-3333-4333-8333-333333333333',
  setId: '44444444-4444-4444-8444-444444444444',
  proposalId: '55555555-5555-4555-8555-555555555555',
  receiptId: '66666666-6666-4666-8666-666666666666',
};
const setValues = {
  sessionId: ids.sessionId, exerciseId: ids.exerciseId, exerciseName: 'Bench Press',
  setNumber: 3, reps: 8, weightKg: 80, rpe: 8, isWarmup: false, isPr: false,
};
const snapshot: WorkoutSetSnapshot = { setId: ids.setId, ...setValues, version: '1' };
const proposal: WorkoutSetProposal = {
  id: ids.proposalId, hash: 'a'.repeat(64), action: 'workout.set.reps.update',
  resource: { kind: 'workout_set', id: ids.setId, version: '1' },
  before: setValues, after: { ...setValues, reps: 10 }, expectedVersion: '1', precondition: '1',
  expiresAt: '2099-09-08T12:00:00Z', reviewRequired: true,
};

afterEach(cleanup);

function Harness({ controller, transport }: { controller: WorkoutSetController; transport: WorkoutSetTransport }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  return <I18nProvider defaultLang="en"><WorkoutSetPanel controller={controller} state={state} transport={transport} /></I18nProvider>;
}

it('reviews one identified set, preserves actionId after a lost apply response and renders canonical readback', async () => {
  const controller = new WorkoutSetController();
  let applyActionId = '';
  const transport = vi.fn<WorkoutSetTransport>(async operation => {
    if (operation.operation === 'set.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot };
    if (operation.operation === 'set.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal };
    if (operation.operation === 'set.apply') { applyActionId = operation.actionId; throw new Error('response_lost'); }
    if (operation.operation === 'set.receipt') return {
      version: 'coach-assistant.v2', storage: 'database', ok: true,
      receipt: { id: ids.receiptId, actionId: operation.actionId, proposalId: ids.proposalId, status: 'applied', resourceVersion: '2', recordedAt: '2026-09-08T12:00:00Z' },
      refresh: { setId: ids.setId, sessionId: ids.sessionId, exerciseId: ids.exerciseId, previousVersion: '1', version: '2', strategy: 'refetch' },
    };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...snapshot, reps: 10, version: '2' } };
  });
  render(<Harness controller={controller} transport={transport} />);
  await act(() => controller.activate('b'.repeat(64), ids.conversationId, 10, transport));
  expect(screen.getByText('Bench Press · Set 3 · 80 kg')).toBeTruthy();
  expect(screen.getByRole('table').textContent).toContain('810');
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['set.resolve', 'set.propose']);

  fireEvent.click(screen.getByRole('button', { name: 'Confirm set correction' }));
  expect(await screen.findByRole('button', { name: 'Check saved correction' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Check saved correction' }));
  expect(await screen.findByText('Set saved and refreshed · 10 reps')).toBeTruthy();
  const receipt = transport.mock.calls.find(([operation]) => operation.operation === 'set.receipt')![0];
  expect(receipt.operation === 'set.receipt' && receipt.actionId).toBe(applyActionId);
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual(['set.resolve', 'set.propose', 'set.apply', 'set.receipt', 'set.read']);
});

it('fails closed when the server cannot select exactly one open workout and never proposes', async () => {
  const controller = new WorkoutSetController();
  const transport = vi.fn<WorkoutSetTransport>(async () => ({ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'ambiguous_selection' }));
  render(<Harness controller={controller} transport={transport} />);
  await act(() => controller.activate('c'.repeat(64), ids.conversationId, 10, transport));
  expect(screen.getByRole('status').textContent).toContain('More than one session or set could match');
  expect(screen.queryByRole('button', { name: 'Confirm set correction' })).toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
});

it('replays the exact reviewed action after a missing receipt without creating a second action', async () => {
  const controller = new WorkoutSetController();
  let firstApply: Extract<import('@/agents/coach-assistant/set-contracts').WorkoutSetOperation, { operation: 'set.apply' }> | null = null;
  let applyCalls = 0;
  const transport = vi.fn<WorkoutSetTransport>(async operation => {
    if (operation.operation === 'set.resolve') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot };
    if (operation.operation === 'set.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal };
    if (operation.operation === 'set.apply') {
      applyCalls += 1;
      if (!firstApply) { firstApply = structuredClone(operation); throw new Error('request_never_arrived'); }
      expect(operation).toEqual(firstApply);
      return {
        version: 'coach-assistant.v2', storage: 'database', ok: true,
        receipt: { id: ids.receiptId, actionId: operation.actionId, proposalId: ids.proposalId, status: 'applied', resourceVersion: '2', recordedAt: '2026-09-08T12:00:00Z' },
        refresh: { setId: ids.setId, sessionId: ids.sessionId, exerciseId: ids.exerciseId, previousVersion: '1', version: '2', strategy: 'refetch' },
      };
    }
    if (operation.operation === 'set.receipt') return { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' };
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { ...snapshot, reps: 10, version: '2' } };
  });
  render(<Harness controller={controller} transport={transport} />);
  await act(() => controller.activate('d'.repeat(64), ids.conversationId, 10, transport));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm set correction' }));
  expect(await screen.findByRole('button', { name: 'Check saved correction' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Check saved correction' }));
  expect(await screen.findByText('Set saved and refreshed · 10 reps')).toBeTruthy();
  expect(applyCalls).toBe(2);
  expect(transport.mock.calls.map(([operation]) => operation.operation)).toEqual([
    'set.resolve', 'set.propose', 'set.apply', 'set.receipt', 'set.apply', 'set.read',
  ]);
});
