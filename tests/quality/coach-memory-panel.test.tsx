// @vitest-environment jsdom
import React, { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryPanel } from '@/components/assistant/MemoryPanel';
import { MemoryController, type MemoryTransport } from '@/components/assistant/memory-state';
import { I18nProvider } from '@/lib/i18n';
afterEach(cleanup);
it('shows the exact review and requires a second explicit click before applying', async () => {
  const conversationId = crypto.randomUUID(), memoryId = crypto.randomUUID(), proposalId = crypto.randomUUID();
  const controller = new MemoryController(conversationId);
  const operations: string[] = [];
  let stored = false;
  const transport: MemoryTransport = async operation => {
    operations.push(operation.operation);
    if (operation.operation === 'memory.read') return { version: 'coach-assistant.v2', storage: 'database', ok: true, memories: stored ? [{ id: memoryId, text: 'Short morning sessions', createdAt: new Date().toISOString(), version: '0', confirmation: 'confirmed', source: 'user_input', retention: 'persistent', conversationId }] : [], scopeRevision: stored ? '1' : '0', derivedContext: 'excluded' };
    if (operation.operation === 'memory.propose') return { version: 'coach-assistant.v2', storage: 'database', ok: true, proposal: { id: proposalId, hash: 'a'.repeat(64), action: 'memory.confirm', resource: { kind: 'memory', id: memoryId, version: '0' }, before: null, after: operation.after, reviewRequired: true, expiresAt: new Date(Date.now() + 300000).toISOString() } };
    if (operation.operation === 'memory.apply') {
      stored = true;
      return { version: 'coach-assistant.v2', storage: 'database', ok: true, receipt: { id: crypto.randomUUID(), actionId: operation.actionId, proposalId, status: 'applied', resourceVersion: '0', recordedAt: new Date().toISOString() }, refresh: { conversationId, strategy: 'refetch', discardDerivedContext: true, invalidatedMemoryVersions: [] } };
    }
    throw new Error('unexpected');
  };
  function Harness() { const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot); return <MemoryPanel controller={controller} state={state} transport={transport} />; }
  render(<I18nProvider defaultLang="en"><Harness /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Load saved memories' }));
  const input = await screen.findByRole('textbox');
  fireEvent.change(input, { target: { value: 'Short morning sessions' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
  await screen.findByText('After: Short morning sessions');
  expect(operations).toEqual(['memory.read', 'memory.propose']);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Review change');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
  await waitFor(() => expect(controller.snapshot().proposal).toBeNull());
  expect(await screen.findByText('Memory change saved.')).toBeTruthy();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  expect(operations).toEqual(['memory.read', 'memory.propose', 'memory.apply', 'memory.read']);
});
