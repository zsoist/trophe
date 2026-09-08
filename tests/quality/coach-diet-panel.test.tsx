// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DietPanel } from '@/components/assistant/DietPanel';
import { DietController, type DietTransport } from '@/components/assistant/diet-state';
import { I18nProvider } from '@/lib/i18n';
afterEach(cleanup);
it('starts undeclared, reviews the exact preference and updates the selector after confirmation', async () => {
  const profileId = crypto.randomUUID(), proposalId = crypto.randomUUID();
  const controller = new DietController();
  const operations: string[] = [];
  let applied = false;
  const transport: DietTransport = async operation => {
    operations.push(operation.operation);
    if (operation.operation === 'diet.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { profileId, version: applied ? '1' : '0', preferences: { version: 1, dietPattern: applied ? 'vegan' : null } } };
    if (operation.operation === 'diet.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { id: proposalId, hash: 'a'.repeat(64), action: 'food.preference.update', resource: { kind: 'food_preference', id: profileId, version: '0' }, before: { version: 1, dietPattern: null }, after: operation.after, precondition: 'b'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString(), reviewRequired: true } };
    if (operation.operation === 'diet.apply') { applied = true; return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: crypto.randomUUID(), proposalId, actionId: operation.actionId, status: 'applied', resourceVersion: '1', recordedAt: new Date().toISOString() }, refresh: { profileId, previousVersion: '0', version: '1', strategy: 'refetch', discardDerivedContext: true } }; }
    throw new Error('unexpected');
  };
  controller.select(profileId, crypto.randomUUID(), transport);
  function Harness() { const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot); return <DietPanel controller={controller} state={state} transport={transport} />; }
  render(<I18nProvider defaultLang="en"><Harness /></I18nProvider>);
  const select = await screen.findByRole('combobox');
  expect((select as HTMLSelectElement).value).toBe('');
  expect((screen.getByRole('button', { name: 'Review change' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(select, { target: { value: 'vegan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  await screen.findByText('Before: Not specified'); await screen.findByText('After: Vegan');
  expect(operations).toEqual(['diet.read', 'diet.propose']);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(controller.snapshot().proposal).toBeNull());
  expect(await screen.findByText('Diet preference saved.')).toBeTruthy();
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('vegan');
  expect((screen.getByRole('button', { name: 'Review change' }) as HTMLButtonElement).disabled).toBe(true);
  expect(operations).toEqual(['diet.read', 'diet.propose', 'diet.apply', 'diet.read']);
});
